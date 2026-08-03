import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ScrollText, Download, FileSpreadsheet, Eye } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, formatTime } from '@/lib/time-utils';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  useOrgAccountabilityReports,
  useEmployeeAccountabilityReports,
  POLICY_LABELS,
  type AccountabilityReport,
  type PolicyKind,
} from '@/hooks/useAccountability';
import AccountabilityAuditTimeline from './AccountabilityAuditTimeline';
import ReportsAnalyst from './ReportsAnalyst';


function RecordRow({ r, who }: { r: AccountabilityReport; who?: string }) {
  return (
    <div className="space-y-1 border-b p-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {who ? `${who} · ` : ''}
          {POLICY_LABELS[r.kind] ?? r.kind}
        </span>
        <Badge variant="secondary">
          Closed {r.closed_at ? formatDate(r.closed_at.slice(0, 10)) : ''}
        </Badge>
      </div>
      <p className="text-sm">{r.summary}</p>
      {r.member_reason && (
        <p className="text-sm text-muted-foreground">
          “{r.member_reason}” — signed {r.member_signed_name}
          {r.member_signed_at ? ` on ${formatDate(r.member_signed_at.slice(0, 10))}` : ''}
        </p>
      )}
      {r.manager_note && (
        <p className="text-sm text-muted-foreground">
          Review: {r.manager_note} — signed {r.manager_signed_name}
          {r.manager_signed_at ? ` on ${formatDate(r.manager_signed_at.slice(0, 10))}` : ''}
        </p>
      )}
      <div className="pt-2">
        <AccountabilityAuditTimeline report={r} />
      </div>
    </div>
  );
}

