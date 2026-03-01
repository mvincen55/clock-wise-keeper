import { useState, useMemo } from 'react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees, useEmployeeAttendanceSummary } from '@/hooks/useEmployees';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useAddEmployee } from '@/hooks/useEmployees';
import InviteEmployeeModal from '@/components/InviteEmployeeModal';
import { Users, Plus, Loader2, UserCheck, UserX, AlertTriangle, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';

function getWeekRange() {
  const now = new Date();
  const day = now.getDay();
  const start = new Date(now);
  start.setDate(now.getDate() - day + 1); // Monday
  const end = new Date(start);
  end.setDate(start.getDate() + 6); // Sunday
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default function Team() {
  const { data: ctx, isLoading: ctxLoading } = useOrgContext();
  const { data: employees, isLoading: empLoading } = useOrgEmployees();
  const weekRange = useMemo(() => getWeekRange(), []);
  const { data: attendance } = useEmployeeAttendanceSummary(weekRange);
  const addEmployee = useAddEmployee();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: '', email: '' });

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  // Build per-employee stats
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Team</h1>
          <p className="text-muted-foreground">{ctx?.org_name} — {employees?.length || 0} employees</p>
        </div>
        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-2 h-4 w-4" />Add</Button>
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
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="card-elevated">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-success/10 flex items-center justify-center">
              <UserCheck className="h-5 w-5 text-success" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Object.values(employeeStats).reduce((s, e) => s + e.present, 0)}</p>
              <p className="text-xs text-muted-foreground">Present this week</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-warning/10 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-warning" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Object.values(employeeStats).reduce((s, e) => s + e.late, 0)}</p>
              <p className="text-xs text-muted-foreground">Late this week</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-destructive/10 flex items-center justify-center">
              <UserX className="h-5 w-5 text-destructive" />
            </div>
            <div>
              <p className="text-2xl font-bold">{Object.values(employeeStats).reduce((s, e) => s + e.absent, 0)}</p>
              <p className="text-xs text-muted-foreground">Absent this week</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Employee List */}
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5" />Employees</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!employees?.length ? (
            <p className="text-center text-muted-foreground py-8">No employees yet. Add your first team member above.</p>
          ) : (
            <div className="divide-y">
              {employees.map(emp => {
                const stats = employeeStats[emp.id] || { present: 0, late: 0, absent: 0 };
                return (
                  <Link
                    key={emp.id}
                    to={`/team/${emp.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-sm font-semibold text-primary">
                        {emp.display_name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="text-sm font-medium">{emp.display_name}</p>
                        <p className="text-xs text-muted-foreground">{emp.email || 'No email'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {stats.late > 0 && <Badge variant="outline" className="text-warning border-warning/30 text-xs">{stats.late} late</Badge>}
                      {stats.absent > 0 && <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">{stats.absent} absent</Badge>}
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
