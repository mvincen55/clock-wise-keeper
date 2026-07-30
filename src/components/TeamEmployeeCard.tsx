import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import MemberProfileRow from '@/components/team/MemberProfileRow';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useEmployeeAttendance } from '@/hooks/useEmployees';
import { useEmployeeScheduleAssignments, useEmployeeTardies, useEmployeeDaysOff } from '@/hooks/useEmployeeSchedules';
import { WEEKDAY_NAMES, DEFAULT_WEEKDAYS, summarizeWeekdays } from '@/hooks/useScheduleVersions';
import type { ScheduleWeekdayRow } from '@/hooks/useScheduleVersions';
import { useOrgContext } from '@/hooks/useOrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { formatDate } from '@/lib/time-utils';
import { ChevronDown, ChevronUp, Clock, Calendar, AlertTriangle, CalendarOff, Loader2, Pencil, Plus, Trash2, Archive } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';

type Employee = {
  id: string;
  display_name: string;
  email: string | null;
  user_id: string | null;
  timezone: string;
  /** Short code shown on reports and print sheets instead of the full name. */
  tag?: string | null;
  preferred_name?: string | null;
};

type WeekStats = { present: number; late: number; absent: number };

type WeekdayDraft = Omit<ScheduleWeekdayRow, 'id' | 'schedule_version_id'>;

const statusBadge: Record<string, { label: string; className: string }> = {
  ok: { label: 'OK', className: 'bg-success/20 text-success' },
  remote_ok: { label: 'Remote', className: 'bg-accent/20 text-accent' },
  late: { label: 'Late', className: 'bg-warning/20 text-warning' },
  absent: { label: 'Absent', className: 'bg-destructive/20 text-destructive' },
  incomplete: { label: 'Incomplete', className: 'bg-warning/20 text-warning' },
  closure: { label: 'Closed', className: 'bg-muted text-muted-foreground' },
  day_off: { label: 'Day Off', className: 'bg-primary/20 text-primary' },
  unscheduled: { label: 'No Sched', className: 'bg-muted text-muted-foreground' },
  timezone_suspect: { label: 'TZ Issue', className: 'bg-destructive/20 text-destructive' },
};

const DAY_OFF_LABELS: Record<string, string> = {
  scheduled_with_notice: 'Scheduled',
  unscheduled: 'Unscheduled',
  office_closed: 'Office Closed',
  medical_leave: 'Medical',
  other: 'Other',
};



