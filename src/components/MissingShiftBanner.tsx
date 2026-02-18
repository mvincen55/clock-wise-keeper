import { useState } from 'react';
import { MissingShiftDay } from '@/hooks/useMissingShifts';
import { useCreateException, useResolveException } from '@/hooks/useAttendanceExceptions';
import { useAddDayOff } from '@/hooks/useDaysOff';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/time-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CalendarDays, Clock, MapPin, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

type ResolveAction = 'pto' | 'remote' | 'manual' | 'excused' | 'ignore';

export function MissingShiftBanner({ missingDays }: { missingDays: MissingShiftDay[] }) {
  const [actionDay, setActionDay] = useState<MissingShiftDay | null>(null);
  const [action, setAction] = useState<ResolveAction | null>(null);
  const [reason, setReason] = useState('');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const createException = useCreateException();
  const resolveException = useResolveException();
  const addDayOff = useAddDayOff();
  const { user } = useAuth();
  const { data: org } = useOrgContext();
  const { toast } = useToast();
  const qc = useQueryClient();

  const openDays = missingDays.filter(d => !d.exception || d.exception.status === 'open');

  if (!openDays.length) return null;

  const handleAction = async () => {
    if (!actionDay || !action || !user || !org) return;

    // Ensure exception record exists
    if (!actionDay.exception) {
      await createException.mutateAsync({ exception_date: actionDay.date });
    }

    try {
      if (action === 'pto') {
        await addDayOff.mutateAsync({
          date_start: actionDay.date,
          date_end: actionDay.date,
          type: 'scheduled_with_notice',
          notes: reason || 'Added from missing shift prompt',
        });
        // Resolve exception
        const { data: exc } = await supabase.from('attendance_exceptions')
          .select('id').eq('exception_date', actionDay.date).maybeSingle();
        if (exc) {
          await resolveException.mutateAsync({
            id: exc.id,
            reason_text: reason || 'PTO entry added',
            resolution_action: 'pto_added',
          });
        }
      } else if (action === 'remote' || action === 'manual') {
        if (!clockIn || !clockOut) {
          toast({ title: 'Please enter clock in and out times', variant: 'destructive' });
          return;
        }
        if (!reason && action === 'manual') {
          toast({ title: 'Reason required for manual punch entry', variant: 'destructive' });
          return;
        }
        // Create time entry + punches
        const inTime = new Date(actionDay.date + 'T' + clockIn + ':00');
        const outTime = new Date(actionDay.date + 'T' + clockOut + ':00');
        const totalMin = Math.round((outTime.getTime() - inTime.getTime()) / 60000);

        const { data: entry, error: entryErr } = await supabase.from('time_entries').insert({
          user_id: user.id,
          org_id: org.org_id,
          employee_id: org.employee_id,
          entry_date: actionDay.date,
          source: 'manual' as const,
          is_remote: action === 'remote',
          total_minutes: totalMin,
          notes: reason || (action === 'remote' ? 'Remote work (from missing shift)' : 'Manual entry (from missing shift)'),
        }).select('id').single();
        if (entryErr) throw entryErr;

        await supabase.from('punches').insert([
          { time_entry_id: entry.id, seq: 0, punch_type: 'in' as const, punch_time: (() => { inTime.setSeconds(0, 0); return inTime.toISOString(); })(), source: 'manual' as const, employee_id: org.employee_id, org_id: org.org_id },
          { time_entry_id: entry.id, seq: 1, punch_type: 'out' as const, punch_time: (() => { outTime.setSeconds(0, 0); return outTime.toISOString(); })(), source: 'manual' as const, employee_id: org.employee_id, org_id: org.org_id },
        ]);

        // Audit
        await supabase.from('audit_events').insert({
          user_id: user.id,
          org_id: org.org_id,
          employee_id: org.employee_id,
          event_type: 'missing_shift_resolved',
          event_details: { action, reason, date: actionDay.date } as any,
          related_date: actionDay.date,
          related_entry_id: entry.id,
        });

        const { data: exc } = await supabase.from('attendance_exceptions')
          .select('id').eq('exception_date', actionDay.date).maybeSingle();
        if (exc) {
          await resolveException.mutateAsync({
            id: exc.id,
            reason_text: reason || `${action} punches added`,
            resolution_action: action === 'remote' ? 'remote_added' : 'manual_punches_added',
          });
        }
      } else if (action === 'excused' || action === 'ignore') {
        if (!reason) {
          toast({ title: 'Comment is required', variant: 'destructive' });
          return;
        }
        const { data: exc } = await supabase.from('attendance_exceptions')
          .select('id').eq('exception_date', actionDay.date).maybeSingle();
        if (exc) {
          await resolveException.mutateAsync({
            id: exc.id,
            reason_text: reason,
            resolution_action: action,
            status: action === 'ignore' ? 'ignored' : 'resolved',
          });
        }
        // Also add audit
        await supabase.from('audit_events').insert({
          user_id: user.id,
          org_id: org.org_id,
          employee_id: org.employee_id,
          event_type: 'missing_shift_' + action,
          event_details: { reason, date: actionDay.date } as any,
          related_date: actionDay.date,
        });
      }

      toast({ title: 'Missing shift resolved' });
      qc.invalidateQueries({ queryKey: ['attendance-exceptions'] });
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['days-off'] });
      setActionDay(null);
      setAction(null);
      setReason('');
      setClockIn('');
      setClockOut('');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <>
      <Card className="border-warning/50 bg-warning/5">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-warning font-semibold">
            <AlertTriangle className="h-5 w-5" />
            Missing Shift{openDays.length > 1 ? 's' : ''} Detected
          </div>
          {openDays.slice(0, 5).map(day => (
            <div key={day.date} className="flex flex-wrap items-center gap-3 bg-background rounded-lg px-3 py-2">
              <span className="text-sm font-medium">{formatDate(day.date)}</span>
              <span className="text-xs text-muted-foreground">No work recorded for your scheduled shift.</span>
              <Button size="sm" variant="outline" onClick={() => { setActionDay(day); setAction(null); }}>
                Respond
              </Button>
            </div>
          ))}
          {openDays.length > 5 && (
            <p className="text-xs text-muted-foreground">+ {openDays.length - 5} more missing shift(s)</p>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!actionDay} onOpenChange={open => { if (!open) setActionDay(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Missing Shift — {actionDay ? formatDate(actionDay.date) : ''}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground mb-4">
            No work recorded for your scheduled shift. What happened?
          </p>

          {!action && (
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="justify-start" onClick={() => setAction('pto')}>
                <CalendarDays className="mr-2 h-4 w-4" /> Add PTO Entry
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setAction('remote')}>
                <MapPin className="mr-2 h-4 w-4" /> Mark Remote &amp; Add Punches
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setAction('manual')}>
                <Clock className="mr-2 h-4 w-4" /> Add Manual Clock In/Out
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setAction('excused')}>
                Mark as Excused (requires comment)
              </Button>
              <Button variant="ghost" className="justify-start text-muted-foreground" onClick={() => setAction('ignore')}>
                <X className="mr-2 h-4 w-4" /> Ignore (requires comment)
              </Button>
            </div>
          )}

          {action && (
            <div className="space-y-4">
              {(action === 'remote' || action === 'manual') && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Clock In</Label>
                    <Input type="time" value={clockIn} onChange={e => setClockIn(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Clock Out</Label>
                    <Input type="time" value={clockOut} onChange={e => setClockOut(e.target.value)} />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-xs">
                  {action === 'pto' ? 'Notes (optional)' : 'Reason (required)'}
                </Label>
                <Textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  placeholder="Explain what happened..."
                  rows={3}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => setAction(null)} variant="ghost">Back</Button>
                <Button onClick={handleAction} className="flex-1">Confirm</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
