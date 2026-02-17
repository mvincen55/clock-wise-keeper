import { useState } from 'react';
import { parseTimePunchExcel, PunchSummaryRow } from '@/lib/punch-spreadsheet-parser';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react';

function SummaryRow({ row }: { row: PunchSummaryRow }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`hover:bg-muted/50 transition-colors ${row.needsReview ? 'bg-warning/5' : ''}`}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3 cursor-pointer">
          {row.pairs.length > 1 ? (
            expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
          ) : <span className="w-4 inline-block" />}
        </td>
        <td className="px-4 py-3 font-medium">{row.date}</td>
        <td className="px-4 py-3 text-muted-foreground">{row.day}</td>
        <td className="px-4 py-3 time-display text-sm">{row.firstIn}</td>
        <td className="px-4 py-3 time-display text-sm">{row.lastOut}</td>
        <td className="px-4 py-3 time-display text-sm font-semibold">{row.total}</td>
        <td className="px-4 py-3">
          {row.needsReview && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">
              <AlertTriangle className="h-3 w-3" />
              YES
            </span>
          )}
        </td>
      </tr>
      {expanded && row.pairs.length > 0 && (
        <tr>
          <td colSpan={7} className="bg-muted/30 px-8 py-2">
            <div className="text-xs space-y-1">
              <p className="font-semibold text-muted-foreground uppercase mb-1">Punch Pairs</p>
              {row.pairs.map((p, i) => (
                <div key={i} className="flex items-center gap-4">
                  <span className="text-success font-medium w-20">In: {p.inTime}</span>
                  <span className="text-destructive font-medium w-20">Out: {p.outTime}</span>
                  <span className="time-display text-muted-foreground">
                    {Math.floor(p.minutes / 60)}h {p.minutes % 60}m
                  </span>
                </div>
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function TimePunchSummary() {
  const [rows, setRows] = useState<PunchSummaryRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParsing(true);
    setError(null);
    setFileName(file.name);

    try {
      const buffer = await file.arrayBuffer();
      const result = parseTimePunchExcel(buffer);
      setRows(result);
    } catch (err: any) {
      setError(err.message);
      setRows([]);
    } finally {
      setParsing(false);
    }
  };

  const totalAllMinutes = rows.reduce((sum, r) => {
    const [h, m] = r.total.split(':').map(Number);
    return sum + h * 60 + (m || 0);
  }, 0);

  const reviewCount = rows.filter(r => r.needsReview).length;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Time Punch Summary</h1>
        <p className="text-muted-foreground">Upload a spreadsheet with In/Out punch times</p>
      </div>

      {/* Upload */}
      <Card className="card-elevated">
        <CardContent className="p-8">
          <div className="border-2 border-dashed border-border rounded-xl p-8 text-center">
            <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-lg font-medium mb-2">Upload Excel Spreadsheet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Expected columns: Date, Day, In1, Out1, In2, Out2, ...
            </p>
            <label>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              <Button asChild variant={rows.length ? 'outline' : 'default'}>
                <span>
                  {parsing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                  {rows.length ? 'Upload Different File' : 'Choose File'}
                </span>
              </Button>
            </label>
            {fileName && (
              <p className="mt-3 text-sm text-muted-foreground">{fileName}</p>
            )}
          </div>
        </CardContent>
      </Card>

      {error && (
        <Card className="card-elevated border-destructive/30">
          <CardContent className="p-4 flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary stats */}
      {rows.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="px-4 py-2 bg-primary/10 rounded-lg">
            <span className="text-xs text-muted-foreground">Total Days: </span>
            <span className="font-semibold text-primary">{rows.length}</span>
          </div>
          <div className="px-4 py-2 bg-primary/10 rounded-lg">
            <span className="text-xs text-muted-foreground">Total Hours: </span>
            <span className="time-display font-semibold text-primary">
              {Math.floor(totalAllMinutes / 60)}:{(totalAllMinutes % 60).toString().padStart(2, '0')}
            </span>
          </div>
          {reviewCount > 0 && (
            <div className="px-4 py-2 bg-warning/10 rounded-lg">
              <span className="text-xs text-muted-foreground">Needs Review: </span>
              <span className="font-semibold text-warning">{reviewCount}</span>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <Card className="card-elevated overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 w-8"></th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Day</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">First In</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Last Out</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Total</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Needs Review</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row, i) => (
                  <SummaryRow key={i} row={row} />
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-bold">
                  <td colSpan={5} className="px-4 py-3 text-right">Grand Total:</td>
                  <td className="px-4 py-3 time-display">
                    {Math.floor(totalAllMinutes / 60)}:{(totalAllMinutes % 60).toString().padStart(2, '0')}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
