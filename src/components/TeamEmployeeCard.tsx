import EmployeeChecklistSetting from '@/components/team/EmployeeChecklistSetting';
import WorkedHourAdjustments from '@/components/team/WorkedHourAdjustments';
import EmployeeInviteAction from '@/components/team/EmployeeInviteAction';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import MemberProfileRow from '@/components/team/MemberProfileRow';
import EmployeeSetupCard from '@/components/team/EmployeeSetupCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useResolvedEmployeeAttendance, useDerivedEmployeeAttendance } from '@/hooks/useAttendanceFallback';
import { derivedTardies } from '@/lib/attendance-derive';
import { useEmployeeScheduleVersions, useEmployeeTardies, useEmployeeDaysOff, friendlyScheduleError, type EmployeeScheduleVersion } from '@/hooks/useEmployeeSchedules';
import { WEEKDAY_NAMES, DEFAULT_WEEKDAYS, summarizeWeekdays } from '@/hooks/useScheduleVersions';
import type { ScheduleWeekdayRow } from '@/hooks/useScheduleVersions';
import { useOrgContext } from '@/hooks/useOrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatClock, formatClockRange } from '@/lib/time-utils';
import { ChevronDown, ChevronUp, Clock, Calendar, AlertTriangle, CalendarOff, Loader2, Pencil, Plus, Trash2, Archive } from 'lucide-react';
import { useTeamOnboardingStatus } from '@/hooks/useOnboarding';
import { employeeTeamStatus } from '@/lib/team-status';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import EditEmployeeDialog from '@/components/team/EditEmployeeDialog';
import { formatEmployeeName } from '@/lib/employee-name';

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
  ok: { label: 'Arrived', className: 'bg-success/20 text-success' },
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
  scheduled_with_notice: 'Time off',
  unscheduled: 'Callout',
  office_closed: 'Office Closed',
  medical_leave: 'Medical',
  other: 'Other',
};



