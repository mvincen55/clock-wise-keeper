import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useAddDayOff } from '@/hooks/useDaysOff';
import { useAddClosure } from '@/hooks/useOfficeClosures';
import { useResolveException, useCreateException } from '@/hooks/useAttendanceExceptions';
import { useRecomputeAttendance, AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import { PunchEditorModal } from '@/components/PunchEditorModal';
import { formatDate } from '@/lib/time-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Plus, CalendarOff, Building2, EyeOff, Pencil, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type ActionType = 'add_punches' | 'mark_day_off' | 'mark_closed' | 'ignore' | null;

export function AttendanceActions({ row }: { row: AttendanceDayStatusRow }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [action, setAction] = useState<ActionType>(null);
  const [punchEditorOpen, setPunchEditorOpen] = useState(false);
  const addDayOff = useAddDayOff();
  const addClosure = useAddClosure();
  const createException = useCreateException();
  const resolveException = useResolveException();
  const recompute = useRecomputeAttendance();

  // Day off form
  const [dayOffForm, setDayOffForm] = useState({
    type: 'scheduled_with_notice' as string,
    hours: '',
    notes: '',
    reason: '',
  });

  // Closure form
  const [closureForm, setClosureForm] = useState({
    name: '',
    is_full_day: true,
    hours: '8',
    reason: '',
  });

  // Ignore form
  const [ignoreReason, setIgnoreReason] = useState('');

  const hasIssue = row.is_absent || row.is_incomplete || (row.is_late && row.tardy_approval_status === 'unreviewed') || row.timezone_suspect;
  if (!hasIssue) return null;

  const handleMarkDayOff = async () => {
    if (!dayOffForm.reason.trim()) return;
    try {
      await addDayOff.mutateAsync({
        date_start: row.entry_date,
        date_end: row.entry_date,
        type: dayOffForm.type as any,
        hours: dayOffForm.hours ? parseFloat(dayOffForm.hours) : undefined,
        notes: `${dayOffForm.notes}${dayOffForm.notes ? ' — ' : ''}Reason: ${dayOffForm.reason}`,
      });
      await recompute.mutateAsync({ startDate: row.entry_date, endDate: row.entry_date });
      toast({ title: 'Day off created' });
      setAction(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleMarkClosed = async () => {
    if (!closureForm.reason.trim() || !closureForm.name.trim()) return;
    try {
      await addClosure.mutateAsync({
        closure_date: row.entry_date,
        name: closureForm.name,
        is_full_day: closureForm.is_full_day,
        hours: parseFloat(closureForm.hours) || 8,
      });
      // Log audit
      if (user) {
        await supabase.from('audit_events').insert({
          user_id: user.id,
          event_type: 'mark_office_closed',
          event_details: { date: row.entry_date, name: closureForm.name, reason: closureForm.reason },
          related_date: row.entry_date,
        });
      }
      await recompute.mutateAsync({ startDate: row.entry_date, endDate: row.entry_date });
      toast({ title: 'Office closure created' });
      setAction(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleIgnore = async () => {
    if (!ignoreReason.trim()) return;
    try {
      // Create exception if not exists, then ignore it
      await createException.mutateAsync({ exception_date: row.entry_date, type: 'other' });
      // Get the exception we just created
      const { data: exceptions } = await supabase
        .from('attendance_exceptions')
        .select('id')
        .eq('exception_date', row.entry_date)
        .eq('user_id', user?.id || '')
        .limit(1);
      if (exceptions?.[0]) {
        await resolveException.mutateAsync({
          id: exceptions[0].id,
          reason_text: ignoreReason,
          resolution_action: 'ignored_absence',
          status: 'ignored',
        });
      }
      await recompute.mutateAsync({ startDate: row.entry_date, endDate: row.entry_date });
      toast({ title: 'Day ignored' });
      setAction(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="h-7 w-7">
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {(row.is_absent || row.is_incomplete) && (
            <DropdownMenuItem onClick={() => {
              if (row.is_absent) {
                navigate(`/timesheet?date=${row.entry_date}`);
              } else {
                setPunchEditorOpen(true);
              }
            }}>
              <Pencil className="h-3.5 w-3.5 mr-2" />
              {row.is_absent ? 'Add Punches' : 'Edit Punches'}
            </DropdownMenuItem>
          )}
          {row.is_absent && (
            <>
              <DropdownMenuItem onClick={() => setAction('mark_day_off')}>
                <CalendarOff className="h-3.5 w-3.5 mr-2" />
                Mark as Day Off
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAction('mark_closed')}>
                <Building2 className="h-3.5 w-3.5 mr-2" />
                Mark Office Closed
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAction('ignore')}>
                <EyeOff className="h-3.5 w-3.5 mr-2" />
                Ignore (with reason)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Punch Editor - only available when entry exists (incomplete rows) */}
      {!row.is_absent && (
        <PunchEditorModal
          open={punchEditorOpen}
          onClose={() => setPunchEditorOpen(false)}
          entryId=""
          entryDate={row.entry_date}
          punches={[]}
        />
      )}

      {/* Mark Day Off Modal */}
      <Dialog open={action === 'mark_day_off'} onOpenChange={v => !v && setAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark as Day Off — {formatDate(row.entry_date)}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Type</Label>
              <Select value={dayOffForm.type} onValueChange={v => setDayOffForm({ ...dayOffForm, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled_with_notice">Scheduled w/ Notice</SelectItem>
                  <SelectItem value="unscheduled">Unscheduled</SelectItem>
                  <SelectItem value="medical_leave">Medical Leave</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Hours (optional)</Label>
              <Input type="number" value={dayOffForm.hours} onChange={e => setDayOffForm({ ...dayOffForm, hours: e.target.value })} placeholder="8" />
            </div>
            <div className="space-y-1">
              <Label>Notes</Label>
              <Textarea value={dayOffForm.notes} onChange={e => setDayOffForm({ ...dayOffForm, notes: e.target.value })} placeholder="Optional notes" />
            </div>
            <div className="space-y-1">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea value={dayOffForm.reason} onChange={e => setDayOffForm({ ...dayOffForm, reason: e.target.value })} placeholder="Required: why this day is off" />
            </div>
            <Button onClick={handleMarkDayOff} disabled={!dayOffForm.reason.trim() || addDayOff.isPending} className="w-full">
              {addDayOff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Day Off
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Mark Office Closed Modal */}
      <Dialog open={action === 'mark_closed'} onOpenChange={v => !v && setAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Mark Office Closed — {formatDate(row.entry_date)}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Closure Name <span className="text-destructive">*</span></Label>
              <Input value={closureForm.name} onChange={e => setClosureForm({ ...closureForm, name: e.target.value })} placeholder="e.g. Snow Day" />
            </div>
            <div className="flex items-center gap-3">
              <Label>Full Day</Label>
              <Switch checked={closureForm.is_full_day} onCheckedChange={v => setClosureForm({ ...closureForm, is_full_day: v })} />
            </div>
            {!closureForm.is_full_day && (
              <div className="space-y-1">
                <Label>Hours</Label>
                <Input type="number" value={closureForm.hours} onChange={e => setClosureForm({ ...closureForm, hours: e.target.value })} />
              </div>
            )}
            <div className="space-y-1">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea value={closureForm.reason} onChange={e => setClosureForm({ ...closureForm, reason: e.target.value })} placeholder="Required: reason for closure" />
            </div>
            <Button onClick={handleMarkClosed} disabled={!closureForm.reason.trim() || !closureForm.name.trim() || addClosure.isPending} className="w-full">
              {addClosure.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save Closure
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Ignore Modal */}
      <Dialog open={action === 'ignore'} onOpenChange={v => !v && setAction(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ignore Absence — {formatDate(row.entry_date)}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea value={ignoreReason} onChange={e => setIgnoreReason(e.target.value)} placeholder="Required: why this absence is being ignored" />
            </div>
            <Button onClick={handleIgnore} disabled={!ignoreReason.trim()} className="w-full">
              Ignore Day
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
