import { useState } from 'react';
import { parseTimePunchExcel, PunchSummaryRow, parseTimeToMinutes } from '@/lib/punch-spreadsheet-parser';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Upload, FileSpreadsheet, Loader2, AlertTriangle, ChevronDown, ChevronRight, Save, CheckCircle } from 'lucide-react';

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
        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate" title={row.note}>{row.note}</td>
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
          <td colSpan={8} className="bg-muted/30 px-8 py-2">
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
  const { user } = useAuth();
  const { toast } = useToast();
  const [rows, setRows] = useState<PunchSummaryRow[]>([]);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
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
      setSaved(false);
    } catch (err: any) {
      setError(err.message);
      setRows([]);
    } finally {
      setParsing(false);
    }
  };

  /** Parse "1/6/2025" or "01/06/2025" → "2025-01-06" */
  const parseDate = (dateStr: string): string | null => {
    const parts = dateStr.split('/');
    if (parts.length !== 3) return null;
    const [m, d, y] = parts.map(Number);
    if (!m || !d || !y) return null;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  };

  const handleSave = async () => {
    if (!user || rows.length === 0) return;
    setSaving(true);

    try {
      let savedCount = 0;

      for (const row of rows) {
        const entryDate = parseDate(row.date);
        if (!entryDate) continue;

        const totalMins = row.pairs.reduce((s, p) => s + p.minutes, 0);
        const [h, m] = row.total.split(':').map(Number);

        // Create time_entry with source = auto_location (GPS)
        const { data: entry, error: entryErr } = await supabase
          .from('time_entries')
          .insert({
            user_id: user.id,
            entry_date: entryDate,
            total_minutes: totalMins,
            raw_total_hhmm: row.total,
            source: 'auto_location' as const,
            notes: [row.note, row.needsReview ? 'Needs review — incomplete punch pair' : null].filter(Boolean).join('; ') || null,
          })
          .select('id')
          .single();

        if (entryErr) {
          console.error('Entry insert error:', entryErr);
          continue;
        }

        // Create punches for each pair
        const punchInserts: any[] = [];
        let seq = 0;
        for (const pair of row.pairs) {
          const inMin = parseTimeToMinutes(pair.inTime);
          const outMin = parseTimeToMinutes(pair.outTime);
          if (inMin == null || outMin == null) continue;

          const inHour = Math.floor(inMin / 60);
          const inMinute = inMin % 60;
          const outHour = Math.floor(outMin / 60);
          const outMinute = outMin % 60;

          punchInserts.push({
            time_entry_id: entry.id,
            punch_type: 'in' as const,
            punch_time: `${entryDate}T${String(inHour).padStart(2, '0')}:${String(inMinute).padStart(2, '0')}:00`,
            seq: seq++,
            source: 'auto_location' as const,
          });
          punchInserts.push({
            time_entry_id: entry.id,
            punch_type: 'out' as const,
            punch_time: `${entryDate}T${String(outHour).padStart(2, '0')}:${String(outMinute).padStart(2, '0')}:00`,
            seq: seq++,
            source: 'auto_location' as const,
          });
        }

        if (punchInserts.length > 0) {
          await supabase.from('punches').insert(punchInserts);
        }

        savedCount++;
      }

      setSaved(true);
      toast({ title: `Saved ${savedCount} days to database` });
    } catch (err: any) {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
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
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Note</th>
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
                  <td colSpan={6} className="px-4 py-3 text-right">Grand Total:</td>
                  <td className="px-4 py-3 time-display">
                    {Math.floor(totalAllMinutes / 60)}:{(totalAllMinutes % 60).toString().padStart(2, '0')}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            </table>
          </div>
          
          {/* Save button */}
          <div className="border-t p-4">
            <Button onClick={handleSave} disabled={saving || saved || !user} className="w-full sm:w-auto">
              {saving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : saved ? (
                <>
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Saved
                </>
              ) : (
                <>
                  <Save className="mr-2 h-4 w-4" />
                  Save to Database ({rows.length} days)
                </>
              )}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
