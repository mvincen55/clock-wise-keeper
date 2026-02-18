import { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, Loader2, Check, Clock, Wrench, Zap } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';

type PunchRow = {
  id: string;
  punch_time: string;
  punch_type: string;
  seq: number;
  time_verified: boolean;
  original_punch_time: string | null;
};

type Suggestion = {
  label: string;
  description: string;
  offsetHours: number;
  direction: 'subtract' | 'add';
  confidence: 'high' | 'medium' | 'low';
};

type Props = {
  open: boolean;
  entryDate: string;
  timeEntryId: string | null;
  scheduleStart: string | null;
  timezone: string;
  onClose: () => void;
};

export function TimeFixModal({ open, entryDate, timeEntryId, scheduleStart, timezone, onClose }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();

  const [punches, setPunches] = useState<PunchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [committed, setCommitted] = useState(false);
  const [mode, setMode] = useState<'suggestion' | 'shift' | 'ignore'>('suggestion');
  const [shiftHours, setShiftHours] = useState(5);
  const [shiftDirection, setShiftDirection] = useState<'subtract' | 'add'>('subtract');

  const [resolvedEntryId, setResolvedEntryId] = useState<string | null>(null);

  // Load punches when modal opens — resolve time_entry_id if not provided
  useEffect(() => {
    if (!open || !user) return;
    setCommitted(false);
    setLoading(true);
    setPunches([]);
    setResolvedEntryId(null);

    const load = async () => {
      let entryId = timeEntryId;
      if (!entryId) {
        const { data: entries } = await supabase
          .from('time_entries')
          .select('id')
          .eq('user_id', user.id)
          .eq('entry_date', entryDate)
          .limit(1);
        entryId = entries?.[0]?.id || null;
      }
      setResolvedEntryId(entryId);
      if (!entryId) { setLoading(false); return; }

      const { data } = await supabase
        .from('punches')
        .select('id, punch_time, punch_type, seq, time_verified, original_punch_time')
        .eq('time_entry_id', entryId)
        .order('seq');
      setPunches((data || []) as PunchRow[]);
      setLoading(false);
    };
    load();
  }, [open, timeEntryId, entryDate, user]);

  const tz = timezone || 'America/New_York';

  // Convert to local time for display
  const toLocal = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      timeZone: tz,
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  const toLocalFull = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', {
      timeZone: tz,
      month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', hour12: true,
    });
  };

  // Smart suggestions
  const suggestions = useMemo((): Suggestion[] => {
    if (!punches.length || !scheduleStart) return [];

    const results: Suggestion[] = [];
    const scheduleHour = parseInt(scheduleStart.slice(0, 2));
    const scheduleMin = parseInt(scheduleStart.slice(3, 5));
    const scheduleMinutes = scheduleHour * 60 + scheduleMin;

    // Get the first IN punch local time
    const firstIn = punches.find(p => p.punch_type === 'in');
    if (!firstIn) return [];

    const firstInDate = new Date(firstIn.punch_time);
    // Get UTC hour of punch
    const utcHour = firstInDate.getUTCHours();
    const utcMin = firstInDate.getUTCMinutes();
    const utcMinutes = utcHour * 60 + utcMin;

    // Check common offsets
    const offsets = [
      { hours: 4, label: 'EDT (UTC-4)', desc: 'Eastern Daylight Time' },
      { hours: 5, label: 'EST (UTC-5)', desc: 'Eastern Standard Time' },
      { hours: 6, label: 'CST (UTC-6)', desc: 'Central Standard Time' },
      { hours: 7, label: 'MST (UTC-7)', desc: 'Mountain Standard Time' },
      { hours: 8, label: 'PST (UTC-8)', desc: 'Pacific Standard Time' },
    ];

    for (const off of offsets) {
      const localMinutes = ((utcMinutes - off.hours * 60) + 1440) % 1440;
      const diff = Math.abs(localMinutes - scheduleMinutes);
      
      if (diff <= 120) { // Within 2 hours of schedule start
        const confidence = diff <= 30 ? 'high' : diff <= 60 ? 'medium' : 'low';
        results.push({
          label: `Apply ${off.label} offset`,
          description: `Shifts punches −${off.hours}h. First punch → ${formatMinutes(localMinutes)}`,
          offsetHours: off.hours,
          direction: 'subtract',
          confidence,
        });
      }
    }

    // Also check if punches are already correct (no offset needed)
    // Get local time using browser's interpretation
    const localStr = firstInDate.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false });
    const [lh, lm] = localStr.split(':').map(Number);
    const localMins = lh * 60 + lm;
    const directDiff = Math.abs(localMins - scheduleMinutes);
    if (directDiff <= 120) {
      results.unshift({
        label: 'Trust stored values',
        description: `Punches already correct in ${tz}. Just recompute.`,
        offsetHours: 0,
        direction: 'subtract',
        confidence: directDiff <= 30 ? 'high' : 'medium',
      });
    }

    // Sort by confidence
    const confOrder = { high: 0, medium: 1, low: 2 };
    results.sort((a, b) => confOrder[a.confidence] - confOrder[b.confidence]);

    return results;
  }, [punches, scheduleStart, tz]);

  function formatMinutes(m: number): string {
    const h = Math.floor(m / 60);
    const min = m % 60;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return `${h12}:${String(min).padStart(2, '0')} ${ampm}`;
  }

  const getPreviewTime = (punchTime: string, offsetHours: number, direction: 'subtract' | 'add') => {
    if (offsetHours === 0) return punchTime;
    const d = new Date(punchTime);
    const ms = offsetHours * 60 * 60 * 1000;
    return new Date(d.getTime() + (direction === 'subtract' ? -ms : ms)).toISOString();
  };

  const applySuggestion = async (s: Suggestion) => {
    if (!user || !timeEntryId) return;
    setCommitting(true);
    try {
      if (s.offsetHours !== 0) {
        for (const p of punches) {
          const corrected = getPreviewTime(p.punch_time, s.offsetHours, s.direction);
          const { error } = await supabase
            .from('punches')
            .update({
              punch_time: corrected,
              is_edited: true,
              edited_at: new Date().toISOString(),
              edited_by: user.id,
              original_punch_time: p.punch_time,
              time_verified: true,
            })
            .eq('id', p.id);
          if (error) throw error;
        }
      } else {
        // Trust mode: just mark as verified
        for (const p of punches) {
          const { error } = await supabase
            .from('punches')
            .update({ time_verified: true })
            .eq('id', p.id);
          if (error) throw error;
        }
      }

      // Recompute
      await supabase.rpc('recompute_attendance_range', {
        p_user_id: user.id,
        p_start_date: entryDate,
        p_end_date: entryDate,
      });

      setCommitted(true);
      toast({ title: `Fixed ${formatDate(entryDate)} — attendance recomputed` });
      qc.invalidateQueries({ queryKey: ['attendance-day-status'] });
      qc.invalidateQueries({ queryKey: ['tardies'] });
    } catch (err: any) {
      toast({ title: 'Fix failed', description: err.message, variant: 'destructive' });
    }
    setCommitting(false);
  };

  const applyManualShift = async () => {
    await applySuggestion({
      label: 'Manual',
      description: '',
      offsetHours: shiftHours,
      direction: shiftDirection,
      confidence: 'medium',
    });
  };

  const markIgnored = async () => {
    if (!user) return;
    setCommitting(true);
    try {
      // Mark all punches as verified without changing times
      for (const p of punches) {
        const { error } = await supabase
          .from('punches')
          .update({ time_verified: true })
          .eq('id', p.id);
        if (error) throw error;
      }

      await supabase.rpc('recompute_attendance_range', {
        p_user_id: user.id,
        p_start_date: entryDate,
        p_end_date: entryDate,
      });

      setCommitted(true);
      toast({ title: `${formatDate(entryDate)} marked as reviewed` });
      qc.invalidateQueries({ queryKey: ['attendance-day-status'] });
      qc.invalidateQueries({ queryKey: ['tardies'] });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
    setCommitting(false);
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            Fix Time Interpretation — {formatDate(entryDate)}
          </DialogTitle>
          <DialogDescription>
            Timezone: {tz} | Schedule: {scheduleStart?.slice(0, 5) || 'N/A'}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : committed ? (
          <div className="py-6 text-center space-y-2">
            <Check className="h-10 w-10 text-success mx-auto" />
            <p className="font-medium text-success">Day fixed and recomputed</p>
            <Button variant="outline" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Raw punch data */}
            <div className="rounded border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 border-b">
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Type</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Raw (UTC)</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Local ({tz.split('/')[1]})</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">Diff from Sched</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {punches.map(p => {
                    const localTime = toLocal(p.punch_time);
                    let diff = '';
                    if (scheduleStart && p.punch_type === 'in') {
                      const d = new Date(p.punch_time);
                      const localStr = d.toLocaleString('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hour12: false });
                      const [lh, lm] = localStr.split(':').map(Number);
                      const sh = parseInt(scheduleStart.slice(0, 2));
                      const sm = parseInt(scheduleStart.slice(3, 5));
                      const diffMin = (lh * 60 + lm) - (sh * 60 + sm);
                      diff = diffMin >= 0 ? `+${diffMin}m` : `${diffMin}m`;
                    }
                    return (
                      <tr key={p.id}>
                        <td className="px-3 py-2 uppercase text-xs font-medium">{p.punch_type}</td>
                        <td className="px-3 py-2 font-mono text-xs">{new Date(p.punch_time).toISOString().slice(11, 16)} UTC</td>
                        <td className="px-3 py-2 font-mono text-xs">{localTime}</td>
                        <td className="px-3 py-2 text-xs font-medium">{diff}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Smart suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs font-medium flex items-center gap-1"><Zap className="h-3 w-3" /> Suggested Fixes</Label>
                {suggestions.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded border hover:bg-muted/50">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                          s.confidence === 'high' ? 'bg-success/20 text-success' :
                          s.confidence === 'medium' ? 'bg-warning/20 text-warning' :
                          'bg-muted text-muted-foreground'
                        }`}>{s.confidence}</span>
                        <span className="text-sm font-medium">{s.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.description}</p>
                      {s.offsetHours > 0 && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          Preview: {punches.filter(p => p.punch_type === 'in').slice(0, 1).map(p => (
                            <span key={p.id}>
                              {toLocal(p.punch_time)} → <span className="text-primary font-medium">{toLocalFull(getPreviewTime(p.punch_time, s.offsetHours, s.direction))}</span>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" onClick={() => applySuggestion(s)} disabled={committing}>
                      {committing ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Apply'}
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {/* Manual shift */}
            <div className="border-t pt-3 space-y-2">
              <Label className="text-xs font-medium">Manual Shift</Label>
              <div className="flex items-end gap-2">
                <Select value={shiftDirection} onValueChange={v => setShiftDirection(v as any)}>
                  <SelectTrigger className="w-28 h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="subtract">Subtract</SelectItem>
                    <SelectItem value="add">Add</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" min={0} max={24} step={0.5} value={shiftHours}
                  onChange={e => setShiftHours(parseFloat(e.target.value) || 0)}
                  className="w-16 h-8 text-xs" />
                <span className="text-xs text-muted-foreground">hours</span>
                <Button size="sm" variant="outline" onClick={applyManualShift} disabled={committing}>
                  Apply
                </Button>
              </div>
            </div>

            {/* Ignore */}
            <div className="border-t pt-3">
              <Button variant="ghost" size="sm" className="text-xs text-muted-foreground" onClick={markIgnored} disabled={committing}>
                <Clock className="mr-1 h-3 w-3" /> Ignore — mark as reviewed without changes
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
