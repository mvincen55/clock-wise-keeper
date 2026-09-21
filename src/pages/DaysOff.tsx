import { useState, useMemo, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDaysOff, useOrgDaysOff, useAddDayOff, useDeleteDayOff, DayOffRow } from '@/hooks/useDaysOff';
import { PtoRequestModal } from '@/components/PtoRequestModal';
import { useTardies, useUpdateTardy, TardyRow } from '@/hooks/useTardies';
import { TardyReviewModal } from '@/components/TardyReviewModal';
import { AttendanceActions } from '@/components/AttendanceActions';
import { useAttendanceDayStatus, useRecomputeAttendance, AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgStaff, type OrgStaffMember } from '@/hooks/useStaffCodes';
import { useTimeEntries, TimeEntryRow } from '@/hooks/useTimeEntries';
import { useConsumedSearchParam } from '@/hooks/useDeepLink';
import PersonalCalendar from '@/components/PersonalCalendar';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { useAuth } from '@/hooks/useAuth';
import { formatDate, formatTime, formatClock, formatClockRange, minutesToHHMM } from '@/lib/time-utils';
import { formatEmployeeName, formatEmployeeNameLastFirst } from '@/lib/employee-name';
import { formatBreak, punchSegments } from '@/lib/payroll-utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { CalendarDays, Plus, Trash2, Loader2, Building2, Bug, RefreshCw, Table2, Users } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const typeLabels: Record<string, string> = {
  scheduled_with_notice: 'Time off',
  unscheduled: 'Callout',
  office_closed: 'Office Closed',
  medical_leave: 'Medical Leave',
  other: 'Other',
};

const typeColors: Record<string, string> = {
  scheduled_with_notice: 'bg-primary/20 text-primary',
  unscheduled: 'bg-destructive/20 text-destructive',
  office_closed: 'bg-success/20 text-success',
  medical_leave: 'bg-warning/20 text-warning',
  other: 'bg-accent/20 text-accent',
};

type AttendanceFilter = 'all' | 'absent' | 'late' | 'incomplete' | 'days_off' | 'closures' | 'remote' | 'onsite';
type DaysOffFilter = 'all' | 'scheduled_with_notice' | 'unscheduled' | 'medical_leave' | 'other';

/** The employee picker's "everyone in the office" choice. */
const EVERYONE = 'all';

/**
 * A manager wears two hats here: their own attendance (they clock in too)
 * and the office's. The view is explicit, and the last choice sticks.
 */
type ViewMode = 'mine' | 'team';
const VIEW_STORAGE_KEY = 'purple.attendance.view';
function readStoredView(): ViewMode | null {
  try {
    const v = localStorage.getItem(VIEW_STORAGE_KEY);
    return v === 'mine' || v === 'team' ? v : null;
  } catch {
    return null;
  }
}

/** How the team view orders its rows. */
type SortMode = 'attention' | 'employee' | 'date';
const SORT_LABELS: Record<SortMode, string> = {
  attention: 'Needs attention',
  employee: 'By person',
  date: 'By date',
};

/** Day-off types that explain an absence (a callout does not — it is still a missed shift). */
const EXPLAINED_DAY_OFF_TYPES = ['scheduled_with_notice', 'medical_leave', 'other'];

