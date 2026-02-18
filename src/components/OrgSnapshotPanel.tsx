import { useOrgAttendanceSnapshot, EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, AlertTriangle, UserX, Clock, Coffee, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';

function statusBucket(s: EmployeeSnapshot) {
  if (s.office_closed) return 'closed';
  if (s.has_day_off) return 'day_off';
  if (!s.is_scheduled_day) return 'unscheduled';
  if (s.is_absent && !s.has_punches) return 'absent';
  if (s.is_late) return 'late';
  if (s.is_incomplete) return 'incomplete';
  if (s.has_punches) return 'clocked_in';
  return 'not_started';
}

const bucketConfig: Record<string, { label: string; color: string; bg: string; icon: typeof Users }> = {
  clocked_in: { label: 'Clocked In', color: 'text-success', bg: 'bg-success/10', icon: UserCheck },
  late: { label: 'Late', color: 'text-destructive', bg: 'bg-destructive/10', icon: AlertTriangle },
  absent: { label: 'Absent', color: 'text-warning', bg: 'bg-warning/10', icon: UserX },
  not_started: { label: 'Not Started', color: 'text-muted-foreground', bg: 'bg-muted', icon: Clock },
  incomplete: { label: 'Incomplete', color: 'text-warning', bg: 'bg-warning/10', icon: AlertTriangle },
  day_off: { label: 'Day Off', color: 'text-primary', bg: 'bg-primary/10', icon: Coffee },
  closed: { label: 'Office Closed', color: 'text-muted-foreground', bg: 'bg-muted', icon: Coffee },
  unscheduled: { label: 'Unscheduled', color: 'text-muted-foreground', bg: 'bg-muted', icon: Clock },
};

export function OrgSnapshotPanel() {
  const { data: snapshots, isLoading } = useOrgAttendanceSnapshot();

  if (isLoading) {
    return (
      <Card className="card-elevated">
        <CardContent className="p-6 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!snapshots?.length) return null;

  // Group by bucket
  const groups: Record<string, EmployeeSnapshot[]> = {};
  snapshots.forEach(s => {
    const b = statusBucket(s);
    if (!groups[b]) groups[b] = [];
    groups[b].push(s);
  });

  // Summary counts
  const total = snapshots.length;
  const clockedIn = (groups.clocked_in?.length || 0);
  const late = (groups.late?.length || 0);
  const absent = (groups.absent?.length || 0);
  const notStarted = (groups.not_started?.length || 0);

  // Ordered display
  const displayOrder = ['late', 'absent', 'incomplete', 'not_started', 'clocked_in', 'day_off', 'closed', 'unscheduled'];

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Today's Team
          </CardTitle>
          <Link to="/team" className="text-xs text-primary hover:underline">View All →</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary chips */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xl font-bold">{total}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Total</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-success/10">
            <p className="text-xl font-bold text-success">{clockedIn}</p>
            <p className="text-[10px] text-success uppercase">In</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-destructive/10">
            <p className="text-xl font-bold text-destructive">{late}</p>
            <p className="text-[10px] text-destructive uppercase">Late</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-warning/10">
            <p className="text-xl font-bold text-warning">{absent + notStarted}</p>
            <p className="text-[10px] text-warning uppercase">Out</p>
          </div>
        </div>

        {/* Employee list grouped by status */}
        <div className="space-y-3">
          {displayOrder.map(bucket => {
            const list = groups[bucket];
            if (!list?.length) return null;
            const cfg = bucketConfig[bucket];
            const Icon = cfg.icon;
            return (
              <div key={bucket}>
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={`h-3.5 w-3.5 ${cfg.color}`} />
                  <span className={`text-xs font-semibold uppercase ${cfg.color}`}>
                    {cfg.label} ({list.length})
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.map(emp => (
                    <Link
                      key={emp.employee_id}
                      to={`/team/${emp.employee_id}`}
                      className={`text-xs px-2 py-1 rounded-md ${cfg.bg} ${cfg.color} hover:opacity-80 transition-opacity`}
                    >
                      {emp.display_name}
                      {emp.is_late && emp.minutes_late > 0 && (
                        <span className="ml-1 font-semibold">+{emp.minutes_late}m</span>
                      )}
                      {emp.is_remote && <span className="ml-1 opacity-70">📍</span>}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
