import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Zap, Check, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';

type SuspectDay = {
  entry_date: string;
  punches: { id: string; punch_time: string; punch_type: string }[];
  schedule_start: string | null;
  suggested_offset: number;
  suggested_label: string;
  confidence: string;
};

export default function BulkRepairTool() {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: payrollSettings } = usePayrollSettings();
  const tz = payrollSettings?.timezone || 'America/New_York';

  const [suspects, setSuspects] = useState<SuspectDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [done, setDone] = useState(false);

  const analyze = async () => {
    if (!user) return;
    setLoading(true);
    setDone(false);
    try {
      // Get all suspect days
      const { data: suspectRows } = await supabase
        .from('attendance_day_status')
        .select('entry_date, schedule_expected_start')
        .eq('user_id', user.id)
        .eq('timezone_suspect', true)
        .order('entry_date');

      if (!suspectRows?.length) {
        setSuspects([]);
        setLoading(false);
        return;
      }

      // Get time entries for these dates
      const dates = suspectRows.map(r => r.entry_date);
      const { data: entries } = await supabase
        .from('time_entries')
        .select('id, entry_date')
        .eq('user_id', user.id)
        .in('entry_date', dates);

      if (!entries?.length) {
        setSuspects([]);
        setLoading(false);
        return;
      }

      const entryMap = Object.fromEntries(entries.map(e => [e.entry_date, e.id]));
      const entryIds = entries.map(e => e.id);

      const { data: punches } = await supabase
        .from('punches')
        .select('id, time_entry_id, punch_time, punch_type')
        .in('time_entry_id', entryIds)
        .order('punch_time');

      // Group punches by entry
      const punchByEntry: Record<string, typeof punches> = {};
      for (const p of punches || []) {
        if (!punchByEntry[p.time_entry_id]) punchByEntry[p.time_entry_id] = [];
        punchByEntry[p.time_entry_id]!.push(p);
      }

      // Analyze patterns
      const offsetCounts: Record<number, number> = {};
      const results: SuspectDay[] = [];

      for (const sr of suspectRows) {
        const entryId = entryMap[sr.entry_date];
        if (!entryId) continue;
        const dayPunches = punchByEntry[entryId] || [];
        if (!dayPunches.length) continue;

        const schedStart = sr.schedule_expected_start;
        const firstIn = dayPunches.find(p => p.punch_type === 'in');
        if (!firstIn || !schedStart) continue;

        const schedHour = parseInt(schedStart.slice(0, 2));
        const schedMin = parseInt(schedStart.slice(3, 5));
        const schedMinutes = schedHour * 60 + schedMin;

        const utcDate = new Date(firstIn.punch_time);
        const utcMinutes = utcDate.getUTCHours() * 60 + utcDate.getUTCMinutes();

        // Try offsets 4-8 to find best match
        let bestOffset = 5;
        let bestDiff = Infinity;
        for (let off = 4; off <= 8; off++) {
          const localMin = ((utcMinutes - off * 60) + 1440) % 1440;
          const diff = Math.abs(localMin - schedMinutes);
          if (diff < bestDiff) {
            bestDiff = diff;
            bestOffset = off;
          }
        }

        offsetCounts[bestOffset] = (offsetCounts[bestOffset] || 0) + 1;

        results.push({
          entry_date: sr.entry_date,
          punches: dayPunches.map(p => ({ id: p.id, punch_time: p.punch_time, punch_type: p.punch_type })),
          schedule_start: schedStart,
          suggested_offset: bestOffset,
          suggested_label: `−${bestOffset}h`,
          confidence: bestDiff <= 30 ? 'high' : bestDiff <= 90 ? 'medium' : 'low',
        });
      }

      // If there's a dominant offset, boost its confidence
      const dominantOffset = Object.entries(offsetCounts).sort((a, b) => b[1] - a[1])[0];
      if (dominantOffset && parseInt(dominantOffset[1] as any) > results.length * 0.6) {
        const dOff = parseInt(dominantOffset[0]);
        for (const r of results) {
          if (r.suggested_offset === dOff) r.confidence = 'high';
        }
      }

      setSuspects(results);
    } catch (err: any) {
      toast({ title: 'Analysis failed', description: err.message, variant: 'destructive' });
    }
    setLoading(false);
  };

  const applyAll = async () => {
    if (!suspects?.length || !user) return;
    setApplying(true);
    try {
      let minDate = suspects[0].entry_date;
      let maxDate = suspects[0].entry_date;

      for (const day of suspects) {
        if (day.entry_date < minDate) minDate = day.entry_date;
        if (day.entry_date > maxDate) maxDate = day.entry_date;

        for (const p of day.punches) {
          const original = new Date(p.punch_time);
          const corrected = new Date(original.getTime() - day.suggested_offset * 60 * 60 * 1000);
          const { error } = await supabase
            .from('punches')
            .update({
              punch_time: corrected.toISOString(),
              is_edited: true,
              edited_at: new Date().toISOString(),
              edited_by: user.id,
              original_punch_time: p.punch_time,
              time_verified: true,
            })
            .eq('id', p.id);
          if (error) throw error;
        }
      }

      // Recompute entire range
      await supabase.rpc('recompute_attendance_range', {
        p_user_id: user.id,
        p_start_date: minDate,
        p_end_date: maxDate,
      });

      setDone(true);
      toast({ title: `Repaired ${suspects.length} days and recomputed attendance` });
      qc.invalidateQueries({ queryKey: ['attendance-day-status'] });
      qc.invalidateQueries({ queryKey: ['tardies'] });
    } catch (err: any) {
      toast({ title: 'Repair failed', description: err.message, variant: 'destructive' });
    }
    setApplying(false);
  };

  const fmt = (iso: string, offset: number) => {
    const d = new Date(new Date(iso).getTime() - offset * 60 * 60 * 1000);
    return d.toLocaleString('en-US', {
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5" />
          Auto-Repair All Suspect Days
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-4">
        <p className="text-sm text-muted-foreground">
          Analyzes all days marked "Needs Time Fix", detects the most likely timezone offset pattern, and repairs them in bulk.
        </p>

        <Button onClick={analyze} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
          Analyze Suspect Days
        </Button>

        {suspects !== null && (
          <div className="space-y-3">
            {suspects.length === 0 ? (
              <p className="text-sm text-success font-medium">✓ No suspect days found</p>
            ) : done ? (
              <div className="flex items-center gap-2 text-success font-medium">
                <Check className="h-5 w-5" /> All {suspects.length} days repaired and recomputed
              </div>
            ) : (
              <>
                <div className="rounded-md border border-warning/50 bg-warning/10 p-3 text-sm text-warning flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>Found {suspects.length} suspect days. Review the preview below, then apply.</span>
                </div>

                <div className="overflow-x-auto max-h-64 overflow-y-auto rounded border">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted">
                      <tr className="border-b">
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Date</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Schedule</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Fix</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">First IN → Corrected</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Confidence</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {suspects.map(s => {
                        const firstIn = s.punches.find(p => p.punch_type === 'in');
                        return (
                          <tr key={s.entry_date}>
                            <td className="px-3 py-2 font-medium">{formatDate(s.entry_date)}</td>
                            <td className="px-3 py-2 text-xs font-mono">{s.schedule_start?.slice(0, 5)}</td>
                            <td className="px-3 py-2 text-xs font-medium">{s.suggested_label}</td>
                            <td className="px-3 py-2 text-xs font-mono">
                              {firstIn ? (
                                <>
                                  <span className="text-muted-foreground">{new Date(firstIn.punch_time).toISOString().slice(11, 16)} UTC</span>
                                  {' → '}
                                  <span className="text-primary font-semibold">{fmt(firstIn.punch_time, s.suggested_offset)}</span>
                                </>
                              ) : '—'}
                            </td>
                            <td className="px-3 py-2">
                              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                                s.confidence === 'high' ? 'bg-success/20 text-success' :
                                s.confidence === 'medium' ? 'bg-warning/20 text-warning' :
                                'bg-muted text-muted-foreground'
                              }`}>{s.confidence}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <Button onClick={applyAll} disabled={applying} variant="destructive">
                  {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Zap className="mr-2 h-4 w-4" />}
                  Apply All Fixes ({suspects.length} days)
                </Button>
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
