import { useEffect, useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { parseScheduleFee, formatCents, type ScheduleFee } from '@/lib/fof/money';
import { categorizeCdtCode } from '@/lib/fof/cdt';
import type { FeeCategory } from '@/lib/fof/insurance';
import { FeeImportError, useImportFeeScheduleItems, type ImportRow } from '@/hooks/useFeeSchedules';

// Spreadsheet import for fee schedules: parse CSV/XLSX in the browser,
// map columns, preview every outcome (valid / skipped / duplicate /
// unmatched), then write. Fee schedules are de-identified configuration
// (codes + fees) — no patient data.

interface FeeImportDialogProps {
  open: boolean;
  scheduleId: string | null;
  scheduleName: string;
  /** 'office' schedules have no "unmatched" concept; carrier/payment tables do. */
  scheduleKind?: 'office' | 'carrier' | 'payment';
  /** Codes on the office schedule, for the carrier "unmatched" count. */
  officeCodes?: ReadonlySet<string>;
  onClose: () => void;
}

type Grid = (string | number | null)[][];

const NONE = '__none__';
const ALL_SHEETS = '__all__';

function cellString(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/**
 * A procedure code read from a spreadsheet cell.
 *
 * A NUMERIC cell has already lost everything that is not a digit: Excel
 * stores CDT D0120 as the number 120. That is exactly how the Altus
 * schedule arrived holding 693 codes that matched nothing — the FOF
 * resolves allowables by exact code, so 'D0120' never found '120', and
 * the handful that did collide hit the office's own custom numeric codes
 * (Altus 9110 palliative treatment against the office's HIPAA Ack).
 *
 * Zero-padding is always safe on a code column. Adding the D is the
 * caller's call, since custom office codes are genuinely bare numbers.
 */
export function cellCode(value: string | number | null | undefined, cdtPrefix: boolean): string {
  const numeric =
    typeof value === 'number' && isFinite(value) && Number.isInteger(value) && value > 0 && value < 10000;
  const text = numeric ? String(value).padStart(4, '0') : cellString(value).toUpperCase();
  return cdtPrefix && /^\d{4}$/.test(text) ? `D${text}` : text;
}

export function cellFee(value: string | number | null | undefined): ScheduleFee | null {
  // A numeric cell can't carry the asterisk, so it is always a real fee.
  if (typeof value === 'number' && isFinite(value)) {
    return { cents: Math.round(value * 100), isOfficeFee: false };
  }
  return parseScheduleFee(cellString(value));
}

function detectCategory(value: string): FeeCategory | undefined {
  const v = value.toLowerCase();
  if (!v) return undefined;
  if (v.startsWith('work') || v.includes('workup')) return 'workup';
  if (v.startsWith('prev') || v.includes('diagnostic')) return 'preventive';
  if (v.startsWith('basic')) return 'basic';
  if (v.startsWith('major')) return 'major';
  return 'other';
}

export interface MappedImport {
  rows: ImportRow[];
  /** Rows with a code but no readable fee, or a fee but no code. */
  skipped: { row: number; reason: string }[];
  /** Codes that appear more than once (the last occurrence wins). */
  duplicates: string[];
  /** Carrier/payment tables: codes not on the office schedule. */
  unmatched: string[];
}

/** Pure mapping of a data grid to import rows and their outcomes. */
export function mapImportRows(
  dataRows: Grid,
  columns: { code: string; fee: string; desc: string; cat: string },
  cdtPrefix: boolean,
  officeCodes: ReadonlySet<string> | undefined,
  checkUnmatched: boolean
): MappedImport {
  const rows: ImportRow[] = [];
  const skipped: MappedImport['skipped'] = [];
  const seen = new Map<string, number>();
  if (columns.code === NONE || columns.fee === NONE) return { rows, skipped, duplicates: [], unmatched: [] };
  dataRows.forEach((row, index) => {
    const code = cellCode(row[Number(columns.code)], cdtPrefix);
    const feeCell = row[Number(columns.fee)];
    const fee = cellFee(feeCell);
    if (!code && fee === null) return; // a blank line, not a skipped row
    if (!code) { skipped.push({ row: index + 1, reason: 'no code' }); return; }
    if (fee === null) { skipped.push({ row: index + 1, reason: cellString(feeCell) ? `fee "${cellString(feeCell)}" is not an amount` : 'no fee' }); return; }
    seen.set(code, (seen.get(code) ?? 0) + 1);
    rows.push({
      code,
      description: columns.desc !== NONE ? cellString(row[Number(columns.desc)]) : '',
      feeCents: fee.cents,
      isOfficeFee: fee.isOfficeFee,
      // Explicit category column wins; otherwise auto-categorize from the
      // CDT code range (consistent across carriers).
      category:
        (columns.cat !== NONE ? detectCategory(cellString(row[Number(columns.cat)])) : undefined) ??
        categorizeCdtCode(code),
    });
  });
  const duplicates = [...seen.entries()].filter(([, count]) => count > 1).map(([code]) => code);
  const unmatched = checkUnmatched && officeCodes
    ? [...new Set(rows.map(r => r.code))].filter(code => !officeCodes.has(code))
    : [];
  return { rows, skipped, duplicates, unmatched };
}

const EMPTY_MAPPING = { code: NONE, desc: NONE, fee: NONE, cat: NONE };

export default function FeeImportDialog({ open, scheduleId, scheduleName, scheduleKind = 'carrier', officeCodes, onClose }: FeeImportDialogProps) {
  const importItems = useImportFeeScheduleItems();
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [sheet, setSheet] = useState<string>(ALL_SHEETS);
  const [fileName, setFileName] = useState('');
  const [mapping, setMapping] = useState(EMPTY_MAPPING);
  const [hasHeader, setHasHeader] = useState(true);
  // Turned on automatically when a file's codes arrive as bare numbers.
  const [cdtPrefix, setCdtPrefix] = useState(false);
  const [failure, setFailure] = useState<string>('');

  // Every per-import option starts fresh for every import: a previous
  // file's column mapping, sheet, header flag or D-prefix choice never
  // carries into the next one (nor into another schedule).
  const reset = () => {
    setWorkbook(null);
    setSheet(ALL_SHEETS);
    setFileName('');
    setMapping(EMPTY_MAPPING);
    setHasHeader(true);
    setCdtPrefix(false);
    setFailure('');
  };
  useEffect(() => { if (open) reset(); }, [open, scheduleId]);

  const sheetNames = useMemo(() => workbook?.SheetNames ?? [], [workbook]);
  const grid = useMemo<Grid>(() => {
    if (!workbook) return [];
    const names = sheet === ALL_SHEETS ? sheetNames : [sheet];
    const out: Grid = [];
    names.forEach((name, i) => {
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(workbook.Sheets[name], { header: 1, defval: null }) as Grid;
      const nonEmpty = rows.filter(r => r.some(c => cellString(c) !== ''));
      // Later worksheets repeat the header row; drop it so it is not read as a code.
      out.push(...(i > 0 && hasHeader ? nonEmpty.slice(1) : nonEmpty));
    });
    return out;
  }, [workbook, sheet, sheetNames, hasHeader]);

  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const book = XLSX.read(buffer, { type: 'array' });
      const first = book.Sheets[book.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(first, { header: 1, defval: null }) as Grid;
      const nonEmpty = rows.filter(r => r.some(c => cellString(c) !== ''));
      if (nonEmpty.length === 0) {
        toast.error('That file looks empty');
        return;
      }
      reset();
      setWorkbook(book);
      setSheet(book.SheetNames.length > 1 ? ALL_SHEETS : book.SheetNames[0]);
      setFileName(file.name);

      // Auto-map: code column = first column whose values look like D-codes;
      // fee column = first mostly-numeric column; description = first text.
      const sample = nonEmpty.slice(1, 20);
      const colCount = Math.max(...nonEmpty.map(r => r.length));
      let code = NONE, desc = NONE, fee = NONE;
      for (let c = 0; c < colCount; c++) {
        const values = sample.map(r => cellString(r[c])).filter(Boolean);
        if (values.length === 0) continue;
        const dCodes = values.filter(v => /^D\d{4}$/i.test(v)).length;
        const fees = values.filter(v => cellFee(v) !== null).length;
        if (code === NONE && dCodes > values.length / 2) code = String(c);
        else if (fee === NONE && fees > values.length / 2) fee = String(c);
        else if (desc === NONE && dCodes === 0 && fees < values.length / 2) desc = String(c);
      }
      setMapping({ code, desc, fee, cat: NONE });
      // If the code column came through as bare numbers, this file lost
      // its D prefixes on the way out of Excel. Offer to put them back.
      if (code !== NONE) {
        const codes = sample.map(r => r[Number(code)]).filter(v => v !== null && v !== undefined && v !== '');
        const bare = codes.filter(v => typeof v === 'number' || /^\d{1,4}$/.test(cellString(v))).length;
        setCdtPrefix(codes.length > 0 && bare > codes.length * 0.8);
      }
    } catch (error) {
      toast.error(`Could not read file: ${error instanceof Error ? error.message : 'unknown error'}`);
    }
  };

  const colCount = useMemo(() => Math.max(0, ...grid.map(r => r.length)), [grid]);
  const headerRow = hasHeader && grid.length > 0 ? grid[0] : null;
  const dataRows = hasHeader ? grid.slice(1) : grid;

  const colOptions = Array.from({ length: colCount }, (_, i) => ({
    value: String(i),
    label: headerRow ? `${cellString(headerRow[i]) || `Column ${i + 1}`}` : `Column ${i + 1}`,
  }));

  const mapped = useMemo(
    () => mapImportRows(dataRows, mapping, cdtPrefix, officeCodes, scheduleKind !== 'office'),
    [dataRows, mapping, cdtPrefix, officeCodes, scheduleKind]
  );
  const uniqueCount = new Set(mapped.rows.map(r => r.code)).size;

  const submit = () => {
    if (!scheduleId) return;
    setFailure('');
    importItems.mutate(
      { scheduleId, rows: mapped.rows },
      {
        onSuccess: result => {
          // Only rows the database verified after the write count as imported.
          toast.success(`Imported ${result.imported} codes into ${scheduleName} (${result.added} new, ${result.updated} updated) — verified on the schedule`);
          reset();
          onClose();
        },
        onError: err => {
          const message = err instanceof FeeImportError
            ? err.message
            : `Import failed: ${err.message}. The schedule was not changed.`;
          setFailure(message);
          toast.error(message);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={isOpen => { if (!isOpen) { reset(); onClose(); } }}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import Fees into {scheduleName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="fee-file">Spreadsheet (CSV or Excel)</Label>
            <Input
              id="fee-file"
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={e => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
            {fileName && (
              <p className="text-xs text-muted-foreground">
                {fileName} — {dataRows.length} rows{sheetNames.length > 1 ? ` across ${sheet === ALL_SHEETS ? sheetNames.length : 1} of ${sheetNames.length} worksheets` : ''}
              </p>
            )}
          </div>

          {workbook && (
            <>
              {sheetNames.length > 1 && (
                <div className="space-y-1.5">
                  <Label>Worksheet</Label>
                  <Select value={sheet} onValueChange={setSheet}>
                    <SelectTrigger aria-label="Worksheet"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_SHEETS}>All worksheets ({sheetNames.length})</SelectItem>
                      {sheetNames.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Procedure Code column</Label>
                  <Select value={mapping.code} onValueChange={v => setMapping({ ...mapping, code: v })}>
                    <SelectTrigger aria-label="Procedure Code column"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— choose —</SelectItem>
                      {colOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fee column</Label>
                  <Select value={mapping.fee} onValueChange={v => setMapping({ ...mapping, fee: v })}>
                    <SelectTrigger aria-label="Fee column"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— choose —</SelectItem>
                      {colOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description column (optional)</Label>
                  <Select value={mapping.desc} onValueChange={v => setMapping({ ...mapping, desc: v })}>
                    <SelectTrigger aria-label="Description column"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {colOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category column (optional)</Label>
                  <Select value={mapping.cat} onValueChange={v => setMapping({ ...mapping, cat: v })}>
                    <SelectTrigger aria-label="Category column"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {colOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="has-header"
                  type="checkbox"
                  className="h-4 w-4"
                  checked={hasHeader}
                  onChange={e => setHasHeader(e.target.checked)}
                />
                <Label htmlFor="has-header">First row is a header</Label>
              </div>

              <div className="flex items-start gap-2">
                <input
                  id="cdt-prefix"
                  type="checkbox"
                  className="mt-0.5 h-4 w-4"
                  checked={cdtPrefix}
                  onChange={e => setCdtPrefix(e.target.checked)}
                />
                <Label htmlFor="cdt-prefix" className="font-normal leading-snug">
                  Codes are CDT without the D
                  <span className="block text-xs text-muted-foreground">
                    Saves 120 as D0120. Spreadsheets drop the D and the leading zeros on a
                    number column, and a code that doesn’t match your office schedule can’t
                    produce a write-off. Leave this off for custom office codes.
                  </span>
                </Label>
              </div>

              {mapping.code !== NONE && mapping.fee !== NONE ? (
                <div className="space-y-2">
                  <div className="grid gap-2 text-xs sm:grid-cols-4" data-testid="import-counts">
                    <div className="rounded-md border p-2"><div className="text-lg font-semibold">{uniqueCount}</div>valid code{uniqueCount === 1 ? '' : 's'} to write</div>
                    <div className="rounded-md border p-2"><div className="text-lg font-semibold">{mapped.skipped.length}</div>skipped (no code or unreadable fee)</div>
                    <div className="rounded-md border p-2"><div className="text-lg font-semibold">{mapped.duplicates.length}</div>duplicate code{mapped.duplicates.length === 1 ? '' : 's'} (last row wins)</div>
                    <div className="rounded-md border p-2"><div className="text-lg font-semibold">{scheduleKind === 'office' ? '—' : mapped.unmatched.length}</div>{scheduleKind === 'office' ? 'unmatched: n/a for the office schedule' : 'not on the office schedule'}</div>
                  </div>
                  {mapped.skipped.length > 0 && (
                    <p className="text-xs text-amber-700">
                      Skipped rows: {mapped.skipped.slice(0, 8).map(s => `row ${s.row} (${s.reason})`).join(', ')}{mapped.skipped.length > 8 ? ` and ${mapped.skipped.length - 8} more` : ''}. They will not be written.
                    </p>
                  )}
                  {mapped.duplicates.length > 0 && (
                    <p className="text-xs text-amber-700">Duplicate codes: {mapped.duplicates.slice(0, 12).join(', ')}{mapped.duplicates.length > 12 ? '…' : ''}. The last row for each code is the one saved.</p>
                  )}
                  {mapped.unmatched.length > 0 && (
                    <p className="text-xs text-amber-700">
                      {mapped.unmatched.length} code{mapped.unmatched.length === 1 ? ' is' : 's are'} not on the office fee schedule (for example {mapped.unmatched.slice(0, 6).join(', ')}). They are saved on this table but will never match a form line until the office schedule carries them.
                    </p>
                  )}
                  {mapped.rows.length > 0 ? (
                    <div className="rounded-md border overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b bg-muted/50">
                            <th className="text-left p-2">Code</th>
                            <th className="text-left p-2">Description</th>
                            <th className="text-right p-2">Fee</th>
                            <th className="text-left p-2">Source</th>
                          </tr>
                        </thead>
                        <tbody>
                          {mapped.rows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="border-b last:border-0">
                              <td className="p-2 font-mono">{row.code}</td>
                              <td className="p-2 truncate max-w-52">{row.description}</td>
                              <td className="p-2 text-right">{formatCents(row.feeCents)}</td>
                              <td className="p-2 text-xs text-muted-foreground">
                                {row.isOfficeFee ? 'Office fee (*)' : 'Contracted'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <p className="p-2 text-xs text-muted-foreground">
                        Preview of {Math.min(5, mapped.rows.length)} of {uniqueCount} codes that will
                        be written. Existing codes are updated, new codes added; rows are verified after the write.
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">No rows carry both a code and a readable fee with this mapping.</p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pick the code and fee columns to see a preview.
                </p>
              )}
              {failure && <p role="alert" className="text-sm text-destructive">{failure}</p>}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={submit} disabled={mapped.rows.length === 0 || importItems.isPending}>
            {importItems.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import {mapped.rows.length > 0 ? `${uniqueCount} codes` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