function DebugDrawer({ row, employeeName, open, onClose }: { row: AttendanceDayStatusRow | null; employeeName?: string; open: boolean; onClose: () => void }) {
  if (!row) return null;
  return (
    <Sheet open={open} onOpenChange={v => !v && onClose()}>
      <SheetContent className="w-[340px] sm:w-[400px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2"><Bug className="h-4 w-4" /> Debug: {employeeName ? `${employeeName} · ` : ''}{formatDate(row.entry_date)}</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Scheduled:</span>
            <span className="font-mono">{row.is_scheduled_day ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Expected Start:</span>
            <span className="font-mono">{formatClock(row.schedule_expected_start)}</span>
            <span className="text-muted-foreground">Expected End:</span>
            <span className="font-mono">{formatClock(row.schedule_expected_end)}</span>
          </div>
          <div className="border-t pt-2 grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Office Closed:</span>
            <span className={row.office_closed ? 'text-success font-semibold' : ''}>{row.office_closed ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Day Off:</span>
            <span className={row.has_day_off ? 'text-primary font-semibold' : ''}>{row.has_day_off ? 'Yes' : 'No'}</span>
          </div>
          <div className="border-t pt-2 grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Has Punches:</span>
            <span>{row.has_punches ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Remote:</span>
            <span>{row.is_remote ? 'Yes' : 'No'}</span>
            <span className="text-muted-foreground">Has Edits:</span>
            <span>{row.has_edits ? 'Yes' : 'No'}</span>
          </div>
          <div className="border-t pt-2 grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Absent:</span>
            <span className={row.is_absent ? 'text-destructive font-semibold' : ''}>{row.is_absent ? 'YES' : 'No'}</span>
            <span className="text-muted-foreground">Incomplete:</span>
            <span className={row.is_incomplete ? 'text-warning font-semibold' : ''}>{row.is_incomplete ? 'YES' : 'No'}</span>
            <span className="text-muted-foreground">Late:</span>
            <span className={row.is_late ? 'text-destructive font-semibold' : ''}>{row.is_late ? `YES (${row.minutes_late}m)` : 'No'}</span>
          </div>
          <div className="border-t pt-2 grid grid-cols-2 gap-1">
            <span className="text-muted-foreground">Tardy Status:</span>
            <span className="capitalize">{row.tardy_approval_status}</span>
            <span className="text-muted-foreground">Day Comment:</span>
            <span>{row.has_day_comment ? 'Yes' : 'No'}</span>
          </div>
          <div className="border-t pt-2">
            <span className="text-muted-foreground text-xs">Computed at: </span>
            <span className="text-xs font-mono">{new Date(row.computed_at).toLocaleString()}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Every clock-in and clock-out of the day as worked stretches, with the
 * lunch or break gap between them — so a manager sees what they are about
 * to edit, not just the first in and the last out.
 */
function DayPunches({ entry }: { entry: TimeEntryRow | undefined }) {
  if (!entry || !entry.punches.length) return <span className="text-xs text-muted-foreground">—</span>;
  const segments = punchSegments(entry.punches);
  return (
    <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {segments.map((seg, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {seg.break_minutes != null && seg.break_minutes > 0 && (
            <span className="text-[10px] text-muted-foreground" title="Time between the previous clock-out and this clock-in">{formatBreak(seg.break_minutes)} break ·</span>
          )}
          <span className="text-xs px-1.5 py-0.5 rounded bg-success/20 text-success time-display">{seg.in ? formatTime(seg.in.punch_time) : '?'}</span>
          <span className="text-[10px] text-muted-foreground">–</span>
          <span className={`text-xs px-1.5 py-0.5 rounded time-display ${seg.out ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning'}`}>
            {seg.out ? formatTime(seg.out.punch_time) : 'no clock out'}
          </span>
        </span>
      ))}
      {entry.total_minutes != null && (
        <span className="text-[10px] text-muted-foreground time-display">{minutesToHHMM(entry.total_minutes)} total</span>
      )}
    </div>
  );
}

export default function DaysOff() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: payrollSettings } = usePayrollSettings();
  const { data: ctx } = useOrgContext();
  const { toast } = useToast();

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const roleKnown = !!ctx;

  // Deep links: the Timesheet's "Resolve in Attendance" names a date (the
  // signed-in person's own day), and a team-member link names the person.
  // Both are read once, then dropped from the address bar.
  const linkedDate = useConsumedSearchParam('date');
  const linkedEmployee = useConsumedSearchParam('employee');

  // Managers choose between their own attendance and the team's. A link
  // decides the first view; otherwise the last explicit choice, else Team.
  const [viewMode, setViewModeState] = useState<ViewMode>(() =>
    linkedEmployee ? 'team' : linkedDate ? 'mine' : readStoredView() ?? 'team');
  const setViewMode = (next: ViewMode) => {
    setViewModeState(next);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next);
    } catch {
      // Private browsing — the choice just won't stick between visits.
    }
  };
  // The personal view: everyone who is not a manager, and a manager on
  // "My attendance". Everything below that says "own" follows this.
  const personal = !isManager || viewMode === 'mine';
  const [sortMode, setSortMode] = useState<SortMode>('attention');

  // Default date range to current pay period
  const weekStartDay = payrollSettings?.week_start_day ?? 1;
  const nowDate = new Date();
  const dayOfWeek = nowDate.getDay();
  const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
  const defaultStart = new Date(nowDate);
  defaultStart.setDate(nowDate.getDate() - daysBack);
  const defaultEnd = new Date(defaultStart);
  defaultEnd.setDate(defaultStart.getDate() + 6);

  const [startDate, setStartDate] = useState(() => {
    const s = defaultStart.toISOString().split('T')[0];
    return linkedDate && linkedDate < s ? linkedDate : s;
  });
  const [endDate, setEndDate] = useState(() => {
    const e = defaultEnd.toISOString().split('T')[0];
    return linkedDate && linkedDate > e ? linkedDate : e;
  });
  // The team view starts on the whole office; a linked person narrows it.
  const [teamFilter, setEmployeeFilter] = useState<string>(linkedEmployee ?? EVERYONE);
  // In the personal view the only person is the signed-in one.
  const employeeFilter = personal ? (ctx?.employee_id ?? EVERYONE) : teamFilter;

  // The roster, for names on rows and the picker (every member may read it).
  const { data: staff } = useOrgStaff();
  const staffById = useMemo(() => new Map((staff || []).map(m => [m.employeeId, m])), [staff]);
  const nameOf = (employeeId: string | null | undefined): string => {
    const m = employeeId ? staffById.get(employeeId) : undefined;
    return m ? formatEmployeeName(m.displayName) : 'Unknown';
  };
  type Dated = { employee_id: string | null; entry_date: string };
  const byPerson = (a: Dated, b: Dated) => nameOf(a.employee_id).localeCompare(nameOf(b.employee_id));
  const byDateDesc = (a: Dated, b: Dated) => b.entry_date.localeCompare(a.entry_date);
  // Sorted by person, each person's rows sit under one header instead of
  // repeating the name on every row.
  const withPersonHeaders = <T extends Dated>(rows: T[], colSpan: number, render: (row: T) => ReactNode): ReactNode[] => {
    if (!groupedByEmployee) return rows.map(render);
    const out: ReactNode[] = [];
    let last: string | null = null;
    for (const row of rows) {
      const name = nameOf(row.employee_id);
      if (name !== last) {
        out.push(
          <tr key={`person-${row.employee_id ?? name}`} className="bg-muted/40">
            <td colSpan={colSpan} className="px-4 py-1.5 text-xs font-semibold">
              <button type="button" className="hover:underline" title="Show only this team member" onClick={() => { if (row.employee_id) setEmployeeFilter(row.employee_id); }}>
                {name}
              </button>
            </td>
          </tr>,
        );
        last = name;
      }
      out.push(render(row));
    }
    return out;
  };
  const pickable = useMemo(() => {
    const list = (staff || []).filter(m => m.employmentStatus === 'active');
    return list
      .map(m => ({ member: m, label: formatEmployeeNameLastFirst(m.displayName) }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [staff]);
  const focusedMember: OrgStaffMember | undefined = employeeFilter === EVERYONE ? undefined : staffById.get(employeeFilter);
  // The whole office at once: names on every row, or rows grouped under
  // each name when sorted by person.
  const teamWide = !personal && employeeFilter === EVERYONE;
  const groupedByEmployee = teamWide && sortMode === 'employee';
  const showEmployeeColumn = teamWide && !groupedByEmployee;
  const matchesFilter = (employeeId: string | null | undefined) => employeeFilter === EVERYONE || employeeId === employeeFilter;

  // The team view reads the whole office (RLS already returns it to
  // owners and managers); the personal view keeps to the signed-in person.
  // Days off are the one table the personal hook scopes to the caller, so
  // the team view has its own.
  const ownDaysOff = useDaysOff(undefined, roleKnown && personal);
  const orgDaysOff = useOrgDaysOff(startDate, undefined, roleKnown && !personal);
  const daysOffSource = personal ? ownDaysOff.data : orgDaysOff.data;
  const daysOff: DayOffRow[] = useMemo(() => daysOffSource || [], [daysOffSource]);
  const daysOffLoading = personal ? ownDaysOff.isLoading : orgDaysOff.isLoading;
  const { data: tardies, isLoading: tardiesLoading } = useTardies(startDate, endDate);
  const { data: closures } = useOfficeClosures(new Date().getFullYear());
  const { data: statusRows, isLoading: statusLoading } = useAttendanceDayStatus(startDate, endDate);
  const { data: entries } = useTimeEntries(startDate, endDate, personal ? 'own' : 'all');
  const recompute = useRecomputeAttendance();
  const addDayOff = useAddDayOff();
  const deleteDayOff = useDeleteDayOff();
  const updateTardy = useUpdateTardy();

  const [open, setOpen] = useState(false);
  const [requestOpen, setRequestOpen] = useState(false);
  const [tab, setTab] = useState('status');
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>('all');
  const [daysOffFilter, setDaysOffFilter] = useState<DaysOffFilter>('all');
  const [approvalFilter, setApprovalFilter] = useState('all');
  const [showOnlyTracked, setShowOnlyTracked] = useState(false);
  const [debugRow, setDebugRow] = useState<AttendanceDayStatusRow | null>(null);
  const [reviewTardy, setReviewTardy] = useState<TardyRow | null>(null);

  const requiresNotes = (type: string) => type === 'medical_leave';

  const [form, setForm] = useState({
    employee_id: '',
    date_start: '',
    date_end: '',
    type: 'scheduled_with_notice' as 'scheduled_with_notice' | 'unscheduled' | 'office_closed' | 'medical_leave' | 'other',
    hours: '0',
    notes: '',
  });

  const formNotesRequired = requiresNotes(form.type);

  const openAddDayOff = (next: boolean) => {
    if (next) {
      // Whose day off: the person in view, else the manager's own record.
      setForm(f => ({ ...f, employee_id: focusedMember?.employeeId ?? ctx?.employee_id ?? '' }));
    }
    setOpen(next);
  };

  const handleAdd = async () => {
    if (!form.date_start || !form.date_end) return;
    if (formNotesRequired && !form.notes.trim()) return;
    const target = isManager ? staffById.get(form.employee_id) : undefined;
    if (isManager && !target) return;
    try {
      await addDayOff.mutateAsync({
        date_start: form.date_start,
        date_end: form.date_end,
        type: form.type,
        hours: form.hours ? parseFloat(form.hours) : undefined,
        notes: form.notes || undefined,
        target: target ? { user_id: target.userId, employee_id: target.employeeId } : undefined,
      });
      setOpen(false);
      setForm({ employee_id: '', date_start: '', date_end: '', type: 'scheduled_with_notice', hours: '0', notes: '' });
      toast({ title: target ? `Day off added for ${formatEmployeeName(target.displayName)}` : 'Day off added' });
      // Their attendance rows now know about the day off. Best effort — the
      // day off itself is already saved.
      if (target?.userId) recompute.mutate({ startDate: form.date_start, endDate: form.date_end, userId: target.userId });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDayOff.mutateAsync(id);
      toast({ title: 'Day off removed' });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  const handleTardyReview = async (id: string, status: 'approved' | 'unapproved', reason: string) => {
    try {
      await updateTardy.mutateAsync({
        id,
        updates: {
          approval_status: status,
          reason_text: reason,
          approved_by: status === 'approved' ? user?.id : null,
          approved_at: status === 'approved' ? new Date().toISOString() : null,
        },
      });
      toast({ title: `Tardy marked as ${status}` });
    } catch (err: any) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    }
  };

  // Recompute follows the view: yourself, one person, or everyone in the
  // office with a login (attendance is only computed for members who can clock).
  const handleRecompute = async () => {
    if (!startDate || !endDate || !user) return;
    let targets: string[];
    if (personal) {
      targets = [user.id];
    } else if (focusedMember) {
      if (!focusedMember.userId) {
        toast({ title: 'No login yet', description: `${formatEmployeeName(focusedMember.displayName)} has no linked account, so there is no attendance to recompute. Invite them from the Team page first.`, variant: 'destructive' });
        return;
      }
      targets = [focusedMember.userId];
    } else {
      targets = pickable.map(p => p.member.userId).filter((id): id is string => !!id);
    }
    try {
      let count = 0;
      for (const userId of targets) {
        count += await recompute.mutateAsync({ startDate, endDate, userId });
      }
      toast({ title: `Recomputed ${count} days${targets.length > 1 ? ` for ${targets.length} team members` : ''}` });
    } catch (err: any) {
      toast({ title: 'Recompute failed', description: err.message, variant: 'destructive' });
    }
  };

  // Days off by (employee, date) so one person's leave never explains
  // another person's absence. The personal view keys on the date alone,
  // exactly as before.
  const coverageKey = (employeeId: string | null | undefined, date: string) => (personal ? date : `${employeeId ?? ''}|${date}`);
  const daysOffByKey = useMemo(() => {
    const map = new Map<string, DayOffRow[]>();
    daysOff.forEach(d => {
      const start = new Date(d.date_start + 'T00:00:00');
      const end = new Date(d.date_end + 'T00:00:00');
      for (let cur = new Date(start); cur <= end; cur.setDate(cur.getDate() + 1)) {
        const key = coverageKey(d.employee_id, cur.toISOString().split('T')[0]);
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(d);
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daysOff, personal]);
  const coverageFor = (row: AttendanceDayStatusRow) => daysOffByKey.get(coverageKey(row.employee_id, row.entry_date)) || [];

  // The rows in scope: the focused person, or everyone.
  const visibleRows = useMemo(
    () => (statusRows || []).filter(r => matchesFilter(r.employee_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [statusRows, employeeFilter],
  );
  const visibleTardies = useMemo(
    () => (tardies || []).filter(t => matchesFilter(t.employee_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tardies, employeeFilter],
  );
  const visibleDaysOff = useMemo(
    () => daysOff.filter(d => matchesFilter(d.employee_id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [daysOff, employeeFilter],
  );

  // The day's punches for each row (every in and out, not a summary).
  const entryByKey = useMemo(() => {
    const map = new Map<string, TimeEntryRow>();
    (entries || []).forEach(e => { if (e.employee_id) map.set(`${e.employee_id}|${e.entry_date}`, e); });
    return map;
  }, [entries]);
  const entryFor = (row: AttendanceDayStatusRow) => (row.employee_id ? entryByKey.get(`${row.employee_id}|${row.entry_date}`) : undefined);

  const isMissingShift = (r: AttendanceDayStatusRow) => {
    if (!r.is_absent) return false;
    if (r.office_closed) return false;
    // Excused by a scheduled, medical, or other day off — a callout still counts.
    return !coverageFor(r).some(d => EXPLAINED_DAY_OFF_TYPES.includes(d.type));
  };

  // Summary counters - properly categorized
  const summary = useMemo(() => {
    const rows = visibleRows;

    // Absent: is_absent AND (no day_off covering OR day_off type=unscheduled)
    const absentCount = rows.filter(r => {
      if (!r.is_absent) return false;
      const dayOffs = coverageFor(r);
      if (dayOffs.length === 0) return true; // no day off = truly absent
      // If covered only by unscheduled, still counts as absent
      return dayOffs.every(d => d.type === 'unscheduled');
    }).length;

    // Days Off: days covered by days_off with type IN (scheduled_with_notice, medical_leave, other)
    const daysOffCount = rows.filter(r => coverageFor(r).some(d => EXPLAINED_DAY_OFF_TYPES.includes(d.type))).length;

    // Closures: office_closed from attendance_day_status OR days_off type=office_closed
    const closuresCount = rows.filter(r => r.office_closed || coverageFor(r).some(d => d.type === 'office_closed')).length;

    return {
      absent: absentCount,
      late: rows.filter(r => r.is_late).length,
      incomplete: rows.filter(r => r.is_incomplete).length,
      daysOff: daysOffCount,
      closures: closuresCount,
      remote: rows.filter(r => r.is_remote).length,
      edited: rows.filter(r => r.has_edits).length,
      unreviewedTardies: visibleTardies.filter(t => t.approval_status === 'unreviewed' && !t.resolved).length,
      needsTimeFix: rows.filter(r => r.timezone_suspect).length,
      missingShifts: rows.filter(isMissingShift).length,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, visibleTardies, daysOffByKey]);

  // Filtered + sorted status rows
  const filteredStatus = useMemo(() => {
    let list = visibleRows;
    if (attendanceFilter === 'all') {
      list = list.filter(r => r.is_scheduled_day || r.has_punches || r.office_closed || r.has_day_off);
    }
    switch (attendanceFilter) {
      case 'absent': list = list.filter(r => r.is_absent); break;
      case 'late': list = list.filter(r => r.is_late); break;
      case 'incomplete': list = list.filter(r => r.is_incomplete); break;
      case 'days_off': list = list.filter(r => r.has_day_off); break;
      case 'closures': list = list.filter(r => r.office_closed); break;
      case 'remote': list = list.filter(r => r.is_remote); break;
      case 'onsite': list = list.filter(r => !r.is_remote && r.has_punches); break;
    }
    const priority = (r: AttendanceDayStatusRow) => {
      if (r.is_absent) return 0;
      if (r.is_incomplete) return 1;
      if (r.is_late) return 2;
      if (r.has_edits) return 3;
      return 4;
    };
    return [...list].sort((a, b) => {
      if (sortMode === 'attention') {
        const pa = priority(a);
        const pb = priority(b);
        if (pa !== pb) return pa - pb;
      }
      return sortMode === 'employee' ? byPerson(a, b) || byDateDesc(a, b) : byDateDesc(a, b) || byPerson(a, b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, attendanceFilter, staffById, sortMode]);

  // Days Off tab: exclude office_closed, apply filter
  const filteredDaysOff = useMemo(() => {
    let list = visibleDaysOff.filter(d => d.type !== 'office_closed');
    if (daysOffFilter !== 'all') {
      list = list.filter(d => d.type === daysOffFilter);
    }
    return [...list].sort((a, b) => b.date_start.localeCompare(a.date_start));
  }, [visibleDaysOff, daysOffFilter]);

  // Missing Shifts: truly absent, not closures, not covered by scheduled/medical/other day off
  const missingShiftRows = useMemo(() => {
    return visibleRows.filter(isMissingShift).sort((a, b) =>
      sortMode === 'employee' ? byPerson(a, b) || byDateDesc(a, b) : byDateDesc(a, b) || byPerson(a, b));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, daysOffByKey, sortMode, staffById]);

  const activeTardies = visibleTardies.filter(t => !t.resolved);

  const filteredTardies = useMemo(() => {
    let list = activeTardies;
    if (showOnlyTracked) list = list.filter(t => t.approval_status !== 'approved');
    if (approvalFilter !== 'all') list = list.filter(t => t.approval_status === approvalFilter);
    return [...list].sort((a, b) => {
      if (sortMode === 'attention') {
        const ua = a.approval_status === 'unreviewed' ? 0 : 1;
        const ub = b.approval_status === 'unreviewed' ? 0 : 1;
        if (ua !== ub) return ua - ub;
      }
      return sortMode === 'employee' ? byPerson(a, b) || byDateDesc(a, b) : byDateDesc(a, b) || byPerson(a, b);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTardies, showOnlyTracked, approvalFilter, sortMode, staffById]);

  // Closures tab: office_closures + legacy days_off with type=office_closed
  const closuresList = useMemo(() => {
    const fromClosures = (closures || []).map(c => ({
      id: c.id,
      date: c.closure_date,
      name: c.name,
      source: 'office_closures' as const,
    }));
    const fromDaysOff = daysOff.filter(d => d.type === 'office_closed').map(d => ({
      id: d.id,
      date: d.date_start,
      name: d.notes || 'Office Closed',
      source: 'days_off' as const,
    }));
    return [...fromClosures, ...fromDaysOff].sort((a, b) => b.date.localeCompare(a.date));
  }, [closures, daysOff]);

  const focusedName = focusedMember ? formatEmployeeName(focusedMember.displayName) : null;

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Attendance</h1>
          <p className="text-muted-foreground">
            {personal
              ? 'Your days off, tardies, missing shifts, and closures'
              : 'Days off, tardies, missing shifts, and closures across the office — pick a team member to focus on one person'}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handleRecompute} disabled={recompute.isPending} title={personal ? 'Recompute your attendance for this range' : focusedName ? `Recompute ${focusedName}'s attendance for this range` : 'Recompute everyone\'s attendance for this range'}>
            {recompute.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="mr-1 h-3.5 w-3.5" />}
            Recompute
          </Button>
          {/* Time off is recorded by owners and managers; everyone else asks
              for it through a PTO request so it goes through approval. */}
          {!isManager && (
            <Button onClick={() => setRequestOpen(true)}><Plus className="mr-2 h-4 w-4" />Request Time Off</Button>
          )}
          <PtoRequestModal open={requestOpen} onClose={() => setRequestOpen(false)} />
          {isManager && <Dialog open={open} onOpenChange={openAddDayOff}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />Add Day Off</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Day Off</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label htmlFor="day-off-employee">Team member</Label>
                  <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                    <SelectTrigger id="day-off-employee"><SelectValue placeholder="Choose a team member" /></SelectTrigger>
                    <SelectContent>
                      {pickable.map(({ member, label }) => (
                        <SelectItem key={member.employeeId} value={member.employeeId}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>Start Date</Label>
                    <Input type="date" value={form.date_start} onChange={e => setForm({ ...form, date_start: e.target.value, date_end: form.date_end || e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>End Date</Label>
                    <Input type="date" value={form.date_end} onChange={e => setForm({ ...form, date_end: e.target.value })} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select value={form.type} onValueChange={v => setForm({ ...form, type: v as any })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.entries(typeLabels).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{v}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Hours (optional)</Label>
                  <Input type="number" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} placeholder="0" />
                </div>
                <div className="space-y-1">
                  <Label>Notes{formNotesRequired ? <span className="text-destructive"> *</span> : ' (optional)'}</Label>
                  <Textarea value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder={formNotesRequired ? 'Required: describe the reason' : 'Vacation, doctor appointment, etc.'} />
                </div>
                <Button onClick={handleAdd} disabled={addDayOff.isPending || !addDayOff.isReady || !form.employee_id || (formNotesRequired && !form.notes.trim())} className="w-full">
                  {addDayOff.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {!addDayOff.isReady ? 'Loading org…' : 'Save'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>}
        </div>
      </div>

      {/* View, date range, who, and order */}
      <Card className="card-elevated">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 items-end">
            {isManager && (
              <div className="space-y-1">
                <Label className="text-xs">View</Label>
                <div role="group" aria-label="View" className="flex rounded-md border overflow-hidden">
                  {([['mine', 'My attendance'], ['team', 'Team']] as [ViewMode, string][]).map(([mode, label]) => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={viewMode === mode}
                      onClick={() => setViewMode(mode)}
                      className={`h-10 px-3 text-sm font-medium transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="attendance-start">Start Date</Label>
              <Input id="attendance-start" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs" htmlFor="attendance-end">End Date</Label>
              <Input id="attendance-end" type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-40" />
            </div>
            {!personal && (
              <div className="space-y-1">
                <Label className="text-xs" htmlFor="attendance-employee">Team member</Label>
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger id="attendance-employee" className="w-56" aria-label="Team member">
                    <Users className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={EVERYONE}>Everyone</SelectItem>
                    {pickable.map(({ member, label }) => (
                      <SelectItem key={member.employeeId} value={member.employeeId}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {!personal && focusedName && (
              <Button variant="ghost" size="sm" onClick={() => setEmployeeFilter(EVERYONE)}>Show everyone</Button>
            )}
            {teamWide && (
              <div className="space-y-1">
                <Label className="text-xs">Sort</Label>
                <div role="group" aria-label="Sort" className="flex rounded-md border overflow-hidden">
                  {(Object.keys(SORT_LABELS) as SortMode[]).map(mode => (
                    <button
                      key={mode}
                      type="button"
                      aria-pressed={sortMode === mode}
                      onClick={() => setSortMode(mode)}
                      className={`h-10 px-3 text-sm transition-colors ${sortMode === mode ? 'bg-primary text-primary-foreground font-medium' : 'bg-background hover:bg-muted'}`}
                    >
                      {SORT_LABELS[mode]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Summary counters */}
      <div className="grid grid-cols-3 md:grid-cols-7 gap-3">
        <Card className="card-elevated border-destructive/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{summary.absent}</p>
            <p className="text-xs text-muted-foreground">Absent</p>
          </CardContent>
        </Card>
        <Card className="card-elevated border-destructive/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{summary.late}</p>
            <p className="text-xs text-muted-foreground">Late</p>
          </CardContent>
        </Card>
        <Card className="card-elevated border-warning/30">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-warning">{summary.incomplete}</p>
            <p className="text-xs text-muted-foreground">Incomplete</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{summary.daysOff}</p>
            <p className="text-xs text-muted-foreground">Days Off</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-success">{summary.closures}</p>
            <p className="text-xs text-muted-foreground">Closures</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-primary">{summary.remote}</p>
            <p className="text-xs text-muted-foreground">Remote</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-accent">{summary.edited}</p>
            <p className="text-xs text-muted-foreground">Edited</p>
          </CardContent>
        </Card>
      </div>

      {/* Unreviewed Queue */}
      {(summary.unreviewedTardies > 0 || summary.missingShifts > 0 || summary.incomplete > 0 || summary.needsTimeFix > 0) && (
        <Card className="card-elevated border-warning/40">
          <CardContent className="p-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">Unreviewed Items{focusedName ? ` — ${focusedName}` : ''}</p>
            <div className="flex flex-wrap gap-2">
              {summary.unreviewedTardies > 0 && (
                <button onClick={() => { setTab('tardies'); setApprovalFilter('unreviewed'); }} className="text-xs px-3 py-1.5 rounded-full bg-destructive/10 text-destructive font-medium hover:bg-destructive/20 transition-colors">
                  {summary.unreviewedTardies} Unreviewed Tardies
                </button>
              )}
              {summary.missingShifts > 0 && (
                <button onClick={() => setTab('missing')} className="text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">
                  {summary.missingShifts} Missing Shifts
                </button>
              )}
              {summary.incomplete > 0 && (
                <button onClick={() => { setTab('status'); setAttendanceFilter('incomplete'); }} className="text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">
                  {summary.incomplete} Incomplete Punches
                </button>
              )}
              {summary.needsTimeFix > 0 && (
                <button onClick={() => { setTab('status'); setAttendanceFilter('all'); }} className="text-xs px-3 py-1.5 rounded-full bg-warning/10 text-warning font-medium hover:bg-warning/20 transition-colors">
                  {summary.needsTimeFix} Needs Time Fix
                </button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="status">Attendance Status</TabsTrigger>
          <TabsTrigger value="days_off">Days Off</TabsTrigger>
          <TabsTrigger value="tardies">
            Tardies
            {activeTardies.length > 0 && (
              <span className="ml-1.5 text-xs bg-destructive/20 text-destructive px-1.5 py-0.5 rounded-full">{activeTardies.length}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="missing">
            Missing Shifts
            {summary.missingShifts > 0 && (
              <span className="ml-1.5 text-xs bg-warning/20 text-warning px-1.5 py-0.5 rounded-full">{summary.missingShifts}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="closures">Closures</TabsTrigger>
          <TabsTrigger value="calendar">{personal ? 'My Calendar' : 'Calendar'}</TabsTrigger>
        </TabsList>

        {/* ATTENDANCE STATUS TAB */}
        <TabsContent value="status">
          <div className="flex flex-wrap gap-3 mb-4">
            <Select value={attendanceFilter} onValueChange={v => setAttendanceFilter(v as AttendanceFilter)}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Days</SelectItem>
                <SelectItem value="absent">Absent ({summary.absent})</SelectItem>
                <SelectItem value="late">Late ({summary.late})</SelectItem>
                <SelectItem value="incomplete">Incomplete ({summary.incomplete})</SelectItem>
                <SelectItem value="days_off">Days Off ({summary.daysOff})</SelectItem>
                <SelectItem value="closures">Closures ({summary.closures})</SelectItem>
                <SelectItem value="remote">Remote ({summary.remote})</SelectItem>
                <SelectItem value="onsite">On-site</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    {showEmployeeColumn && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>}
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Schedule</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Punches</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Location</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Tardy</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {statusLoading ? (
                    <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : !filteredStatus.length ? (
                    <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">No attendance data for this range</td></tr>
                  ) : (
                    withPersonHeaders(filteredStatus, 8, row => (
                      <tr key={row.id} className={`hover:bg-muted/50 ${row.is_absent ? 'border-l-4 border-l-destructive' : row.is_late ? 'border-l-4 border-l-warning' : ''}`}>
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{formatDate(row.entry_date)}</td>
                        {showEmployeeColumn && (
                          <td className="px-4 py-3">
                            <button
                              type="button"
                              className="font-medium text-left hover:underline"
                              title="Show only this team member"
                              onClick={() => { if (row.employee_id) setEmployeeFilter(row.employee_id); }}
                            >
                              {nameOf(row.employee_id)}
                            </button>
                          </td>
                        )}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {row.is_absent && <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">Absent</span>}
                            {row.is_incomplete && <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium">Incomplete</span>}
                            {row.is_late && <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">{row.minutes_late}m late</span>}
                            {row.has_edits && <span className="text-xs px-2 py-0.5 rounded bg-accent/20 text-accent font-medium">Edited</span>}
                            {row.timezone_suspect && <span className="text-xs px-2 py-0.5 rounded bg-warning/20 text-warning font-medium" title="This day's punch time looks off. Edit the punches (managers) or submit a correction request.">⚠ Time Looks Off</span>}
                            {row.office_closed && <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success font-medium">Closed</span>}
                            {row.has_day_off && <span className="text-xs px-2 py-0.5 rounded bg-primary/20 text-primary font-medium">Day Off</span>}
                            {!row.is_absent && !row.is_incomplete && !row.is_late && !row.office_closed && !row.has_day_off && row.has_punches && (
                              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">Arrived</span>
                            )}
                            {!row.is_scheduled_day && !row.office_closed && !row.has_day_off && !row.has_punches && (
                              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">Not scheduled</span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {row.is_scheduled_day ? formatClockRange(row.schedule_expected_start, row.schedule_expected_end) : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <DayPunches entry={entryFor(row)} />
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded ${row.is_remote ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'}`}>
                            {row.is_remote ? 'Remote' : row.has_punches ? 'On-site' : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-xs capitalize">{row.tardy_approval_status !== 'unreviewed' ? row.tardy_approval_status : '—'}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {isManager ? (
                              // The pencil edits THIS row's employee and day; the
                              // menu records days off, closures, and ignores.
                              <AttendanceActions row={row} alwaysShow editButton employeeName={nameOf(row.employee_id)} />
                            ) : row.has_punches ? (
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => navigate(`/timesheet?date=${row.entry_date}`)} title="View in Timesheet" aria-label="View in Timesheet">
                                <Table2 className="h-3.5 w-3.5" />
                              </Button>
                            ) : null}
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDebugRow(row)} title="Debug" aria-label="Debug">
                              <Bug className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* DAYS OFF TAB — excludes office_closed, with filter pills */}
        <TabsContent value="days_off">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            {(['all', 'scheduled_with_notice', 'unscheduled', 'medical_leave', 'other'] as DaysOffFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setDaysOffFilter(f)}
                className={`text-xs px-3 py-1.5 rounded-full font-medium transition-colors ${
                  daysOffFilter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                }`}
              >
                {f === 'all' ? 'All' : typeLabels[f]}
              </button>
            ))}
            {!personal && (
              <span className="text-xs text-muted-foreground ml-auto">
                {focusedName ? `${focusedName}'s` : 'Everyone\'s'} time off from {formatDate(startDate)} onward
              </span>
            )}
          </div>
          <Card className="card-elevated">
            <CardContent className="p-0">
              {daysOffLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
              ) : !filteredDaysOff.length ? (
                <p className="text-center text-muted-foreground py-12">No days off recorded</p>
              ) : (
                <div className="divide-y">
                  {filteredDaysOff.map(d => (
                    <div key={d.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {showEmployeeColumn && <span className="mr-2">{nameOf(d.employee_id)} ·</span>}
                            {formatDate(d.date_start)}
                            {d.date_start !== d.date_end && ` — ${formatDate(d.date_end)}`}
                          </p>
                          {d.notes && <p className="text-xs text-muted-foreground">{d.notes}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${typeColors[d.type]}`}>
                          {typeLabels[d.type]}
                        </span>
                        {d.hours != null && <span className="text-xs text-muted-foreground">{d.hours}h</span>}
                        {/* Removing a logged day off is an attendance-record change — manager only */}
                        {isManager && (
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDelete(d.id)} aria-label="Delete day off">
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* TARDIES TAB */}
        <TabsContent value="tardies">
          <div className="flex flex-wrap gap-4 items-center mb-4">
            <div className="flex items-center gap-2">
              <Switch checked={showOnlyTracked} onCheckedChange={setShowOnlyTracked} />
              <Label className="text-xs">Tracked only</Label>
            </div>
            <Select value={approvalFilter} onValueChange={setApprovalFilter}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="unreviewed">Unreviewed</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="unapproved">Unapproved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    {showEmployeeColumn && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>}
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Expected</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actual</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Minutes Late</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Reason</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {tardiesLoading ? (
                    <tr><td colSpan={8} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : !filteredTardies.length ? (
                    <tr><td colSpan={8} className="py-12 text-center text-muted-foreground">No tardies recorded</td></tr>
                  ) : (
                    withPersonHeaders(filteredTardies, 8, t => (
                      <tr key={t.id} className={t.timezone_suspect ? 'bg-warning/5' : ''}>
                        <td className="px-4 py-3 font-medium">
                          {formatDate(t.entry_date)}
                          {t.timezone_suspect && (
                            <span className="ml-1.5 text-xs px-1.5 py-0.5 rounded bg-warning/20 text-warning font-medium" title="This punch time looks off. Edit the punches (managers) or submit a correction request.">⚠ Time Looks Off</span>
                          )}
                        </td>
                        {showEmployeeColumn && <td className="px-4 py-3 font-medium">{nameOf(t.employee_id)}</td>}
                        <td className="px-4 py-3 time-display text-sm">{formatClock(t.expected_start_time)}</td>
                        <td className="px-4 py-3 time-display text-sm">
                          {t.timezone_suspect ? (
                            <span className="text-warning italic">—</span>
                          ) : (
                            formatTime(t.actual_start_time)
                          )}
                        </td>
                        <td className="px-4 py-3 font-semibold text-destructive">
                          {t.timezone_suspect ? '—' : t.minutes_late}
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate">{t.reason_text || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                            t.approval_status === 'approved' ? 'bg-success/20 text-success' :
                            t.approval_status === 'unapproved' ? 'bg-destructive/20 text-destructive' :
                            'bg-warning/20 text-warning'
                          }`}>{t.approval_status}</span>
                        </td>
                        <td className="px-4 py-3">
                          {/* Approving/editing tardies is manager-only; employees
                              add their reason from the Timesheet prompt */}
                          {isManager ? (
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReviewTardy(t)}>
                              {t.approval_status === 'unreviewed' ? 'Review' : 'Edit'}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
                {filteredTardies.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td colSpan={showEmployeeColumn ? 4 : 3} className="px-4 py-3 text-right">Totals:</td>
                      <td className="px-4 py-3 text-destructive">{filteredTardies.filter(t => !t.timezone_suspect).reduce((s, t) => s + t.minutes_late, 0)} min</td>
                      <td colSpan={3}></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </Card>

          <TardyReviewModal
            open={!!reviewTardy}
            tardy={reviewTardy}
            employeeName={isManager && reviewTardy ? nameOf(reviewTardy.employee_id) : undefined}
            onSubmit={handleTardyReview}
            onClose={() => setReviewTardy(null)}
          />
        </TabsContent>

        {/* MISSING SHIFTS TAB — truly absent, not closures, not scheduled/medical/other day off */}
        <TabsContent value="missing">
          <Card className="card-elevated overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Date</th>
                    {showEmployeeColumn && <th className="px-4 py-3 text-left font-medium text-muted-foreground">Employee</th>}
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Schedule</th>
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">Coverage</th>
                    <th className="px-4 py-3 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {statusLoading ? (
                    <tr><td colSpan={5} className="py-12 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" /></td></tr>
                  ) : !missingShiftRows.length ? (
                    <tr><td colSpan={5} className="py-12 text-center text-muted-foreground">No missing shifts — all clear!</td></tr>
                  ) : (
                    withPersonHeaders(missingShiftRows, 5, row => {
                      const hasUnscheduled = coverageFor(row).some(d => d.type === 'unscheduled');
                      return (
                        <tr key={row.id} className="border-l-4 border-l-destructive hover:bg-muted/50">
                          <td className="px-4 py-3 font-medium">{formatDate(row.entry_date)}</td>
                          {showEmployeeColumn && (
                            <td className="px-4 py-3">
                              <button type="button" className="font-medium text-left hover:underline" title="Show only this team member" onClick={() => { if (row.employee_id) setEmployeeFilter(row.employee_id); }}>
                                {nameOf(row.employee_id)}
                              </button>
                            </td>
                          )}
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {formatClockRange(row.schedule_expected_start, row.schedule_expected_end)}
                          </td>
                          <td className="px-4 py-3">
                            {hasUnscheduled ? (
                              <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">Callout</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded bg-destructive/20 text-destructive font-medium">No coverage</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end gap-1">
                              <AttendanceActions row={row} alwaysShow editButton employeeName={nameOf(row.employee_id)} />
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </TabsContent>

        {/* CLOSURES TAB */}
        <TabsContent value="closures">
          <Card className="card-elevated">
            <CardContent className="p-0">
              {!closuresList.length ? (
                <p className="text-center text-muted-foreground py-12">No office closures recorded.</p>
              ) : (
                <div className="divide-y">
                  {closuresList.map(c => (
                    <div key={c.id} className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-4 w-4 text-success" />
                        <div>
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(c.date)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded bg-success/20 text-success font-medium">Office Closed</span>
                        {c.source === 'days_off' && <span className="text-xs text-muted-foreground">(legacy)</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* CALENDAR TAB — one person at a time; a whole office on one grid says nothing */}
        <TabsContent value="calendar">
          {!personal && !focusedMember ? (
            <Card className="card-elevated">
              <CardContent className="py-12 text-center text-muted-foreground">
                Choose a team member above to see their calendar.
              </CardContent>
            </Card>
          ) : (
            <PersonalCalendar
              daysOff={visibleDaysOff}
              closures={closures || []}
              statusRows={visibleRows}
            />
          )}
        </TabsContent>
      </Tabs>

      <DebugDrawer row={debugRow} employeeName={isManager && debugRow ? nameOf(debugRow.employee_id) : undefined} open={!!debugRow} onClose={() => setDebugRow(null)} />
    </div>
  );
}