/** Permanent record — closed accountability records, org-wide or per employee. */
export default function AccountabilityHistory({ employeeId }: { employeeId?: string }) {
  const orgQuery = useOrgAccountabilityReports(!employeeId);
  const empQuery = useEmployeeAccountabilityReports(employeeId);
  const { data: employees } = useOrgEmployees();
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState<'all' | PolicyKind>('all');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [pendingFormat, setPendingFormat] = useState<'csv' | 'xlsx' | null>(null);


  const nameByUser = useMemo(() => {
    const m = new Map<string, string>();
    (employees ?? []).forEach(e => {
      if (e.user_id) m.set(e.user_id, e.preferred_name || e.display_name);
    });
    return m;
  }, [employees]);

  const source = employeeId ? empQuery.data : orgQuery.data ?? [];
  const closed = (source ?? []).filter(r => {
    if (r.status !== 'closed') return false;
    if (kind !== 'all' && r.kind !== kind) return false;
    const day = (r.closed_at ?? r.created_at).slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });

  const EXPORT_HEADER = [
    'Team member',
    'Kind',
    'Period start',
    'Period end',
    'Summary',
    'Member reason',
    'Member signed by',
    'Member signed at',
    'Manager note',
    'Reviewer',
    'Signed timestamp',
    'Escalated timestamp',
    'Closed at',
  ];

  const formatTimestamp = (iso: string | null | undefined) =>
    iso ? `${formatDate(iso)} ${formatTime(iso)}` : '';

  /** Same column mapping for every export format. */
  const buildRows = () =>
    closed.map(r => [
      nameByUser.get(r.subject_user_id ?? '') ?? '',
      POLICY_LABELS[r.kind] ?? r.kind,
      r.period_start,
      r.period_end,
      r.summary,
      r.member_reason,
      r.member_signed_name,
      formatTimestamp(r.member_signed_at),
      r.manager_note,
      r.manager_signed_name,
      formatTimestamp(r.manager_signed_at),
      formatTimestamp(r.escalated_at),
      formatTimestamp(r.closed_at),
    ]);


  const baseName = `accountability-records-${kind}-${from || 'start'}-to-${to || 'today'}`;

  const download = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${closed.length} record${closed.length === 1 ? '' : 's'}`);
  };

  /**
   * One file for the whole filtered set — every closed record in the selected
   * range and kind, not a download per card.
   */
  const startPreview = (format: 'csv' | 'xlsx') => {
    if (closed.length === 0) {
      toast.error('Nothing to export in this range.');
      return;
    }
    setPendingFormat(format);
    setPreviewOpen(true);
  };

  const doExportCsv = () => {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = buildRows().map(row => row.map(cell).join(','));
    // BOM so Excel opens accented names correctly.
    const blob = new Blob(['\uFEFF' + [EXPORT_HEADER.map(cell).join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    download(blob, `${baseName}.csv`);
  };

  const doExportXlsx = async () => {
    const XLSX = await import('xlsx');
    const data = [EXPORT_HEADER, ...buildRows().map(row => row.map(v => String(v ?? '')))];
    const sheet = XLSX.utils.aoa_to_sheet(data);
    sheet['!cols'] = EXPORT_HEADER.map((h, i) => ({
      wch: Math.min(50, Math.max(h.length + 2, ...data.map(r => String(r[i] ?? '').length + 2))),
    }));
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, sheet, 'Closed records');
    const out = XLSX.write(book, { bookType: 'xlsx', type: 'array' });
    download(
      new Blob([out], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
      `${baseName}.xlsx`,
    );
  };

  const confirmDownload = () => {
    setPreviewOpen(false);
    if (pendingFormat === 'csv') doExportCsv();
    else if (pendingFormat === 'xlsx') doExportXlsx();
    setPendingFormat(null);
  };




  return (
    <>
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <ScrollText className="h-5 w-5" />
          Accountability record
        </CardTitle>
        {isAdmin && (
          <div className="flex flex-wrap items-end gap-2 pt-3">
            <div>
              <Label className="text-xs">From</Label>
              <Input
                type="date"
                value={from}
                onChange={e => setFrom(e.target.value)}
                className="h-9 w-[150px]"
              />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input
                type="date"
                value={to}
                onChange={e => setTo(e.target.value)}
                className="h-9 w-[150px]"
              />
            </div>
            <div>
              <Label className="text-xs">Kind</Label>
              <Select value={kind} onValueChange={v => setKind(v as 'all' | PolicyKind)}>
                <SelectTrigger className="h-9 w-[190px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All kinds</SelectItem>
                  {Object.entries(POLICY_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={closed.length === 0}
              onClick={() => startPreview('csv')}
              title="Preview and download every record in this range as one CSV"
            >
              <Eye className="mr-2 h-4 w-4" />
              Export CSV ({closed.length})
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-9"
              disabled={closed.length === 0}
              onClick={() => startPreview('xlsx')}
              title="Preview and download every record in this range as one Excel file"
            >
              <Eye className="mr-2 h-4 w-4" />
              Export XLSX ({closed.length})
            </Button>



          </div>
        )}
      </CardHeader>
      <CardContent className="p-0">
        {closed.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            Nothing on file. Records land here once they're signed and closed.
          </p>
        ) : (
          closed.map(r => (
            <RecordRow
              key={r.id}
              r={r}
              who={employeeId ? undefined : nameByUser.get(r.subject_user_id ?? '')}
            />
          ))
        )}
      </CardContent>
    </Card>

      {isAdmin && (
        <ReportsAnalyst from={from} to={to} kind={kind} recordCount={closed.length} />
      )}

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Export preview</DialogTitle>
            <DialogDescription>
              Showing the first 3 of {closed.length} record{closed.length === 1 ? '' : 's'}.
              Dates and times are displayed in Eastern Time.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {EXPORT_HEADER.map(h => (
                    <TableHead key={h} className="whitespace-nowrap text-xs">
                      {h}
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {buildRows()
                  .slice(0, 3)
                  .map((row, i) => (
                    <TableRow key={i}>
                      {row.map((cell, j) => (
                        <TableCell key={j} className="max-w-[200px] truncate text-xs">
                          {String(cell ?? '')}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>
              Cancel
            </Button>
            <Button onClick={confirmDownload}>
              {pendingFormat === 'csv' ? (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download CSV
                </>
              ) : (
                <>
                  <FileSpreadsheet className="mr-2 h-4 w-4" />
                  Download XLSX
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

