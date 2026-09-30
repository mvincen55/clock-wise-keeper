import { useEffect, useMemo, useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { formatCents } from '@/lib/fof/money';
import type { LocalTreatmentImport, LocalTreatmentRow } from '@/lib/fof/local-treatment-import';

/**
 * Staff review of an imported treatment plan before any row enters the form.
 *
 * Everything shown here was read on this device (local OCR or pasted text)
 * and lives in component memory only. Rows the reader was unsure about,
 * codes the office bank does not know, and conflicting values are flagged
 * so staff confirm or drop them one by one; nothing is discarded silently,
 * and nothing is imported until "Import reviewed rows".
 */

export interface ReviewedRow extends LocalTreatmentRow {
  include: boolean;
}

interface Props {
  open: boolean;
  source: 'screenshot' | 'text';
  result: LocalTreatmentImport | null;
  /** Object URL of the reviewed screenshot, shown beside the rows (revoked by the caller). */
  previewUrl?: string;
  /** Office fee on file for a code (for the "on file" column). */
  officeFeeFor: (code: string) => number | null;
  onCancel: () => void;
  onImport: (rows: LocalTreatmentRow[]) => void;
}

export default function TreatmentImportReview({ open, source, result, previewUrl, officeFeeFor, onCancel, onImport }: Props) {
  const [rows, setRows] = useState<ReviewedRow[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  useEffect(() => {
    setRows((result?.rows ?? []).map(row => ({ ...row, issues: row.issues ?? [], confidence: row.confidence ?? 'ok', include: true })));
    setAcknowledged(false);
  }, [result]);

  const flagged = useMemo(() => rows.filter(row => row.include && (row.issues.length > 0 || row.confidence === 'low')), [rows]);
  const included = rows.filter(row => row.include);
  const needsAck = flagged.length > 0 || !!result?.oversized;
  const canImport = included.length > 0 && (!needsAck || acknowledged) && included.every(row => row.code.trim() !== '');

  const update = (index: number, patch: Partial<ReviewedRow>) =>
    setRows(previous => previous.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  return (
    <AlertDialog open={open} onOpenChange={isOpen => { if (!isOpen) onCancel(); }}>
      <AlertDialogContent className="min-w-0 max-h-[90vh] overflow-y-auto p-4 sm:p-6" style={{ width: 'calc(100% - 2rem)', maxWidth: '72rem' }}>
        <AlertDialogHeader>
          <AlertDialogTitle>Review {rows.length} extracted procedure{rows.length === 1 ? '' : 's'}</AlertDialogTitle>
          <AlertDialogDescription>
            {source === 'screenshot'
              ? 'Read on this device — the screenshot was not uploaded anywhere. Compare every row with it: codes, tooth numbers, fees and visit groups. Nothing has been imported yet.'
              : 'Read from the pasted text on this device. Compare every row with the plan: codes, tooth numbers, fees and visit groups. Nothing has been imported yet.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
          <div className="min-w-0 max-h-[50vh] overflow-auto rounded-md border">
            <table className="w-full min-w-[44rem] text-xs">
              <thead className="sticky top-0 bg-muted/80">
                <tr>
                  <th className="p-1.5 text-left">Use</th>
                  <th className="p-1.5 text-left">Code</th>
                  <th className="p-1.5 text-left">Tooth</th>
                  <th className="p-1.5 text-left">Visit</th>
                  <th className="p-1.5 text-right">Fee read</th>
                  <th className="p-1.5 text-right">Office (read)</th>
                  <th className="p-1.5 text-right">On file</th>
                  <th className="p-1.5 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => {
                  const onFile = officeFeeFor(row.code);
                  const flaggedRow = row.issues.length > 0 || row.confidence === 'low';
                  return (
                    <tr key={i} className={`border-t align-top ${flaggedRow ? 'bg-amber-50' : ''} ${row.include ? '' : 'opacity-50'}`}>
                      <td className="p-1.5">
                        <Checkbox aria-label={`Include row ${i + 1}`} checked={row.include} onCheckedChange={v => update(i, { include: v === true })} />
                      </td>
                      <td className="p-1.5">
                        <Input aria-label={`Code row ${i + 1}`} className="h-7 w-24 font-mono text-xs" value={row.code} onChange={e => update(i, { code: e.target.value.toUpperCase() })} />
                        {row.description && <div className="mt-0.5 max-w-[10rem] truncate text-muted-foreground" title={row.description}>{row.description}</div>}
                      </td>
                      <td className="p-1.5">
                        <Input aria-label={`Tooth row ${i + 1}`} className="h-7 w-14 text-xs" value={row.tooth} onChange={e => update(i, { tooth: e.target.value })} />
                      </td>
                      <td className="p-1.5">
                        <Input aria-label={`Visit row ${i + 1}`} className="h-7 w-14 text-xs" inputMode="numeric" value={row.visit ?? ''} onChange={e => { const n = parseInt(e.target.value, 10); update(i, { visit: Number.isFinite(n) && n > 0 ? n : null }); }} />
                      </td>
                      <td className="p-1.5 text-right whitespace-nowrap">{row.fee !== null ? formatCents(Math.round(row.fee * 100)) : '—'}</td>
                      <td className="p-1.5 text-right whitespace-nowrap">{row.officeFee !== null ? formatCents(Math.round(row.officeFee * 100)) : '—'}</td>
                      <td className="p-1.5 text-right whitespace-nowrap">{onFile !== null ? formatCents(onFile) : <span className="text-amber-700">none</span>}</td>
                      <td className="p-1.5 min-w-40">
                        {flaggedRow ? (
                          <ul className="space-y-0.5">
                            {row.confidence === 'low' && row.issues.length === 0 && <li><Badge variant="outline" className="border-amber-400 text-amber-800">Check this row against the screenshot</Badge></li>}
                            {row.issues.map((issue, j) => <li key={j} className="text-amber-800">{issue}</li>)}
                          </ul>
                        ) : (
                          <Badge variant="secondary">OK</Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="min-w-0 space-y-2">
            {previewUrl && <img src={previewUrl} alt="Screenshot being reviewed locally" className="max-h-[30vh] w-full rounded border object-contain" />}
            {(result?.warnings ?? []).map((warning, i) => <p key={i} className="text-xs text-amber-800">{warning}</p>)}
            <p className="text-xs text-muted-foreground">
              Fees on the form come from the office fee schedule (an OFFICE column on the plan wins; a plain Fee column is used only when no office fee is on file, and is flagged).
            </p>
            {needsAck && (
              <label className="flex items-start gap-2 text-xs">
                <Checkbox checked={acknowledged} onCheckedChange={v => setAcknowledged(v === true)} aria-label="I have checked the flagged rows" />
                <span>I have compared the {flagged.length > 0 ? `${flagged.length} flagged row${flagged.length === 1 ? '' : 's'}` : 'row count'} with the original plan.</span>
              </label>
            )}
          </div>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction disabled={!canImport} onClick={() => onImport(included.map(({ include: _include, ...row }) => row))}>
            Import reviewed rows{included.length !== rows.length ? ` (${included.length} of ${rows.length})` : ''}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