export default function TeamEmployeeCard({ employee, stats, dateRange }: { employee: Employee; stats: WeekStats; dateRange: { start: string; end: string } }) {
  const displayName = formatEmployeeName(employee.display_name);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('attendance');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { data: orgCtx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canArchive = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';

  // Join-pipeline status (React Query dedupes the org-wide fetch per card).
  const { data: onboardingTeam } = useTeamOnboardingStatus();
  const onboardingRow = employee.user_id
    ? onboardingTeam?.find(t => t.user_id === employee.user_id)
    : undefined;
  const teamStatus = employeeTeamStatus({
    hasLogin: !!employee.user_id,
    onboarding: onboardingRow
      ? {
          complete: onboardingRow.complete,
          stepsDone: Object.values(onboardingRow.steps).filter(Boolean).length,
          stepsTotal: 3,
        }
      : null,
  });

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
    toast({ title: 'Archived', description: `${displayName} has been archived.` });
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
            {displayName.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">
              {displayName}
              {employee.tag && (
                <span className="ml-2 font-mono text-[10px] tracking-widest text-muted-foreground">{employee.tag}</span>
              )}
              {/* Join-pipeline status, visible without expanding the card:
                  Active / Pending Onboarding / Pending (no login yet). */}
              <Badge
                variant="outline"
                title={teamStatus.detail}
                className={`ml-2 text-[10px] ${
                  teamStatus.tone === 'success'
                    ? 'border-success/30 text-success'
                    : teamStatus.tone === 'warning'
                      ? 'border-warning/40 text-warning'
                      : 'text-muted-foreground'
                }`}
              >
                {teamStatus.label}
              </Badge>
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
          <EmployeeChecklistSetting employeeId={employee.id}/>

          {/* Per-employee stats */}
          <div className="flex items-center gap-3 mb-3">
            {stats.present > 0 && <Badge variant="outline" className="text-success border-success/30 text-xs">{stats.present} present</Badge>}
            {stats.late > 0 && <Badge variant="outline" className="text-warning border-warning/30 text-xs">{stats.late} late</Badge>}
            {stats.absent > 0 && <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">{stats.absent} absent</Badge>}
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-5 mb-3">
              <TabsTrigger value="setup" className="text-xs">Dates / PTO</TabsTrigger>
              <TabsTrigger value="attendance" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Attendance</TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs"><Clock className="h-3 w-3 mr-1" />Schedule</TabsTrigger>
              <TabsTrigger value="tardies" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Tardies</TabsTrigger>
              <TabsTrigger value="callouts" className="text-xs"><CalendarOff className="h-3 w-3 mr-1" />Callouts</TabsTrigger>
            </TabsList>
            <TabsContent value="setup"><EmployeeSetupCard employeeId={employee.id}/></TabsContent>
            <TabsContent value="attendance"><WorkedHourAdjustments employeeId={employee.id}/><AttendanceTab employeeId={employee.id} range={dateRange} /></TabsContent>
            <TabsContent value="schedule"><ScheduleTab employee={employee} /></TabsContent>
            <TabsContent value="tardies"><TardiesTab employeeId={employee.id} range={dateRange} /></TabsContent>
            <TabsContent value="callouts"><CalloutsTab employeeId={employee.id} range={dateRange} /></TabsContent>
          </Tabs>
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            {canArchive && <EmployeeInviteAction employee={employee} />}
            {canArchive && <EditEmployeeDialog employee={employee} />}
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
            <AlertDialogTitle>Archive {displayName}?</AlertDialogTitle>
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
export function AttendanceTab({ employeeId, range }: { employeeId: string; range: { start: string; end: string } }) {
  // Employee identity is the key: members without a login still have punch,
  // schedule, and time-off history, so attendance is derived when the
  // user-scoped status table has nothing for them.
  const { rows: attendance, isLoading } = useResolvedEmployeeAttendance(employeeId, range);
  const {data:ctx}=useOrgContext();
  const {data:adjustments=[],isLoading:adjustmentsLoading,error:adjustmentsError}=useQuery({
    queryKey:['worked-adjustments',employeeId,ctx?.org_id,range.start,range.end],
    enabled:!!ctx,refetchInterval:30_000,
    queryFn:async()=>{
      const r=await supabase.from('worked_hour_adjustments').select('*')
        .eq('org_id',ctx!.org_id).eq('employee_id',employeeId)
        .gte('entry_date',range.start).lte('entry_date',range.end).order('entry_date',{ascending:false});
      if(r.error)throw r.error;return r.data;
    },
  });
  if (isLoading || adjustmentsLoading) return <LoadingSpinner />;
  if (adjustmentsError) return <p role="alert">Attendance adjustments could not be loaded.</p>;
  const history=[...(attendance??[]).map(row=>({kind:'attendance' as const,row})),
    ...adjustments.map(row=>({kind:'adjustment' as const,row}))]
    .sort((a,b)=>b.row.entry_date.localeCompare(a.row.entry_date));
  if (!history.length) return <EmptyState text="No attendance data for this date range." />;
  return (
    <div className="divide-y rounded-lg border max-h-80 overflow-y-auto">
      {history.map(item => {
        const row=item.row;
        if(item.kind==='adjustment')return (
          <div key={`adjustment-${row.id}`} className="px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium w-20 text-xs">{formatDate(row.entry_date)}</span>
              <span className="text-xs px-1.5 py-0.5 rounded bg-muted">Hours adjustment</span>
              <span className="font-medium">{Number(item.row.hours_delta)>0?'+':''}{Number(item.row.hours_delta).toFixed(2)}h</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{item.row.reason}</p>
          </div>
        );
        const sb = statusBadge[row.status_code] || statusBadge.ok;
        return (
          <div key={row.id} className="flex items-center justify-between px-3 py-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="font-medium w-20 text-xs">{formatDate(row.entry_date)}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${sb.className}`}>{sb.label}</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {row.schedule_expected_start && <span>Sched: {formatClock(row.schedule_expected_start?.toString())}</span>}
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
  // Versions are what attendance follows; each carries its assignment rows so a
  // version that never received one is still visible here instead of only
  // colliding with an edit invisibly.
  const { data: versions, isLoading } = useEmployeeScheduleVersions(employee.id);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingVersion, setEditingVersion] = useState<EmployeeScheduleVersion | null>(null);
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

  const todayStr = () => new Date().toISOString().split('T')[0];

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['employee-schedule-versions', employee.id] });
    qc.invalidateQueries({ queryKey: ['schedule-versions'] });
  };

  const draftsFrom = (weekdays: EmployeeScheduleVersion['weekdays']): WeekdayDraft[] =>
    [...weekdays].sort((a, b) => a.weekday - b.weekday).map(w => ({
      weekday: w.weekday, enabled: w.enabled, start_time: w.start_time,
      end_time: w.end_time, grace_minutes: w.grace_minutes, threshold_minutes: w.threshold_minutes,
    }));

  /** An assignment must mirror its version's dates; none, or a drifted one, is a record that needs repair. */
  const needsRepair = (v: EmployeeScheduleVersion): boolean =>
    !v.assignments?.length ||
    v.assignments.some(a =>
      a.effective_start !== v.effective_start_date ||
      (a.effective_end || null) !== (v.effective_end_date || null)
    );

  const openCreate = () => {
    setEditingVersion(null);
    setFormName('');
    setFormStart(todayStr());
    setFormEnd('');
    setFormRemote(false);

    // Copy from the version covering today if there is one
    const active = versions?.find(v => !v.effective_end_date || v.effective_end_date >= todayStr());
    if (active?.weekdays?.length) {
      setFormWeekdays(draftsFrom(active.weekdays));
      setFormRemote(active.apply_to_remote);
    } else {
      setFormWeekdays([...DEFAULT_WEEKDAYS]);
    }
    setModalOpen(true);
  };

  const openEdit = (v: EmployeeScheduleVersion) => {
    setEditingVersion(v);
    setFormName(v.name || '');
    setFormStart(v.effective_start_date);
    setFormEnd(v.effective_end_date || '');
    setFormRemote(v.apply_to_remote || false);
    setFormWeekdays(v.weekdays?.length ? draftsFrom(v.weekdays) : [...DEFAULT_WEEKDAYS]);
    setModalOpen(true);
  };

  const weekdaysAttendanceChanged = (): boolean => {
    if (!editingVersion) return false;
    const byWd = new Map((editingVersion.weekdays || []).map(w => [w.weekday, w]));
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
    if (!editingVersion) return false;
    if (editingVersion.apply_to_remote !== formRemote) return true;
    if ((editingVersion.effective_start_date || '') !== (formStart || '')) return true;
    if ((editingVersion.effective_end_date || '') !== (formEnd || '')) return true;
    return weekdaysAttendanceChanged();
  };

  const isHistoricalVersion = (v: EmployeeScheduleVersion | null): boolean => {
    return !!v?.effective_end_date && v.effective_end_date < todayStr();
  };

  const affectedRange = () => {
    const start = editingVersion?.effective_start_date || todayStr();
    const end = editingVersion?.effective_end_date || todayStr();
    const s = new Date(start + 'T00:00:00').getTime();
    const e = new Date(end + 'T00:00:00').getTime();
    const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
    return { start, end, days };
  };

  // Create a brand-new version + assignment (used by create flow AND
  // by "Schedule is changing" branch of the choice dialog).
  const createNewVersionAndAssignment = async (startDate: string, endDate: string | null) => {
    if (!user || !ctx) throw new Error('Not authenticated');
    const { error } = await supabase.rpc('create_employee_schedule', {
      p_employee_id: employee.id, p_start: startDate, p_end: endDate,
      p_name: formName || null, p_apply_to_remote: formRemote,
      p_weekdays: formWeekdays,
    });
    if (error) throw new Error(friendlyScheduleError(error));
  };

  // In-place correction: one transactional RPC writes the version, its weekday
  // rules, and its assignment together (creating or repairing the assignment),
  // refuses an overlap before writing while naming the other schedule, and
  // records the correction. Nothing here can half-apply.
  const performInPlaceUpdate = async () => {
    if (!user || !ctx || !editingVersion) return;
    const { error } = await supabase.rpc('correct_employee_schedule', {
      p_version_id: editingVersion.id, p_start: formStart, p_end: formEnd || null,
      p_name: formName || null, p_apply_to_remote: formRemote,
      p_weekdays: formWeekdays,
    });
    if (error) throw new Error(friendlyScheduleError(error));
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
    if (editingVersion) {
      if (!attendanceAffectingChanged()) {
        setSaving(true);
        try {
          if (needsRepair(editingVersion)) {
            // Nothing about attendance changed, but the record is inconsistent:
            // the same transactional correction repairs it quietly.
            await performInPlaceUpdate();
            toast({ title: 'Schedule repaired', description: 'Its attendance record now matches these dates.' });
          } else {
            // Name-only or no-op — apply in place silently.
            const { error } = await supabase.from('schedule_versions').update({
              name: formName || null,
            }).eq('id', editingVersion.id);
            if (error) throw new Error(friendlyScheduleError(error));
            toast({ title: 'Schedule updated' });
          }
          refresh();
          setModalOpen(false);
        } catch (err) {
          toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
        } finally {
          setSaving(false);
        }
        return;
      }
      const historical = isHistoricalVersion(editingVersion);
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
      refresh();
      toast({ title: 'Schedule created & assigned' });
      setModalOpen(false);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmChoice = async () => {
    if (!editingVersion) return;
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
      refresh();
      setChoiceOpen(false);
      setModalOpen(false);
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    } finally {
      setSavingChoice(false);
    }
  };

  const handleDelete = async (v: EmployeeScheduleVersion) => {
    try {
      const assignments = await supabase.from('schedule_assignments').delete().eq('schedule_version_id', v.id);
      if (assignments.error) throw new Error(friendlyScheduleError(assignments.error));
      const weekdays = await supabase.from('schedule_weekdays').delete().eq('schedule_version_id', v.id);
      if (weekdays.error) throw new Error(friendlyScheduleError(weekdays.error));
      const version = await supabase.from('schedule_versions').delete().eq('id', v.id);
      if (version.error) throw new Error(friendlyScheduleError(version.error));
      refresh();
      toast({ title: 'Schedule removed' });
    } catch (err) {
      toast({ title: 'Error', description: err instanceof Error ? err.message : String(err), variant: 'destructive' });
    }
  };

  if (isLoading) return <LoadingSpinner />;

  const today = todayStr();

  return (
    <div className="space-y-3">
      <Button size="sm" onClick={openCreate} className="w-full sm:w-auto">
        <Plus className="h-3.5 w-3.5 mr-1" />Add Schedule
      </Button>

      {!versions?.length ? (
        <EmptyState text="No schedule assigned yet." />
      ) : (
        <div className="space-y-2">
          {versions.map(v => {
            const weekdays = [...(v.weekdays || [])].sort((x, y) => x.weekday - y.weekday);
            const isActive = v.effective_start_date <= today && (!v.effective_end_date || v.effective_end_date >= today);
            const repair = needsRepair(v);

            return (
              <div key={v.id} className={`rounded-lg border ${isActive ? 'border-primary/30' : 'border-muted'}`}>
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">{v.name || 'Schedule'}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(v.effective_start_date)}{v.effective_end_date ? ` → ${formatDate(v.effective_end_date)}` : ' → Present'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1">
                    {isActive && <Badge variant="default" className="text-xs mr-1">Active</Badge>}
                    {repair && <Badge variant="outline" className="text-xs mr-1 border-warning text-warning">Needs repair</Badge>}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(v)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(v)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
                {repair && (
                  <p className="px-3 py-1.5 border-b text-xs text-warning">
                    This schedule's attendance record does not match its dates. Open it and save to repair.
                  </p>
                )}
                <div className="divide-y">
                  {weekdays.map(w => (
                    <div key={w.weekday} className={`flex items-center gap-3 px-3 py-1.5 text-xs ${!w.enabled ? 'opacity-40' : ''}`}>
                      <span className="w-10 font-medium">{WEEKDAY_NAMES[w.weekday]?.slice(0, 3)}</span>
                      {w.enabled ? (
                        <>
                          <span className="font-mono">{formatClockRange(w.start_time, w.end_time)}</span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">Off</span>
                      )}
                    </div>
                  ))}
                </div>
                <div className="px-3 py-1.5 border-t text-xs text-muted-foreground">
                  Remote: {v.apply_to_remote ? 'Yes' : 'No'}
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
            <DialogTitle>{editingVersion ? 'Edit Schedule' : 'New Schedule'} — {employee.display_name}</DialogTitle>
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
            {!editingVersion && formStart && formStart >= todayStr() && (
              <Alert variant="default" className="border-warning/50 bg-warning/10">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <AlertDescription className="text-xs">
                  This won't change past days. To correct historical attendance, edit the schedule version that covers those dates.
                </AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label className="text-sm font-medium">Weekday Rules</Label>
              <WeekdayEditor weekdays={formWeekdays} onChange={setFormWeekdays} />
            </div>
            <Button onClick={handleSave} disabled={saving || !formStart} className="w-full">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editingVersion ? 'Save Changes' : 'Create & Assign'}
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
                  ({formatDate(r.start)} to {editingVersion?.effective_end_date ? formatDate(r.end) : 'today'}, {r.days} day{r.days === 1 ? '' : 's'}).
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
        </div>
      ))}
    </div>
  );
}

/* ─── Tardies Tab ─── */
function TardiesTab({ employeeId, range }: { employeeId: string; range: { start: string; end: string } }) {
  const { data: storedTardies, isLoading } = useEmployeeTardies(employeeId, range.start, range.end);
  // Pending members have no tardy rows (those are written by the user-scoped
  // engine), so late arrivals are derived from their schedule and first punch.
  const { data: derivedRows, isLoading: derivedLoading } = useDerivedEmployeeAttendance(
    employeeId,
    range,
    !isLoading && !storedTardies?.length,
  );
  const tardies = storedTardies?.length ? storedTardies : derivedTardies(derivedRows || []);
  if (isLoading || derivedLoading) return <LoadingSpinner />;
  if (!tardies?.length) return <EmptyState text="No tardies in last 30 days. 🎉" />;

  const approvalBadge: Record<string, { label: string; className: string }> = {
    unreviewed: { label: 'Unreviewed', className: 'bg-muted text-muted-foreground' },
    pending: { label: 'Unreviewed', className: 'bg-muted text-muted-foreground' },
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

