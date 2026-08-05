import { useState, useMemo } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees, useEmployeeAttendanceSummary } from '@/hooks/useEmployees';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAddEmployee } from '@/hooks/useEmployees';
import InviteEmployeeModal from '@/components/InviteEmployeeModal';
import PendingInvitesCard from '@/components/PendingInvitesCard';
import TeamEmployeeCard from '@/components/TeamEmployeeCard';
import ArchivedMembersDialog from '@/components/ArchivedMembersDialog';
import ChecklistBypassesSection from '@/components/ChecklistBypassesSection';
import { Users, Plus, Loader2, CalendarDays } from 'lucide-react';

function getDefaultRange() {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 29);
  return {
    start: start.toISOString().split('T')[0],
    end: now.toISOString().split('T')[0],
  };
}

export default function Team() {
  const { data: ctx, isLoading: ctxLoading } = useOrgContext();
  const { data: employees, isLoading: empLoading } = useOrgEmployees();
  const [dateRange, setDateRange] = useState(() => getDefaultRange());
  const { data: attendance } = useEmployeeAttendanceSummary(dateRange);
  const addEmployee = useAddEmployee();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });
  const [search, setSearch] = useState('');

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  const employeeStats = useMemo(() => {
    if (!attendance || !employees) return {};
    const stats: Record<string, { late: number; absent: number; present: number }> = {};
    for (const emp of employees) {
      stats[emp.id] = { late: 0, absent: 0, present: 0 };
    }
    for (const row of attendance) {
      const s = stats[row.employee_id];
      if (!s) continue;
      if (row.is_absent) s.absent++;
      else if (row.is_late) s.late++;
      else if (row.has_punches) s.present++;
    }
    return stats;
  }, [attendance, employees]);

  const filteredEmployees = useMemo(() => {
    if (!employees) return [];
    if (!search.trim()) return employees;
    const q = search.toLowerCase();
    return employees.filter(e =>
      e.display_name.toLowerCase().includes(q) ||
      (e.email && e.email.toLowerCase().includes(q))
    );
  }, [employees, search]);

  const handleAdd = async () => {
    if (!form.name.trim()) return;
    await addEmployee.mutateAsync({ display_name: form.name, email: form.email || undefined });
    setAddOpen(false);
    setForm({ name: '', email: '' });
  };

  if (ctxLoading || empLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>You don't have permission to view this page.</p>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Team</h1>
          <p className="text-muted-foreground">{ctx?.org_name} — {employees?.length || 0} employees</p>
        </div>
        <div className="flex items-center gap-2">
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="mr-1 h-4 w-4" />Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Employee</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div className="space-y-1">
                  <Label>Name *</Label>
                  <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Jane Smith" />
                </div>
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" />
                </div>
                <Button onClick={handleAdd} disabled={addEmployee.isPending || !form.name.trim()} className="w-full">
                  {addEmployee.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Add Employee
                </Button>
              </div>
            </DialogContent>
          </Dialog>
          <InviteEmployeeModal />
          <ArchivedMembersDialog />
        </div>
      </div>

      {/* Date Range */}
      <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/30 px-4 py-2.5">
        <CalendarDays className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-muted-foreground">Range:</span>
        <Input
          type="date"
          value={dateRange.start}
          onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
          className="w-[10rem] h-8 text-xs"
        />
        <span className="text-xs text-muted-foreground">to</span>
        <Input
          type="date"
          value={dateRange.end}
          onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
          className="w-[10rem] h-8 text-xs"
        />
      </div>

      {/* Pending invites */}
      <PendingInvitesCard />

      {/* Search */}
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search employees..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="max-w-xs h-9"
        />
      </div>

      {/* Employee Cards */}
      {!filteredEmployees.length ? (
        <p className="text-center text-muted-foreground py-8">
          {employees?.length ? 'No employees match your search.' : 'No employees yet. Add your first team member above.'}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredEmployees.map(emp => (
            <TeamEmployeeCard
              key={emp.id}
              employee={emp}
              stats={employeeStats[emp.id] || { present: 0, late: 0, absent: 0 }}
              dateRange={dateRange}
            />
          ))}
        </div>
      )}

      {(ctx?.role === 'owner' || ctx?.role === 'manager') && (
        <ChecklistBypassesSection orgId={ctx.org_id} />
      )}
    </div>
  );
}
