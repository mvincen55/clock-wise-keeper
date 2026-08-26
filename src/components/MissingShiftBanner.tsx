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
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertTriangle, CalendarDays, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useQueryClient } from '@tanstack/react-query';

// Punch backfill was removed from this banner in the server-authoritative
// punching phase: punch rows can no longer be written from the client, so
// worked-but-unrecorded days go through the manager (correction requests
// gain the missing-day path in the transactional-editing phase).
type ResolveAction = 'pto' | 'excused' | 'ignore';

export function MissingShiftBanner({ missingDays }: { missingDays: MissingShiftDay[] }) {
  const [actionDay, setActionDay] = useState<MissingShiftDay | null>(null);
  const [action, setAction] = useState<ResolveAction | null>(null);
  const [reason, setReason] = useState('');
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
        const { data: exc } = await supabase.from('attendance_exceptions')
          .select('id').eq('exception_date', actionDay.date).maybeSingle();
        if (exc) {
          await resolveException.mutateAsync({
            id: exc.id,
            reason_text: reason || 'PTO entry added',
            resolution_action: 'pto_added',
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
        await supabase.from('audit_events').insert({
          user_id: user.id,
          org_id: org.org_id,
          employee_id: org.employee_id,
          actor_id: user.id,
          event_type: 'missing_shift_' + action,
          event_details: { reason, date: actionDay.date, target_employee_id: org.employee_id } as any,
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
            <DialogDescription>
              No work recorded for your scheduled shift. What happened?
            </DialogDescription>
          </DialogHeader>

          {!action && (
            <div className="grid grid-cols-1 gap-2">
              <Button variant="outline" className="justify-start" onClick={() => setAction('pto')}>
                <CalendarDays className="mr-2 h-4 w-4" /> Add PTO Entry
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => setAction('excused')}>
                Mark as Excused (requires comment)
              </Button>
              <Button variant="ghost" className="justify-start text-muted-foreground" onClick={() => setAction('ignore')}>
                <X className="mr-2 h-4 w-4" /> Ignore (requires comment)
              </Button>
              <p className="text-xs text-muted-foreground pt-1">
                Worked this day? Punch times are recorded by the server and can't be
                typed in here — ask your manager to correct the day's record.
              </p>
            </div>
          )}

          {action && (
            <div className="space-y-4">
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