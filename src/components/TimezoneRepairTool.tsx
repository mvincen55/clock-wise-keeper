import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Wrench, AlertTriangle, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';

type PreviewRow = {
  id: string;
  entry_date: string;
  punch_time: string;
  corrected_time: string;
  punch_type: string;
};

export default function TimezoneRepairTool() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [mode, setMode] = useState<'reinterpret' | 'shift' | 'trust'>('shift');
  const [shiftHours, setShiftHours] = useState(5); // common UTC→ET offset
  const [shiftDirection, setShiftDirection] = useState<'subtract' | 'add'>('subtract');
  const [preview, setPreview] = useState<PreviewRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [committed, setCommitted] = useState(false);

  const handlePreview = async () => {
    if (!user || !startDate || !endDate) return;
    setLoading(true);
    setCommitted(false);
    try {
      // Fetch punches in the date range
      const { data: entries } = await supabase
        .from('time_entries')
        .select('id, entry_date')
        .eq('user_id', user.id)
        .gte('entry_date', startDate)
        .lte('entry_date', endDate);

      if (!entries?.length) {
        setPreview([]);
        setLoading(false);
        return;
      }

      const entryIds = entries.map(e => e.id);
      const entryMap = Object.fromEntries(entries.map(e => [e.id, e.entry_date]));

      const { data: punches } = await supabase
        .from('punches')
        .select('id, time_entry_id, punch_time, punch_type')
        .in('time_entry_id', entryIds)
        .order('punch_time');

      if (!punches?.length) {
        setPreview([]);
        setLoading(false);
        return;
      }

      const rows: PreviewRow[] = punches.map(p => {
        const original = new Date(p.punch_time);
        let corrected: Date;

        if (mode === 'trust') {
          corrected = original; // No change, just recompute
        } else if (mode === 'shift') {
          const offsetMs = shiftHours * 60 * 60 * 1000;
          corrected = new Date(original.getTime() + (shiftDirection === 'subtract' ? -offsetMs : offsetMs));
        } else {
          // Reinterpret: same shift logic, different label
          const offsetMs = shiftHours * 60 * 60 * 1000;
          corrected = new Date(original.getTime() + (shiftDirection === 'subtract' ? -offsetMs : offsetMs));
        }

        return {
          id: p.id,
          entry_date: entryMap[p.time_entry_id] || '',
          punch_time: original.toISOString(),
          corrected_time: corrected.toISOString(),
          punch_type: p.punch_type,
        };
      });

      setPreview(rows);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const handleCommit = async () => {
    if (!preview?.length || !user) return;
    setLoading(true);
    try {
      if (mode !== 'trust') {
        // Update each punch (skip for trust mode — just recompute)
        for (const row of preview) {
          if (row.punch_time !== row.corrected_time) {
            const { error } = await supabase
              .from('punches')
              .update({
                punch_time: row.corrected_time,
                is_edited: true,
                edited_at: new Date().toISOString(),
                edited_by: user.id,
                original_punch_time: row.punch_time,
              })
              .eq('id', row.id);
            if (error) throw error;
          }
        }
      }

      // Always recompute after repair
      await supabase.rpc('recompute_attendance_range', {
        p_user_id: user.id,
        p_start_date: startDate,
        p_end_date: endDate,
      });

      setCommitted(true);
      const action = mode === 'trust' ? 'Recomputed attendance' : `Fixed ${preview.length} punch timestamps and recomputed attendance`;
      toast({ title: action });
    } catch (err: any) {
      toast({ title: 'Commit failed', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Wrench className="h-5 w-5" />
          Fix Punch Timezone
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>This tool corrects mis-zoned punch timestamps. Always preview before committing.</span>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Start Date</Label>
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">End Date</Label>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mode</Label>
            <Select value={mode} onValueChange={v => setMode(v as any)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="shift">Shift by offset</SelectItem>
                <SelectItem value="reinterpret">Reinterpret as local</SelectItem>
                <SelectItem value="trust">Trust stored values (recompute only)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-4 items-end">
          <div className="space-y-1">
            <Label className="text-xs">Direction</Label>
            <Select value={shiftDirection} onValueChange={v => setShiftDirection(v as any)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="subtract">Subtract</SelectItem>
                <SelectItem value="add">Add</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Hours</Label>
            <Input
              type="number"
              min={0}
              max={24}
              step={0.5}
              value={shiftHours}
              onChange={e => setShiftHours(parseFloat(e.target.value) || 0)}
              className="w-20"
            />
          </div>
          <Button onClick={handlePreview} disabled={loading || !startDate || !endDate}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Preview
          </Button>
        </div>

        {preview !== null && (
          <div className="space-y-3">
            {preview.length === 0 ? (
              <p className="text-sm text-muted-foreground">No punches found in this range.</p>
            ) : (
              <>
                <div className="overflow-x-auto max-h-80 overflow-y-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Date</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Type</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">Current</th>
                        <th className="px-3 py-2 text-left font-medium text-muted-foreground">→ Corrected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {preview.map(r => (
                        <tr key={r.id}>
                          <td className="px-3 py-2">{formatDate(r.entry_date)}</td>
                          <td className="px-3 py-2 uppercase text-xs font-medium">{r.punch_type}</td>
                          <td className="px-3 py-2 font-mono text-xs">{fmt(r.punch_time)}</td>
                          <td className="px-3 py-2 font-mono text-xs text-primary font-semibold">{fmt(r.corrected_time)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {committed ? (
                  <div className="flex items-center gap-2 text-success font-medium">
                    <Check className="h-4 w-4" /> Changes committed successfully
                  </div>
                ) : (
                  <Button onClick={handleCommit} disabled={loading} variant="destructive">
                    {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Commit {preview.length} Changes
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
