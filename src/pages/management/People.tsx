import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Users, Plus, Loader2, CalendarDays } from 'lucide-react';
import ManagementShell from '@/components/management/ManagementShell';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees, useEmployeeAttendanceSummary, useAddEmployee } from '@/hooks/useEmployees';
import { useDerivedOrgAttendance } from '@/hooks/useAttendanceFallback';
import { useOrgAttendanceSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useConsumedSearchParam } from '@/hooks/useDeepLink';
import { officeStatus, staffingSummary } from '@/components/dashboard/staffing';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger } from '@/components/ui/dialog';
import EmployeeContactInputs from '@/components/team/EmployeeContactInputs';
import EmployeeNameInputs from '@/components/team/EmployeeNameInputs';
import { employeeContactFields } from '@/lib/employee-contact';
import InviteEmployeeModal from '@/components/InviteEmployeeModal';
import StaffCodeAttentionCard from '@/components/team/StaffCodeAttentionCard';
import AttendanceTrendCard from '@/components/team/AttendanceTrendCard';
import TeamEmployeeCard from '@/components/TeamEmployeeCard';
import ArchivedMembersDialog from '@/components/ArchivedMembersDialog';
import PendingInvitesCard from '@/components/PendingInvitesCard';
import ChecklistBypassesSection from '@/components/ChecklistBypassesSection';
import { OrgSnapshotPanel } from '@/components/OrgSnapshotPanel';
import { filterAndSortEmployees } from '@/lib/employee-name';
import { getToday, shiftDate } from '@/lib/time-utils';
import { isAbsence } from '@/lib/attendance-day';
import { useDayClock } from '@/hooks/useDayClock';

/**
 * Management → People (design §3.4, §7.3): who is here, who is missing, who
 * needs follow-up, and each person's record. Segments: Today (the one live
 * roster) · Everyone (the roster) · Team Attendance (the workspace, its own
 * page) · Patterns (context against the office's thresholds; never an item).
 */
type View = 'today' | 'everyone' | 'patterns';
const VIEWS: { id: View | 'attendance'; label: string; to?: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'everyone', label: 'Everyone' },
  { id: 'attendance', label: 'Team Attendance', to: '/management/attendance' },
  { id: 'patterns', label: 'Patterns' },
];

function TodayView() {
  const { data: snapshots, isLoading } = useOrgAttendanceSnapshot();
  const attention = useAttentionItems();
  const now = new Date();
  const summary = snapshots ? staffingSummary(snapshots, now) : null;
  const office = snapshots ? officeStatus(snapshots, now) : null;
  const openByEmployee = useMemo(() => {
    const m = new Map<string, { key: string; label: string }>();
    for (const i of attention.needsNow) {
      if (i.subject.employeeId && !m.has(i.subject.employeeId)) m.set(i.subject.employeeId, { key: i.key, label: i.label });
    }
    return m;
  }, [attention.needsNow]);
  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  return (
    <div className="space-y-4">
      {office && (
        <p className="text-sm">
          <span className="font-medium">{office.headline}.</span> {office.detail}
          {summary && summary.presentNow !== null && summary.expectedNow !== null && ` ${summary.presentNow} of ${summary.expectedNow} expected right now are clocked in.`}
        </p>
      )}
      <OrgSnapshotPanel openItemFor={id => openByEmployee.get(id) ?? null} />
    </div>
  );
}

