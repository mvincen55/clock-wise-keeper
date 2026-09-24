import EmployeeChecklistSetting from '@/components/team/EmployeeChecklistSetting';
import WorkArrangementSetting from '@/components/team/WorkArrangementSetting';
import WorkedHourAdjustments from '@/components/team/WorkedHourAdjustments';
import EmployeeInviteAction from '@/components/team/EmployeeInviteAction';
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import MemberProfileRow from '@/components/team/MemberProfileRow';
import EmployeeSetupCard from '@/components/team/EmployeeSetupCard';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useResolvedEmployeeAttendance, useDerivedEmployeeAttendance } from '@/hooks/useAttendanceFallback';
import { derivedTardies } from '@/lib/attendance-derive';
import { useEmployeeTardies, useEmployeeDaysOff } from '@/hooks/useEmployeeSchedules';
import { useOrgContext } from '@/hooks/useOrgContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { formatDate, formatClock } from '@/lib/time-utils';
import { DAY_OFF_LABELS, DAY_TONE_CLASS, STATUS_CODE_LABELS, dayWord, type DayClock, type DayLike } from '@/lib/attendance-day';
import { useDayClock } from '@/hooks/useDayClock';
import { ChevronDown, ChevronUp, Clock, Calendar, AlertTriangle, CalendarOff, Loader2, Pencil, Archive } from 'lucide-react';
import { useTeamOnboardingStatus } from '@/hooks/useOnboarding';
import { employeeTeamStatus } from '@/lib/team-status';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Link } from 'react-router-dom';
import EditEmployeeDialog from '@/components/team/EditEmployeeDialog';
import { formatEmployeeNameLastFirst } from '@/lib/employee-name';

import ScheduleTab, { Employee } from '@/components/team/ScheduleTab';

type WeekStats = { present: number; late: number; absent: number };


/** A day's badge, in the office's one vocabulary and under its time rule (src/lib/attendance-day.ts). */
const dayBadge = (row: DayLike & { status_code: string }, clock: DayClock): { label: string; className: string } => {
  const w = row.status_code === 'timezone_suspect' ? STATUS_CODE_LABELS.timezone_suspect : dayWord(row, [], clock);
  return { label: w.label, className: DAY_TONE_CLASS[w.tone] };
};



export default function TeamEmployeeCard({ employee, stats, dateRange }: { employee: Employee; stats: WeekStats; dateRange: { start: string; end: string } }) {
  const displayName = formatEmployeeNameLastFirst(employee.display_name);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('attendance');
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { data: orgCtx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  const canArchive = orgCtx?.role === 'owner' || orgCtx?.role === 'manager';
  // Roster facts, not join-pipeline state: a doctor kept on Team for the
  // schedule reader is on neither the clock nor the PTO bank.
  const clocksIn = employee.clocks_in !== false;
  const ptoEligible = employee.pto_eligible !== false;

  // Join-pipeline status (React Query dedupes the org-wide fetch per card).
  const { data: onboardingTeam } = useTeamOnboardingStatus();
  const onboardingRow = employee.user_id
    ? onboardingTeam?.find(t => t.user_id === employee.user_id)
    : undefined;
  const teamStatus = employeeTeamStatus({
    hasLogin: !!employee.user_id,
    clocksIn,
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
              {!clocksIn && (
                <Badge variant="outline" className="ml-2 text-[10px] text-muted-foreground" title="Not on the time clock: left out of attendance, missing-time and payroll checks">
                  No time clock
                </Badge>
              )}
              {!ptoEligible && (
                <Badge variant="outline" className="ml-2 text-[10px] text-muted-foreground" title="Does not accrue PTO">
                  No PTO
                </Badge>
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
          <WorkArrangementSetting employee={employee} />
          <EmployeeChecklistSetting employeeId={employee.id}/>

          {/* Per-employee stats */}
          <div className="flex items-center gap-3 mb-3">
            {stats.present > 0 && <Badge variant="outline" className="text-success border-success/30 text-xs">{stats.present} present</Badge>}
            {stats.late > 0 && <Badge variant="outline" className="text-warning border-warning/30 text-xs">{stats.late} late</Badge>}
            {stats.absent > 0 && <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">{stats.absent} absent</Badge>}
          </div>

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-5 mb-3">
              <TabsTrigger value="setup" className="text-xs">{ptoEligible ? 'Dates / PTO' : 'Dates'}</TabsTrigger>
              <TabsTrigger value="attendance" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Attendance</TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs"><Clock className="h-3 w-3 mr-1" />Schedule</TabsTrigger>
              <TabsTrigger value="tardies" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Tardies</TabsTrigger>
              <TabsTrigger value="callouts" className="text-xs"><CalendarOff className="h-3 w-3 mr-1" />Callouts</TabsTrigger>
            </TabsList>
            <TabsContent value="setup"><EmployeeSetupCard employeeId={employee.id}/></TabsContent>
            <TabsContent value="attendance">
              {clocksIn
                ? <><WorkedHourAdjustments employeeId={employee.id}/><AttendanceTab employeeId={employee.id} range={dateRange} /></>
                : <EmptyState text="Not on the time clock. No attendance is recorded for this team member." />}
            </TabsContent>
            <TabsContent value="schedule"><ScheduleTab employee={employee} /></TabsContent>
            <TabsContent value="tardies">
              {clocksIn
                ? <TardiesTab employeeId={employee.id} range={dateRange} />
                : <EmptyState text="Not on the time clock. Tardies do not apply to this team member." />}
            </TabsContent>
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
            <Link to={`/management/attendance?employee=${employee.id}`}>
              <Button variant="outline" size="sm" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Attendance</Button>
            </Link>
            <Link to={`/management/people/${employee.id}`}>
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
  const clock = useDayClock();
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
        const sb = dayBadge(row, clock);
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