export default function TeamEmployeeCard({ employee, stats, dateRange }: { employee: Employee; stats: WeekStats; dateRange: { start: string; end: string } }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('attendance');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { data: orgCtx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canArchive = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';

  const handleArchive = async () => {
    setArchiving(true);
    const { error } = await supabase
      .from('employees')
      .update({ employment_status: 'inactive' })
      .eq('id', employee.id);
    setArchiving(false);
    if (error) {
      toast({ title: 'Archive failed', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Archived', description: `${employee.display_name} has been archived.` });
    setConfirmArchive(false);
    qc.invalidateQueries({ queryKey: ['employees'] });
  };

  return (
    <Card className="card-elevated overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {employee.display_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">
              {employee.display_name}
              {employee.tag && (
                <span className="ml-2 font-mono text-[10px] tracking-widest text-muted-foreground">{employee.tag}</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground">{employee.email || 'No email'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <CardContent className="border-t pt-3 pb-4 px-4">
          <MemberProfileRow employee={employee as never} />

          {/* Per-employee stats */}
          <div className="flex items-center gap-3 mb-3">
            {stats.present > 0 && <Badge variant="outline" className="text-success border-success/30 text-xs">{stats.present} present</Badge>}
            {stats.late > 0 && <Badge variant="outline" className="text-warning border-warning/30 text-xs">{stats.late} late</Badge>}
            {stats.absent > 0 && <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">{stats.absent} absent</Badge>}
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-4 mb-3">
              <TabsTrigger value="attendance" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Attendance</TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs"><Clock className="h-3 w-3 mr-1" />Schedule</TabsTrigger>
              <TabsTrigger value="tardies" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Tardies</TabsTrigger>
              <TabsTrigger value="callouts" className="text-xs"><CalendarOff className="h-3 w-3 mr-1" />Callouts</TabsTrigger>
            </TabsList>
            <TabsContent value="attendance"><AttendanceTab employeeId={employee.id} range={dateRange} /></TabsContent>
            <TabsContent value="schedule"><ScheduleTab employee={employee} /></TabsContent>
            <TabsContent value="tardies"><TardiesTab employeeId={employee.id} range={dateRange} /></TabsContent>
            <TabsContent value="callouts"><CalloutsTab employeeId={employee.id} range={dateRange} /></TabsContent>
          </Tabs>
          <div className="mt-3 flex justify-end gap-2">
            {canArchive && (
              <Button
                variant="outline"
                size="sm"
                className="text-xs text-destructive hover:text-destructive"
                onClick={() => setConfirmArchive(true)}
              >
                <Archive className="h-3 w-3 mr-1" />Archive
              </Button>
            )}
            <Link to={`/team/${employee.id}`}>
              <Button variant="outline" size="sm" className="text-xs"><Pencil className="h-3 w-3 mr-1" />Full Detail</Button>
            </Link>
          </div>
        </CardContent>
      )}

      <AlertDialog open={confirmArchive} onOpenChange={setConfirmArchive}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {employee.display_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              They'll be hidden from the team list. All history (punches, schedules, tardies) is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archiving}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiving}
              onClick={(e) => { e.preventDefault(); handleArchive(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {archiving ? 'Archiving…' : 'Archive'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

/* ─── Attendance Tab ─── */
function AttendanceTab({ employeeId, range }: { employeeId: string; range: { start: string; end: string } }) {
  const { data: attendance, isLoading } = useEmployeeAttendance(employeeId, range);
  if (isLoading) return <LoadingSpinner />;
  if (!attendance?.length) return <EmptyState text="No attendance data for last 30 days." />;
  return (
    <div className="divide-y rounded-lg border max-h-80 overflow-y-auto">
      {attendance.map(row => {
        const sb = statusBadge[row.status_code] || statusBadge.ok;
        return (
          <div key={row.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium w-20 text-xs">{formatDate(row.entry_date)}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${sb.className}`}>{sb.label}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {row.schedule_expected_start && <span>Sched: {row.schedule_expected_start?.toString().slice(0, 5)}</span>}
              {row.minutes_late != null && row.minutes_late > 0 && <span className="text-warning font-semibold">+{row.minutes_late}min</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── Schedule Tab (full CRUD) ─── */
function ScheduleTab({ employee }: { employee: Employee }) {
  const { data: ctx } = useOrgContext();
  const { user } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const { data: assignments, isLoading } = useEmployeeScheduleAssignments(employee.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAssignment, setEditingAssignment] = useState<any>(null);
  const [saving, setSaving] = useState(false);

  // Intercept dialog state
  const [choiceOpen, setChoiceOpen] = useState(false);
  const [choiceMode, setChoiceMode] = useState<'versioned' | 'inplace'>('versioned');
  const [versionedStartDate, setVersionedStartDate] = useState<string>('');
  const [forceInPlaceOnly, setForceInPlaceOnly] = useState(false);
  const [savingChoice, setSavingChoice] = useState(false);

  // Form state
  const [formName, setFormName] = useState('');
  const [formStart, setFormStart] = useState('');
  const [formEnd, setFormEnd] = useState('');
  const [formRemote, setFormRemote] = useState(false);
  const [formWeekdays, setFormWeekdays] = useState<WeekdayDraft[]>([...DEFAULT_WEEKDAYS]);

  const dayBefore = (date: string) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  };

  const hasOverlap = (startA: string, endA: string | null, startB: string, endB: string | null) => {
    const safeEndA = endA ?? '9999-12-31';
    const safeEndB = endB ?? '9999-12-31';
    return startA <= safeEndB && startB <= safeEndA;
  };

  const ensureNoError = (error: { message?: string } | null) => {
    if (error) throw new Error(error.message || 'Something went wrong while saving the schedule.');
  };

  const openCreate = () => {
    setEditingAssignment(null);
    setFormName('');
    setFormStart(new Date().toISOString().split('T')[0]);
    setFormEnd('');
    setFormRemote(false);

    // Copy from current active assignment if exists
    const active = assignments?.find((a: any) => !a.effective_end || a.effective_end >= new Date().toISOString().split('T')[0]);
    if (active?.schedule_version?.weekdays?.length) {
      setFormWeekdays(active.schedule_version.weekdays.map((w: any) => ({
        weekday: w.weekday, enabled: w.enabled, start_time: w.start_time,
        end_time: w.end_time, grace_minutes: w.grace_minutes, threshold_minutes: w.threshold_minutes,
      })));
      setFormRemote(active.schedule_version.apply_to_remote);
    } else {
      setFormWeekdays([...DEFAULT_WEEKDAYS]);
    }
    setModalOpen(true);
  };

  const openEdit = (a: any) => {
    setEditingAssignment(a);
    const sv = a.schedule_version;
    setFormName(sv?.name || '');
    setFormStart(a.effective_start);
    setFormEnd(a.effective_end || '');
    setFormRemote(sv?.apply_to_remote || false);
    if (sv?.weekdays?.length) {
      setFormWeekdays(sv.weekdays.map((w: any) => ({
        weekday: w.weekday, enabled: w.enabled, start_time: w.start_time,
        end_time: w.end_time, grace_minutes: w.grace_minutes, threshold_minutes: w.threshold_minutes,
      })));
    }
    setModalOpen(true);
  };

  const todayStr = () => new Date().toISOString().split('T')[0];

  const weekdaysAttendanceChanged = (): boolean => {
    const sv = editingAssignment?.schedule_version;
    if (!sv) return false;
    const byWd = new Map<number, any>((sv.weekdays || []).map((w: any) => [w.weekday, w]));
    for (const fw of formWeekdays) {
      const orig = byWd.get(fw.weekday);
      if (!orig) return true;
      if (
        orig.enabled !== fw.enabled ||
        (orig.start_time || '').slice(0, 5) !== (fw.start_time || '').slice(0, 5) ||
        (orig.end_time || '').slice(0, 5) !== (fw.end_time || '').slice(0, 5) ||
        orig.grace_minutes !== fw.grace_minutes ||
        orig.threshold_minutes !== fw.threshold_minutes
      ) return true;
    }
    return false;
  };

  const attendanceAffectingChanged = (): boolean => {
    if (!editingAssignment) return false;
    const sv = editingAssignment.schedule_version;
    if (!sv) return false;
    if (sv.apply_to_remote !== formRemote) return true;
    if ((editingAssignment.effective_start || '') !== (formStart || '')) return true;
    if ((editingAssignment.effective_end || '') !== (formEnd || '')) return true;
    return weekdaysAttendanceChanged();
  };

  const isHistoricalAssignment = (a: any): boolean => {
    return !!a?.effective_end && a.effective_end < todayStr();
  };

  const affectedRange = () => {
    const start = editingAssignment?.effective_start || todayStr();
    const end = editingAssignment?.effective_end || todayStr();
    const s = new Date(start + 'T00:00:00').getTime();
    const e = new Date(end + 'T00:00:00').getTime();
    const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
    return { start, end, days };
  };

  // Create a brand-new version + assignment (used by create flow AND
  // by "Schedule is changing" branch of the choice dialog).
  const createNewVersionAndAssignment = async (startDate: string, endDate: string | null) => {
    if (!user || !ctx) throw new Error('Not authenticated');
    const newEndStr = dayBefore(startDate);

    const [{ data: existingAssignments, error: existingAssignmentsError }, { data: existingVersions, error: existingVersionsError }] = await Promise.all([
      supabase
        .from('schedule_assignments')
        .select('id, effective_start, effective_end, schedule_version_id')
        .eq('org_id', ctx.org_id)
        .eq('employee_id', employee.id),
      supabase
        .from('schedule_versions')
        .select('id, effective_start_date, effective_end_date')
        .eq('org_id', ctx.org_id)
        .eq('employee_id', employee.id),
    ]);
    ensureNoError(existingAssignmentsError);
    ensureNoError(existingVersionsError);

    const overlappingAssignments = (existingAssignments || []).filter((assignment: any) =>
      hasOverlap(assignment.effective_start, assignment.effective_end, startDate, endDate)
    );
    const overlappingVersions = (existingVersions || []).filter((version: any) =>
      hasOverlap(version.effective_start_date, version.effective_end_date, startDate, endDate)
    );

    const futureConflict = overlappingAssignments.find((assignment: any) => assignment.effective_start >= startDate)
      || overlappingVersions.find((version: any) => version.effective_start_date >= startDate);

    if (futureConflict) {
      throw new Error('This date range overlaps existing schedule history. Edit or remove the overlapping future schedule first.');
    }

    for (const assignment of overlappingAssignments) {
      const { error: closeAssignmentError } = await supabase
        .from('schedule_assignments')
        .update({ effective_end: newEndStr })
        .eq('id', assignment.id);
      ensureNoError(closeAssignmentError);
    }
    for (const version of overlappingVersions) {
      const { error: closeVersionError } = await supabase
        .from('schedule_versions')
        .update({ effective_end_date: newEndStr })
        .eq('id', version.id);
      ensureNoError(closeVersionError);
    }

    const { data: version, error: vErr } = await supabase.from('schedule_versions').insert({
      user_id: employee.user_id || user.id,
      org_id: ctx.org_id,
      employee_id: employee.id,
      name: formName || null,
      effective_start_date: startDate,
      effective_end_date: endDate,
      apply_to_remote: formRemote,
      timezone: employee.timezone || 'America/New_York',
      week_start_day: 1,
    }).select('id').single();
    if (vErr) throw vErr;

    const wdRows = formWeekdays.map(w => ({
      schedule_version_id: version.id, weekday: w.weekday, enabled: w.enabled,
      start_time: w.start_time, end_time: w.end_time,
      grace_minutes: w.grace_minutes, threshold_minutes: w.threshold_minutes,
    }));
    const { error: wErr } = await supabase.from('schedule_weekdays').insert(wdRows);
    if (wErr) throw wErr;

    const { error: aErr } = await supabase.from('schedule_assignments').insert({
      org_id: ctx.org_id,
      employee_id: employee.id,
      schedule_version_id: version.id,
      effective_start: startDate,
      effective_end: endDate,
    });
    if (aErr) throw aErr;
  };

  // In-place edit of existing version + assignment (the legacy path),
  // plus a schedule_correction_log row.
  const performInPlaceUpdate = async () => {
    if (!user || !ctx || !editingAssignment) return;
    const sv = editingAssignment.schedule_version;

    const editingVersionId = sv?.id ?? editingAssignment.schedule_version_id;
    const datesChanged =
      (editingAssignment.effective_start || '') !== (formStart || '') ||
      (editingAssignment.effective_end || '') !== (formEnd || '');

    if (datesChanged) {
      const { data: existingVersions, error: existingVersionsError } = await supabase
        .from('schedule_versions')
        .select('id, effective_start_date, effective_end_date')
        .eq('org_id', ctx.org_id)
        .eq('employee_id', employee.id);
      ensureNoError(existingVersionsError);

      const overlappingVersion = (existingVersions || []).find((version: any) =>
        version.id !== editingVersionId &&
        hasOverlap(version.effective_start_date, version.effective_end_date, formStart, formEnd || null)
      );
      if (overlappingVersion) {
        throw new Error('This date range overlaps existing schedule history. Edit or remove the overlapping schedule first.');
      }
    }

    const oldValues = {
      name: sv?.name,
      effective_start_date: sv?.effective_start_date,
      effective_end_date: sv?.effective_end_date,
      apply_to_remote: sv?.apply_to_remote,
      weekdays: (sv?.weekdays || []).map((w: any) => ({
        weekday: w.weekday, enabled: w.enabled,
        start_time: w.start_time, end_time: w.end_time,
        grace_minutes: w.grace_minutes, threshold_minutes: w.threshold_minutes,
      })),
      assignment_effective_start: editingAssignment.effective_start,
      assignment_effective_end: editingAssignment.effective_end,
    };
    const newValues = {
      name: formName || null,
      effective_start_date: formStart,
      effective_end_date: formEnd || null,
      apply_to_remote: formRemote,
      weekdays: formWeekdays,
      assignment_effective_start: formStart,
      assignment_effective_end: formEnd || null,
    };

    const { error: versionUpdateError } = await supabase.from('schedule_versions').update({
      name: formName || null,
      effective_start_date: formStart,
      effective_end_date: formEnd || null,
      apply_to_remote: formRemote,
    }).eq('id', sv.id);
    ensureNoError(versionUpdateError);

    for (const wd of sv.weekdays) {
      const draft = formWeekdays.find((d: any) => d.weekday === wd.weekday);
      if (draft) {
        const { error: weekdayUpdateError } = await supabase.from('schedule_weekdays').update({
          enabled: draft.enabled, start_time: draft.start_time, end_time: draft.end_time,
          grace_minutes: draft.grace_minutes, threshold_minutes: draft.threshold_minutes,
        }).eq('id', wd.id);
        ensureNoError(weekdayUpdateError);
      }
    }

    const { error: assignmentUpdateError } = await supabase.from('schedule_assignments').update({
      effective_start: formStart,
      effective_end: formEnd || null,
    }).eq('id', editingAssignment.id);
    ensureNoError(assignmentUpdateError);

    const { error: logErr } = await supabase.from('schedule_correction_log').insert({
      version_id: sv.id,
      org_id: ctx.org_id,
      employee_id: employee.id,
      edited_by: user.id,
      old_values: oldValues as any,
      new_values: newValues as any,
    });
    if (logErr) console.warn('schedule_correction_log insert failed:', logErr);
  };

  const handleSave = async () => {
    if (!formStart || !user || !ctx) return;
    if (!formWeekdays.some(w => w.enabled)) {
      toast({ title: 'At least one weekday must be enabled', variant: 'destructive' });
      return;
    }
    if (formEnd && formEnd < formStart) {
      toast({ title: 'End date must be after start date', variant: 'destructive' });
      return;
    }

    // EDIT path → always route through the intercept dialog when the
    // change affects attendance.
    if (editingAssignment) {
      if (!attendanceAffectingChanged()) {
        // Name-only or no-op — apply in place silently.
        setSaving(true);
        try {
          const sv = editingAssignment.schedule_version;
          const { error } = await supabase.from('schedule_versions').update({
            name: formName || null,
          }).eq('id', sv.id);
          ensureNoError(error);
          qc.invalidateQueries({ queryKey: ['employee-schedule-assignments', employee.id] });
          toast({ title: 'Schedule updated' });
          setModalOpen(false);
        } catch (err: any) {
          toast({ title: 'Error', description: err.message, variant: 'destructive' });
        } finally {
          setSaving(false);
        }
        return;
      }
      const historical = isHistoricalAssignment(editingAssignment);
      setForceInPlaceOnly(historical);
      setChoiceMode(historical ? 'inplace' : 'versioned');
      setVersionedStartDate(todayStr());
      setChoiceOpen(true);
      return;
    }

    // CREATE path — unchanged behavior.
    setSaving(true);
    try {
      await createNewVersionAndAssignment(formStart, formEnd || null);
      qc.invalidateQueries({ queryKey: ['employee-schedule-assignments', employee.id] });
      qc.invalidateQueries({ queryKey: ['schedule-versions'] });
      toast({ title: 'Schedule created & assigned' });
      setModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmChoice = async () => {
    if (!editingAssignment) return;
    setSavingChoice(true);
    try {
      if (choiceMode === 'versioned') {
        if (!versionedStartDate) {
          toast({ title: 'Effective start date is required', variant: 'destructive' });
          setSavingChoice(false);
          return;
        }
        await createNewVersionAndAssignment(versionedStartDate, formEnd || null);
        toast({ title: 'New schedule version created' });
      } else {
        await performInPlaceUpdate();
        toast({ title: 'Schedule corrected', description: 'Attendance is being recalculated for affected days.' });
      }
      qc.invalidateQueries({ queryKey: ['employee-schedule-assignments', employee.id] });
      qc.invalidateQueries({ queryKey: ['schedule-versions'] });
      setChoiceOpen(false);
      setModalOpen(false);
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSavingChoice(false);
    }
  };

  const handleDelete = async (assignmentId: string, versionId: string) => {
    try {
      await supabase.from('schedule_assignments').delete().eq('id', assignmentId);
      await supabase.from('schedule_weekdays').delete().eq('schedule_version_id', versionId);
      await supabase.from('schedule_versions').delete().eq('id', versionId);
      qc.invalidateQueries({ queryKey: ['employee-schedule-assignments', employee.id] });
      toast({ title: 'Schedule removed' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  if (isLoading) return <LoadingSpinner />;

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={openCreate} className="w-full sm:w-auto">
        <Plus className="h-3.5 w-3.5 mr-1" />Add Schedule
      </Button>

      {!assignments?.length ? (
        <EmptyState text="No schedule assigned yet." />
      ) : (
        <div className="space-y-2">
          {(assignments as any[]).map(a => {
            const sv = a.schedule_version;
            if (!sv) return null;
            const weekdays = (sv.weekdays || []).sort((x: any, y: any) => x.weekday - y.weekday);
            const isActive = a.effective_start <= today && (!a.effective_end || a.effective_end >= today);

            return (
              <div key={a.id} className={`rounded-lg border ${isActive ? 'border-primary/30' : 'border-muted'}`}>
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{sv.name || 'Schedule'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(a.effective_start)}{a.effective_end ? ` → ${formatDate(a.effective_end)}` : ' → Present'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isActive && <Badge variant="default" className="text-xs mr-1">Active</Badge>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(a)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(a.id, sv.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                <div className="divide-y">
                  {weekdays.map((w: any) => (
                    <div key={w.weekday} className={`flex items-center gap-3 px-3 py-1.5 text-xs ${!w.enabled ? 'opacity-40' : ''}`}>
                      <span className="w-10 font-medium">{WEEKDAY_NAMES[w.weekday]?.slice(0, 3)}</span>
                      {w.enabled ? (
                        <>
                          <span className="font-mono">{w.start_time?.slice(0, 5)} – {w.end_time?.slice(0, 5)}</span>
                          {w.grace_minutes > 0 && <span className="text-muted-foreground">({w.grace_minutes}m grace)</span>}
                        </>
                      ) : (
                        <span className="text-muted-foreground">Off</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-3 py-1.5 border-t text-xs text-muted-foreground">
                  Remote: {sv.apply_to_remote ? 'Yes' : 'No'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Modal */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingAssignment ? 'Edit Schedule' : 'New Schedule'} — {employee.display_name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-sm">Name (optional)</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Summer Hours" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-sm">Start Date *</Label>
                <Input type="date" value={formStart} onChange={e => setFormStart(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-sm">End Date (optional)</Label>
                <Input type="date" value={formEnd} onChange={e => setFormEnd(e.target.value)} />
              </div>
            </div>
            {!editingAssignment && formStart && formStart >= todayStr() && (
              <Alert variant="default" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-xs">
                  This won't change past days. To correct historical attendance, edit the schedule version that covers those dates.
                </AlertDescription>
              </Alert>
            )}
            <div className="flex items-center gap-3">
              <Switch checked={formRemote} onCheckedChange={setFormRemote} />
              <Label className="text-sm">Apply to remote days</Label>
            </div>
            <div className="space-y-1">
              <Label className="text-sm font-medium">Weekday Rules</Label>
              <WeekdayEditor weekdays={formWeekdays} onChange={setFormWeekdays} />
            </div>
            <Button onClick={handleSave} disabled={saving || !formStart} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingAssignment ? 'Save Changes' : 'Create & Assign'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Intercept / Correction Confirmation Dialog */}
      <Dialog open={choiceOpen} onOpenChange={(open) => { if (!savingChoice) setChoiceOpen(open); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {forceInPlaceOnly ? 'Correct historical schedule?' : 'How should this change apply?'}
            </DialogTitle>
            <DialogDescription>
              {forceInPlaceOnly
                ? 'This schedule version has already ended. Saving will overwrite it as a correction.'
                : 'Most schedule changes start on a date going forward. Pick what fits.'}
            </DialogDescription>
          </DialogHeader>

          {!forceInPlaceOnly && (
            <RadioGroup value={choiceMode} onValueChange={(v) => setChoiceMode(v as 'versioned' | 'inplace')} className="space-y-3">
              <label className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${choiceMode === 'versioned' ? 'border-primary bg-primary/5' : ''}`}>
                <RadioGroupItem value="versioned" className="mt-1" />
                <div className="flex-1 space-y-2">
                  <div className="font-medium text-sm">Schedule is changing</div>
                  <p className="text-xs text-muted-foreground">
                    Their hours are different starting on a new date. A new schedule version is created; past attendance is not touched.
                  </p>
                  {choiceMode === 'versioned' && (
                    <div className="pt-1">
                      <Label className="text-xs">Effective start date</Label>
                      <Input
                        type="date"
                        value={versionedStartDate}
                        onChange={(e) => setVersionedStartDate(e.target.value)}
                        className="h-8 mt-1"
                      />
                    </div>
                  )}
                </div>
              </label>

              <label className={`flex gap-3 rounded-lg border p-3 cursor-pointer ${choiceMode === 'inplace' ? 'border-warning bg-warning/5' : ''}`}>
                <RadioGroupItem value="inplace" className="mt-1" />
                <div className="flex-1 space-y-1">
                  <div className="font-medium text-sm">Fixing an error in this schedule</div>
                  <p className="text-xs text-muted-foreground">
                    The schedule record was entered wrong and was always wrong. Edits the existing version in place.
                  </p>
                </div>
              </label>
            </RadioGroup>
          )}

          {choiceMode === 'inplace' && (() => {
            const r = affectedRange();
            return (
              <Alert variant="default" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-sm">
                  This will recalculate attendance for all days this schedule covers
                  ({formatDate(r.start)} to {editingAssignment?.effective_end ? formatDate(r.end) : 'today'}, {r.days} day{r.days === 1 ? '' : 's'}).
                  Past late/absent statuses may change.
                </AlertDescription>
              </Alert>
            );
          })()}

          <DialogFooter className="gap-2">
            <Button variant="ghost" onClick={() => setChoiceOpen(false)} disabled={savingChoice}>
              Cancel
            </Button>
            <Button
              onClick={handleConfirmChoice}
              disabled={savingChoice}
              variant={choiceMode === 'inplace' ? 'destructive' : 'default'}
            >
              {savingChoice && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {choiceMode === 'inplace' ? 'Confirm correction' : 'Create new version'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ─── Weekday Editor ─── */
function WeekdayEditor({ weekdays, onChange }: { weekdays: WeekdayDraft[]; onChange: (w: WeekdayDraft[]) => void }) {
  const update = (idx: number, patch: Partial<WeekdayDraft>) => {
    const next = [...weekdays];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  return (
    <div className="divide-y rounded-lg border">
      {weekdays.sort((a, b) => a.weekday - b.weekday).map((w, idx) => (
        <div key={w.weekday} className={`flex flex-wrap items-center gap-2 px-3 py-2 ${!w.enabled ? 'opacity-50' : ''}`}>
          <div className="w-20 flex items-center gap-1.5">
            <Switch checked={w.enabled} onCheckedChange={v => update(idx, { enabled: v })} />
            <span className="text-xs font-medium">{WEEKDAY_NAMES[w.weekday]?.slice(0, 3)}</span>
          </div>
          <div className="flex items-center gap-1">
            <Input type="time" value={w.start_time?.slice(0, 5)} onChange={e => update(idx, { start_time: e.target.value })} disabled={!w.enabled} className="w-[6.5rem] text-xs h-7" />
            <span className="text-xs text-muted-foreground">–</span>
            <Input type="time" value={w.end_time?.slice(0, 5)} onChange={e => update(idx, { end_time: e.target.value })} disabled={!w.enabled} className="w-[6.5rem] text-xs h-7" />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">Grace</Label>
            <Input type="number" min={0} value={w.grace_minutes} onChange={e => update(idx, { grace_minutes: parseInt(e.target.value) || 0 })} disabled={!w.enabled} className="w-14 text-xs h-7" />
          </div>
          <div className="flex items-center gap-1">
            <Label className="text-[10px] text-muted-foreground">Thresh</Label>
            <Input type="number" min={1} value={w.threshold_minutes} onChange={e => update(idx, { threshold_minutes: parseInt(e.target.value) || 1 })} disabled={!w.enabled} className="w-14 text-xs h-7" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─── Tardies Tab ─── */
function TardiesTab({ employeeId, range }: { employeeId: string; range: { start: string; end: string } }) {
  const { data: tardies, isLoading } = useEmployeeTardies(employeeId, range.start, range.end);
  if (isLoading) return <LoadingSpinner />;
  if (!tardies?.length) return <EmptyState text="No tardies in last 30 days. 🎉" />;

  const approvalBadge: Record<string, { label: string; className: string }> = {
    unreviewed: { label: 'Unreviewed', className: 'bg-muted text-muted-foreground' },
    approved: { label: 'Approved', className: 'bg-success/20 text-success' },
    unapproved: { label: 'Unapproved', className: 'bg-destructive/20 text-destructive' },
  };

  return (
    <div className="divide-y rounded-lg border max-h-80 overflow-y-auto">
      {tardies.map((t: any) => {
        const ab = approvalBadge[t.approval_status] || approvalBadge.unreviewed;
        return (
          <div key={t.id} className="px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-xs w-20">{formatDate(t.entry_date)}</span>
                <span className="text-warning font-semibold text-xs">+{t.minutes_late}min</span>
              </div>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${ab.className}`}>{ab.label}</span>
            </div>
            {t.reason_text && <p className="text-xs text-muted-foreground mt-1 italic">"{t.reason_text}"</p>}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Callouts Tab (unscheduled only) ─── */
function CalloutsTab({ employeeId, range }: { employeeId: string; range: { start: string; end: string } }) {
  const { data: daysOff, isLoading } = useEmployeeDaysOff(employeeId, range.start, range.end, 'unscheduled');
  if (isLoading) return <LoadingSpinner />;
  if (!daysOff?.length) return <EmptyState text="No callouts in this date range. 🎉" />;

  return (
    <div className="divide-y rounded-lg border max-h-80 overflow-y-auto">
      {daysOff.map((d: any) => (
        <div key={d.id} className="px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs w-20">{formatDate(d.date_start)}</span>
              {d.date_start !== d.date_end && <span className="text-xs text-muted-foreground">→ {formatDate(d.date_end)}</span>}
            </div>
            <Badge variant="outline" className="text-xs">{DAY_OFF_LABELS[d.type] || d.type}</Badge>
          </div>
          {d.notes && <p className="text-xs text-muted-foreground mt-1 italic">"{d.notes}"</p>}
          {d.hours != null && <p className="text-xs text-muted-foreground mt-0.5">{d.hours}h</p>}
        </div>
      ))}
    </div>
  );
}

/* ─── Helpers ─── */
function LoadingSpinner() {
  return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
}
function EmptyState({ text }: { text: string }) {
  return <p className="text-center text-muted-foreground text-sm py-6">{text}</p>;
}
