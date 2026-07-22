import { useMemo, useState } from 'react';
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
import { parseCurrencyInput, formatCents } from '@/lib/fof/money';
import { categorizeCdtCode } from '@/lib/fof/cdt';
import type { FeeCategory } from '@/lib/fof/insurance';
import { useImportFeeScheduleItems, type ImportRow } from '@/hooks/useFeeSchedules';

// Spreadsheet import for fee schedules: parse CSV/XLSX in the browser,
// map columns, preview, bulk upsert. Fee schedules are de-identified
// configuration (codes + fees) — no patient data.

interface FeeImportDialogProps {
  open: boolean;
  scheduleId: string | null;
  scheduleName: string;
  onClose: () => void;
}

type Grid = (string | number | null)[][];

const NONE = '__none__';

function cellString(value: string | number | null | undefined): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

function cellFee(value: string | number | null | undefined): number | null {
  if (typeof value === 'number' && isFinite(value)) return Math.round(value * 100);
  return parseCurrencyInput(cellString(value));
}

function detectCategory(value: string): FeeCategory | undefined {
  const v = value.toLowerCase();
  if (!v) return undefined;
  if (v.startsWith('prev') || v.includes('diagnostic')) return 'preventive';
  if (v.startsWith('basic')) return 'basic';
  if (v.startsWith('major')) return 'major';
  return 'other';
}

export default function FeeImportDialog({ open, scheduleId, scheduleName, onClose }: FeeImportDialogProps) {
  const importItems = useImportFeeScheduleItems();
  const [grid, setGrid] = useState<Grid>([]);
  const [fileName, setFileName] = useState('');
  const [codeCol, setCodeCol] = useState<string>(NONE);
  const [descCol, setDescCol] = useState<string>(NONE);
  const [feeCol, setFeeCol] = useState<string>(NONE);
  const [catCol, setCatCol] = useState<string>(NONE);
  const [hasHeader, setHasHeader] = useState(true);

  const reset = () => {
    setGrid([]);
    setFileName('');
    setCodeCol(NONE);
    setDescCol(NONE);
    setFeeCol(NONE);
    setCatCol(NONE);
    setHasHeader(true);
  };

  const handleFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
        header: 1,
        defval: null,
      }) as Grid;
      const nonEmpty = rows.filter(r => r.some(c => cellString(c) !== ''));
      if (nonEmpty.length === 0) {
        toast.error('That file looks empty');
        return;
      }
      setGrid(nonEmpty);
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
      setCodeCol(code);
      setDescCol(desc);
      setFeeCol(fee);
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

  const mappedRows: ImportRow[] = useMemo(() => {
    if (codeCol === NONE || feeCol === NONE) return [];
    const rows: ImportRow[] = [];
    for (const row of dataRows) {
      const code = cellString(row[Number(codeCol)]).toUpperCase();
      const fee = cellFee(row[Number(feeCol)]);
      if (!code || fee === null) continue;
      rows.push({
        code,
        description: descCol !== NONE ? cellString(row[Number(descCol)]) : '',
        feeCents: fee,
        // Explicit category column wins; otherwise auto-categorize from the
        // CDT code range (consistent across carriers).
        category:
          (catCol !== NONE ? detectCategory(cellString(row[Number(catCol)])) : undefined) ??
          categorizeCdtCode(code),
      });
    }
    return rows;
  }, [dataRows, codeCol, descCol, feeCol, catCol]);

  const submit = () => {
    if (!scheduleId) return;
    importItems.mutate(
      { scheduleId, rows: mappedRows },
      {
        onSuccess: result => {
          toast.success(`Imported ${result.imported} codes into ${scheduleName}`);
          reset();
          onClose();
        },
        onError: err => toast.error(`Import failed: ${err.message}`),
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
                {fileName} — {dataRows.length} rows
              </p>
            )}
          </div>

          {grid.length > 0 && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Procedure Code column</Label>
                  <Select value={codeCol} onValueChange={setCodeCol}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— choose —</SelectItem>
                      {colOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Fee column</Label>
                  <Select value={feeCol} onValueChange={setFeeCol}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— choose —</SelectItem>
                      {colOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Description column (optional)</Label>
                  <Select value={descCol} onValueChange={setDescCol}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {colOptions.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Category column (optional)</Label>
                  <Select value={catCol} onValueChange={setCatCol}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
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

              {mappedRows.length > 0 ? (
                <div className="rounded-md border overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-muted/50">
                        <th className="text-left p-2">Code</th>
                        <th className="text-left p-2">Description</th>
                        <th className="text-right p-2">Fee</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mappedRows.slice(0, 5).map((row, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="p-2 font-mono">{row.code}</td>
                          <td className="p-2 truncate max-w-52">{row.description}</td>
                          <td className="p-2 text-right">{formatCents(row.feeCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="p-2 text-xs text-muted-foreground">
                    Preview of {Math.min(5, mappedRows.length)} of {mappedRows.length} rows that will
                    be imported. Existing codes are updated, new codes added.
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Pick the code and fee columns to see a preview.
                </p>
              )}
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancel</Button>
          <Button onClick={submit} disabled={mappedRows.length === 0 || importItems.isPending}>
            {importItems.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Import {mappedRows.length > 0 ? `${mappedRows.length} codes` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