function EveryoneView() {
  const { data: ctx } = useOrgContext();
  const { data: employees, isLoading } = useOrgEmployees();
  const [dateRange, setDateRange] = useState(() => ({ start: shiftDate(getToday(), -29), end: getToday() }));
  const { data: attendance } = useEmployeeAttendanceSummary(dateRange);
  const clock = useDayClock();
  const addEmployee = useAddEmployee();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ first_name: '', middle_initial: '', last_name: '', email: '' });
  const [search, setSearch] = useState('');
  const [addError, setAddError] = useState('');
  const [contact, setContact] = useState(() => employeeContactFields({}));

  // Employees with no stored attendance rows (typically pending members with
  // no login) still have punch history keyed by employee_id — derive theirs so
  // the roster counts are complete. A member off the clock (a doctor kept on
  // Team for the schedule) is never derived: nothing about them is absent.
  const missingAttendanceIds = useMemo(() => {
    if (!attendance || !employees) return [] as string[];
    const covered = new Set(attendance.map(r => r.employee_id));
    return employees.filter(e => !covered.has(e.id) && e.clocks_in !== false).map(e => e.id);
  }, [attendance, employees]);
  const { data: derivedAttendance } = useDerivedOrgAttendance(missingAttendanceIds, dateRange);

  const employeeStats = useMemo(() => {
    if (!attendance || !employees) return {};
    const stats: Record<string, { late: number; absent: number; present: number }> = {};
    for (const emp of employees) stats[emp.id] = { late: 0, absent: 0, present: 0 };
    for (const row of [...attendance, ...(derivedAttendance || [])]) {
      const s = stats[row.employee_id];
      if (!s) continue;
      if (isAbsence(row, [], clock)) s.absent++;
      else if (row.is_late) s.late++;
      else if (row.has_punches) s.present++;
    }
    return stats;
  }, [attendance, derivedAttendance, employees, clock]);

  const filteredEmployees = useMemo(() => filterAndSortEmployees(employees ?? [], search), [employees, search]);

  const handleAdd = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.first_name.trim() || !form.last_name.trim() || addEmployee.isPending) return;
    setAddError('');
    try {
      await addEmployee.mutateAsync({ first_name: form.first_name, middle_initial: form.middle_initial, last_name: form.last_name, contact, email: form.email.trim() || undefined });
      setAddOpen(false);
      setForm({ first_name: '', middle_initial: '', last_name: '', email: '' });
      setContact(employeeContactFields({}));
    } catch (error) {
      setAddError(error && typeof error === 'object' && 'message' in error ? String(error.message) : 'Could not add team member. Please try again.');
    }
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{ctx?.org_name} · {employees?.length || 0} people</p>
        <div className="flex items-center gap-2">
          <Dialog open={addOpen} onOpenChange={open => { setAddOpen(open); setAddError(''); }}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
              <DialogHeader><DialogTitle>Add team member</DialogTitle><DialogDescription>Add their name now and email when available. Adding a team member does not send an invitation.</DialogDescription></DialogHeader>
              <form onSubmit={handleAdd} className="space-y-4">
                <EmployeeNameInputs value={form} onChange={names => setForm({ ...form, ...names })} disabled={addEmployee.isPending} />
                <div className="space-y-1">
                  <Label htmlFor="add-employee-email">Email (optional)</Label>
                  <Input id="add-employee-email" autoComplete="email" disabled={addEmployee.isPending} type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" />
                </div>
                <details className="rounded-lg border p-3">
                  <summary className="cursor-pointer text-sm font-medium">Address, phone, and emergency contact (optional)</summary>
                  <div className="pt-4"><EmployeeContactInputs value={contact} onChange={setContact} disabled={addEmployee.isPending} /></div>
                </details>
                {addError && <p role="alert" className="text-sm text-destructive">{addError}</p>}
                <Button type="submit" disabled={addEmployee.isPending || !form.first_name.trim() || !form.last_name.trim()} className="w-full">
                  {addEmployee.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add team member
                </Button>
              </form>
            </DialogContent>
          </Dialog>
          <InviteEmployeeModal />
          <ArchivedMembersDialog />
        </div>
      </div>

      <PendingInvitesCard />

      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Range:</span>
        <Input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} className="w-[10rem] h-8 text-xs" />
        <span className="text-xs text-muted-foreground">to</span>
        <Input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} className="w-[10rem] h-8 text-xs" />
      </div>

      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search people..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-xs h-9" />
      </div>

      {!filteredEmployees.length ? (
        <p className="py-8 text-center text-muted-foreground">
          {employees?.length ? 'No one matches your search.' : 'No people yet. Add your first team member above.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredEmployees.map(emp => (
            <TeamEmployeeCard key={emp.id} employee={emp} stats={employeeStats[emp.id] || { present: 0, late: 0, absent: 0 }} dateRange={dateRange} />
          ))}
        </div>
      )}
    </div>
  );
}

function PatternsView({ bypassId }: { bypassId: string | null }) {
  const { data: ctx } = useOrgContext();
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">Context against the office's own thresholds. A pattern never creates an Attention item by itself; the rule that admits one is named on the item.</p>
      <AttendanceTrendCard />
      <StaffCodeAttentionCard />
      {ctx && <ChecklistBypassesSection orgId={ctx.org_id} highlightId={bypassId} />}
    </div>
  );
}

export default function People() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  const view: View = raw === 'everyone' || raw === 'patterns' ? raw : 'today';
  // A bypass notification lands on the exact row under Patterns.
  const linkedBypassId = useConsumedSearchParam('bypass');

  return (
    <ManagementShell room="people">
      <div className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">People</h1>
            <p className="text-sm text-muted-foreground">Who is here, who is missing, who needs follow-up, and each person's story.</p>
          </div>
          <nav aria-label="People views" className="flex flex-wrap gap-1">
            {VIEWS.map(v => v.to ? (
              <Link key={v.id} to={v.to} className="min-h-9 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted/60">{v.label}</Link>
            ) : (
              <button
                key={v.id}
                type="button"
                aria-current={view === v.id ? 'page' : undefined}
                onClick={() => setParams(prev => { const next = new URLSearchParams(prev); if (v.id === 'today') next.delete('view'); else next.set('view', v.id); return next; }, { replace: true })}
                className={`min-h-9 rounded-md px-3 text-sm ${view === v.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}
              >
                {v.label}
              </button>
            ))}
          </nav>
        </div>
        {view === 'today' && <TodayView />}
        {view === 'everyone' && <EveryoneView />}
        {view === 'patterns' && <PatternsView bypassId={linkedBypassId} />}
      </div>
    </ManagementShell>
  );
}
