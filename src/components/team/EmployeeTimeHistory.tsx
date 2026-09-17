import { useMemo, useState, type ReactNode } from 'react';
import { CalendarDays, Clock, History, Pencil, Plus } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import { AuditHistoryModal } from '@/components/AuditHistoryModal';
import { useEmployeeTimeEntries } from '@/hooks/useEmployees';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { PunchRow } from '@/hooks/useTimeEntries';
import { easternWallMinutes, formatClock, formatDate, formatTime, getToday, minutesToHHMM } from '@/lib/time-utils';

type Attendance = {
  id: string; entry_date: string; status_code: string;
  schedule_expected_start: string | null; minutes_late: number | null;
};
type Entry = NonNullable<ReturnType<typeof useEmployeeTimeEntries>['data']>[number];
type SortValue = string | number | null;
type SortOption<T> = { key: string; label: string; value: (row: T) => SortValue };

const statuses: Record<string, { label: string; className: string }> = {
  ok: { label: 'Arrived', className: 'bg-success/20 text-success' },
  remote_ok: { label: 'Remote', className: 'bg-accent/20 text-accent' },
  late: { label: 'Late', className: 'bg-warning/20 text-warning' },
  absent: { label: 'Absent', className: 'bg-destructive/20 text-destructive' },
  incomplete: { label: 'Incomplete', className: 'bg-warning/20 text-warning' },
  closure: { label: 'Closed', className: 'bg-muted text-muted-foreground' },
  day_off: { label: 'Day Off', className: 'bg-primary/20 text-primary' },
  unscheduled: { label: 'No Schedule', className: 'bg-muted text-muted-foreground' },
  timezone_suspect: { label: 'TZ Issue', className: 'bg-destructive/20 text-destructive' },
};
const weekday = (date: string) => (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7;
const selectClass = 'h-9 rounded-md border border-input bg-background px-2 text-sm';

/** Sort the full selected range before slicing a page; missing times stay last. */
function HistoryList<T extends { id: string; entry_date: string }>({ title, rows, options, children }: {
  title: string; rows: T[]; options: SortOption<T>[]; children: (row: T) => ReactNode;
}) {
  const [sort, setSort] = useState('date');
  const [ascending, setAscending] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const sorted = useMemo(() => {
    const option = options.find(item => item.key === sort) || options[0];
    return [...rows].sort((a, b) => {
      const av = option.value(a), bv = option.value(b);
      if (av == null && bv != null) return 1;
      if (bv == null && av != null) return -1;
      const compare = av == null || bv == null ? 0 : typeof av === 'number' && typeof bv === 'number'
        ? av - bv : String(av).localeCompare(String(bv));
      return compare * (ascending ? 1 : -1) || b.entry_date.localeCompare(a.entry_date) || a.id.localeCompare(b.id);
    });
  }, [rows, sort, ascending, options]);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pages - 1);
  const offset = currentPage * pageSize;
  return <>
    <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3">
      <label className="flex items-center gap-2 text-sm">Sort by
        <select aria-label={`${title} sort by`} className={selectClass} value={sort} onChange={e => {
          setSort(e.target.value); setAscending(e.target.value !== 'date'); setPage(0);
        }}>{options.map(option => <option key={option.key} value={option.key}>{option.label}</option>)}</select>
      </label>
      <select aria-label={`${title} sort direction`} className={selectClass} value={ascending ? 'asc' : 'desc'} onChange={e => {
        setAscending(e.target.value === 'asc'); setPage(0);
      }}><option value="asc">Ascending</option><option value="desc">Descending</option></select>
      <label className="flex items-center gap-2 text-sm">Rows
        <select aria-label={`${title} rows per page`} className={selectClass} value={pageSize} onChange={e => {
          setPageSize(Number(e.target.value)); setPage(0);
        }}>{[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}</select>
      </label>
    </div>
    {rows.length ? <div className="divide-y">{sorted.slice(offset, offset + pageSize).map(row => <div key={row.id}>{children(row)}</div>)}</div>
      : <p className="py-8 text-center text-muted-foreground">No {title.toLowerCase()} in this date range.</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
      <p className="text-xs text-muted-foreground" aria-live="polite">{rows.length ? `${offset + 1}–${Math.min(offset + pageSize, rows.length)} of ${rows.length}` : '0 records'} · Page {currentPage + 1} of {pages}</p>
      <div className="flex gap-2">
        <Button size="sm" variant="outline" aria-label={`Previous ${title.toLowerCase()} page`} disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>Previous</Button>
        <Button size="sm" variant="outline" aria-label={`Next ${title.toLowerCase()} page`} disabled={currentPage >= pages - 1} onClick={() => setPage(currentPage + 1)}>Next</Button>
      </div>
    </div>
  </>;
}

const attendanceSort: SortOption<Attendance>[] = [
  { key: 'date', label: 'Date', value: row => row.entry_date },
  { key: 'day', label: 'Day of week (Mon–Sun)', value: row => weekday(row.entry_date) },
  { key: 'status', label: 'Status', value: row => statuses[row.status_code]?.label || row.status_code },
  { key: 'late', label: 'Minutes late', value: row => row.minutes_late || 0 },
];
function punchTime(entry: Entry, type: 'in' | 'out') {
  const times = entry.punches.filter(p => !p.voided_at && p.punch_type === type).map(p => p.punch_time).sort();
  const time = type === 'in' ? times[0] : times[times.length - 1];
  return time ? easternWallMinutes(time) : null;
}
const entrySort: SortOption<Entry>[] = [
  { key: 'date', label: 'Date', value: row => row.entry_date },
  { key: 'day', label: 'Day of week (Mon–Sun)', value: row => weekday(row.entry_date) },
  { key: 'in', label: 'First clock-in', value: row => punchTime(row, 'in') },
  { key: 'out', label: 'Last clock-out', value: row => punchTime(row, 'out') },
  { key: 'hours', label: 'Hours worked', value: row => row.total_minutes || 0 },
];

/** Re-read the chosen date, including dates outside the visible range, before editing. */
function EmployeePunchEditor({ employeeId, employeeName, date, onClose }: {
  employeeId: string; employeeName: string; date: string; onClose: () => void;
}) {
  const query = useEmployeeTimeEntries(employeeId, { start: date, end: date });
  const entry = query.data?.[0];
  const punches = useMemo(() => [...(entry?.punches || [])].sort((a, b) => a.seq - b.seq) as PunchRow[], [entry]);
  if (!query.isSuccess) return <Dialog open onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent><DialogHeader><DialogTitle>Clock-ins and clock-outs</DialogTitle><DialogDescription>{employeeName} — {formatDate(date)}</DialogDescription></DialogHeader>
      {query.isError ? <><p role="alert">Could not load this day. No changes have been made.</p><Button onClick={() => query.refetch()}>Retry</Button></>
        : <p role="status">Loading this day…</p>}
    </DialogContent>
  </Dialog>;
  return <PunchEditorModal open onClose={onClose} entryId={entry?.id ?? null} entryDate={date}
    employeeId={employeeId} employeeName={employeeName} punches={punches} allowScheduleQuickFixes={false} />;
}

export default function EmployeeTimeHistory({ employeeId, employeeName, attendance, entries, entriesLoading, entriesError }: {
  employeeId: string; employeeName: string; attendance: Attendance[]; entries: Entry[];
  entriesLoading: boolean; entriesError: boolean;
}) {
  const { data: ctx } = useOrgContext();
  const [addDate, setAddDate] = useState(getToday);
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [auditDate, setAuditDate] = useState<string | null>(null);
  if (ctx?.role !== 'owner' && ctx?.role !== 'manager') return null;
  const actions = (date: string) => <div className="flex shrink-0 gap-1">
    <Button variant="ghost" size="sm" aria-label={`Edit punches for ${date}`} onClick={() => setEditingDate(date)}><Pencil className="mr-1 h-3.5 w-3.5" />Edit</Button>
    <Button variant="ghost" size="sm" aria-label={`View audit trail for ${date}`} onClick={() => setAuditDate(date)}><History className="mr-1 h-3.5 w-3.5" />Trail</Button>
  </div>;
  return <>
    <Card className="card-elevated">
      <CardHeader className="border-b"><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Attendance</CardTitle></CardHeader>
      <CardContent className="p-0"><HistoryList title="Attendance" rows={attendance} options={attendanceSort}>{row => {
        const status = statuses[row.status_code] || { label: row.status_code, className: 'bg-muted text-muted-foreground' };
        return <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-3"><span className="w-28 text-sm font-medium">{formatDate(row.entry_date)}</span><span className={`rounded px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.label}</span></div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {row.schedule_expected_start && <span>Sched: {formatClock(row.schedule_expected_start)}</span>}
            {!!row.minutes_late && row.minutes_late > 0 && <span className="font-semibold text-warning">+{row.minutes_late}min</span>}
            {actions(row.entry_date)}
          </div>
        </div>;
      }}</HistoryList></CardContent>
    </Card>
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Clock-ins and clock-outs</CardTitle>
        <p className="text-sm text-muted-foreground">Add missed punches or edit a day. Removing a punch voids it; its history and the reason are kept.</p>
        <div className="flex flex-wrap items-end gap-2 pt-2">
          <div className="space-y-1"><Label htmlFor="add-punch-date">Date to correct</Label><Input id="add-punch-date" type="date" value={addDate} max={getToday()} onChange={e => setAddDate(e.target.value)} /></div>
          <Button variant="outline" disabled={!/^\d{4}-\d{2}-\d{2}$/.test(addDate) || addDate > getToday()} onClick={() => setEditingDate(addDate)}><Plus className="mr-1 h-4 w-4" />Add clock-in/out</Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {entriesError ? <p role="alert" className="p-4 text-destructive">Could not load clock-ins and clock-outs. Please refresh and try again.</p>
          : entriesLoading ? <p role="status" className="p-4">Loading clock-ins and clock-outs…</p>
          : <HistoryList title="Clock-ins and clock-outs" rows={entries} options={entrySort}>{entry => <div className="space-y-2 px-4 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-sm font-medium">{formatDate(entry.entry_date)}</span><div className="flex items-center gap-2"><span className="time-display text-sm font-semibold">{minutesToHHMM(entry.total_minutes || 0)}</span>{actions(entry.entry_date)}</div></div>
            <div className="flex flex-wrap gap-1.5">{entry.punches.filter(p => !p.voided_at).sort((a, b) => a.seq - b.seq).map(p => <span key={p.id} className={`rounded px-1.5 py-0.5 text-xs ${p.punch_type === 'in' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>{p.punch_type} {formatTime(p.punch_time)}</span>)}
              {!entry.punches.some(p => !p.voided_at) && <span className="text-xs text-muted-foreground">No active punches. Previous changes remain in the trail.</span>}
            </div>
          </div>}</HistoryList>}
      </CardContent>
    </Card>
    {editingDate && <EmployeePunchEditor key={`${employeeId}:${editingDate}`} employeeId={employeeId} employeeName={employeeName} date={editingDate} onClose={() => setEditingDate(null)} />}
    {auditDate && <AuditHistoryModal open onClose={() => setAuditDate(null)} employeeId={employeeId} employeeName={employeeName} entryDate={auditDate} />}
  </>;
}
