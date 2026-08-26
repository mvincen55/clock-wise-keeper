import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
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
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { MoreHorizontal, Plus, CalendarOff, Building2, EyeOff, Pencil, Loader2, CalendarPlus, Stethoscope, CalendarMinus } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

type ActionType = 'add_punches' | 'mark_day_off' | 'mark_closed' | 'ignore' | null;

interface AttendanceActionsProps {
  row: AttendanceDayStatusRow;
  /** If true, show actions even on rows without issues (for quick-add from any row) */
  alwaysShow?: boolean;
}

export function AttendanceActions({ row, alwaysShow = false }: AttendanceActionsProps) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { toast } = useToast();
  const [action, setAction] = useState<ActionType>(null);
  const [punchEditorOpen, setPunchEditorOpen] = useState(false);
  // Loaded when the editor opens: the ROW's real entry and punches.
  // entryId stays null for a fully missed day (the RPC creates the entry).
  const [editorData, setEditorData] = useState<{
    entryId: string | null;
    punches: import('@/hooks/useTimeEntries').PunchRow[];
    employeeId: string;
    employeeName?: string;
  } | null>(null);
  const [editorLoading, setEditorLoading] = useState(false);
  const addDayOff = useAddDayOff();
  const addClosure = useAddClosure();
  const createException = useCreateException();
  const resolveException = useResolveException();
  const recompute = useRecomputeAttendance();

  // The row belongs to whichever employee the attendance table shows —
  // never assume the caller. (Preflight adjustment #8: every action in
  // this menu targets the ROW's employee.)
  const resolveEmployee = async (): Promise<{ id: string; name?: string } | null> => {
    if (row.employee_id) {
      const { data } = await supabase.from('employees').select('id, display_name').eq('id', row.employee_id).maybeSingle();
      if (data) return { id: data.id, name: data.display_name };
    }
    const { data } = await supabase.from('employees').select('id, display_name').eq('user_id', row.user_id).limit(1).maybeSingle();
    return data ? { id: data.id, name: data.display_name } : null;
  };

  const openPunchEditor = async () => {
    setEditorLoading(true);
    try {
      const emp = await resolveEmployee();
      if (!emp) {
        toast({ title: 'No employee record for this row', variant: 'destructive' });
        return;
      }
      const { data: entry } = await supabase
        .from('time_entries')
        .select('id')
        .eq('employee_id', emp.id)
        .eq('entry_date', row.entry_date)
        .maybeSingle();
      let punches: import('@/hooks/useTimeEntries').PunchRow[] = [];
      if (entry) {
        const { data: p } = await supabase
          .from('punches')
          .select('*')
          .eq('time_entry_id', entry.id)
          .order('seq', { ascending: true });
        punches = (p || []) as import('@/hooks/useTimeEntries').PunchRow[];
      }
      setEditorData({ entryId: entry?.id ?? null, punches, employeeId: emp.id, employeeName: emp.name });
      setPunchEditorOpen(true);
    } catch (err: any) {
      toast({ title: 'Could not load punches', description: err.message, variant: 'destructive' });
    } finally {
      setEditorLoading(false);
    }
  };

  // Day off form
  const [dayOffForm, setDayOffForm] = useState({
    type: 'scheduled_with_notice' as string,
    hours: '0',
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
  
  // If alwaysShow is false, only render when there's an issue
  if (!alwaysShow && !hasIssue) return null;

  const openDayOffWithType = (type: string) => {
    setDayOffForm({ type, hours: '0', notes: '', reason: '' });
    setAction('mark_day_off');
  };

  const requiresNotes = dayOffForm.type === 'medical_leave';

  const handleMarkDayOff = async () => {
    if (!dayOffForm.reason.trim()) return;
    if (requiresNotes && !dayOffForm.notes.trim()) return;
    try {
      const emp = await resolveEmployee();
      if (!emp) throw new Error('No employee record for this row');
      await addDayOff.mutateAsync({
        date_start: row.entry_date,
        date_end: row.entry_date,
        type: dayOffForm.type as any,
        hours: dayOffForm.hours ? parseFloat(dayOffForm.hours) : undefined,
        notes: `${dayOffForm.notes}${dayOffForm.notes ? ' — ' : ''}Reason: ${dayOffForm.reason}`,
        target: { user_id: row.user_id, employee_id: emp.id },
      });
      await recompute.mutateAsync({ startDate: row.entry_date, endDate: row.entry_date, userId: row.user_id });
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
      if (user && ctx) {
        await supabase.from('audit_events').insert({
          user_id: user.id,
          org_id: ctx.org_id,
          employee_id: ctx.employee_id,
          actor_id: user.id,
          event_type: 'mark_office_closed',
          // Office-scoped event: no single employee's record is the target.
          event_details: { date: row.entry_date, name: closureForm.name, reason: closureForm.reason, target_employee_id: null },
          related_date: row.entry_date,
        });
      }
      await recompute.mutateAsync({ startDate: row.entry_date, endDate: row.entry_date, userId: row.user_id });
      toast({ title: 'Office closure created' });
      setAction(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleIgnore = async () => {
    if (!ignoreReason.trim()) return;
    try {
      const emp = await resolveEmployee();
      if (!emp) throw new Error('No employee record for this row');
      await createException.mutateAsync({
        exception_date: row.entry_date,
        type: 'other',
        target: { user_id: row.user_id, employee_id: emp.id },
      });
      const { data: exceptions } = await supabase
        .from('attendance_exceptions')
        .select('id')
        .eq('exception_date', row.entry_date)
        .eq('user_id', row.user_id)
        .limit(1);
      if (exceptions?.[0]) {
        await resolveException.mutateAsync({
          id: exceptions[0].id,
          reason_text: ignoreReason,
          resolution_action: 'ignored_absence',
          status: 'ignored',
        });
      }
      await recompute.mutateAsync({ startDate: row.entry_date, endDate: row.entry_date, userId: row.user_id });
      toast({ title: 'Day ignored' });
      setAction(null);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const dayOffTypeLabel: Record<string, string> = {
    scheduled_with_notice: 'Scheduled w/ Notice',
    unscheduled: 'Unscheduled',
    medical_leave: 'Medical Leave',
    other: 'Other',
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
          {/* Quick-add day off options */}
          <DropdownMenuItem onClick={() => openDayOffWithType('scheduled_with_notice')}>
            <CalendarPlus className="h-3.5 w-3.5 mr-2" />
            Add Scheduled Day Off
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDayOffWithType('unscheduled')}>
            <CalendarMinus className="h-3.5 w-3.5 mr-2" />
            Add Unscheduled Day Off
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => openDayOffWithType('medical_leave')}>
            <Stethoscope className="h-3.5 w-3.5 mr-2" />
            Add Medical Leave
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setAction('mark_closed')}>
            <Building2 className="h-3.5 w-3.5 mr-2" />
            Add Closure
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={editorLoading} onClick={() => { void openPunchEditor(); }}>
            {editorLoading
              ? <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
              : <Pencil className="h-3.5 w-3.5 mr-2" />}
            {row.is_absent ? 'Add Punches' : 'Add/Edit Punches'}
          </DropdownMenuItem>
          {row.is_absent && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setAction('ignore')}>
                <EyeOff className="h-3.5 w-3.5 mr-2" />
                Ignore (with reason)
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Punch Editor — the row's real entry and punches, or null-entry
          mode for a fully missed day. The save RPC resolves the target
          employee from the entry row and creates the entry when needed. */}
      {editorData && (
        <PunchEditorModal
          open={punchEditorOpen}
          onClose={() => { setPunchEditorOpen(false); setEditorData(null); }}
          entryId={editorData.entryId}
          entryDate={row.entry_date}
          punches={editorData.punches}
          employeeId={editorData.employeeId}
          employeeName={editorData.employeeName}
          onSaved={() => {
            void recompute.mutateAsync({ startDate: row.entry_date, endDate: row.entry_date, userId: row.user_id });
          }}
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
              <Input type="number" value={dayOffForm.hours} onChange={e => setDayOffForm({ ...dayOffForm, hours: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label>Notes{requiresNotes ? <span className="text-destructive"> *</span> : ' (optional)'}</Label>
              <Textarea value={dayOffForm.notes} onChange={e => setDayOffForm({ ...dayOffForm, notes: e.target.value })} placeholder={requiresNotes ? 'Required: describe the reason' : 'Optional notes'} />
            </div>
            <div className="space-y-1">
              <Label>Reason <span className="text-destructive">*</span></Label>
              <Textarea value={dayOffForm.reason} onChange={e => setDayOffForm({ ...dayOffForm, reason: e.target.value })} placeholder="Required: why this day is off" />
            </div>
            <Button
              onClick={handleMarkDayOff}
              disabled={!dayOffForm.reason.trim() || (requiresNotes && !dayOffForm.notes.trim()) || addDayOff.isPending}
              className="w-full"
            >
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
