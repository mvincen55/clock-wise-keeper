import { useState } from 'react';
import { useOrgAttendanceSnapshot, EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { snapshotCounts, statusBucket, type SnapshotBucket } from '@/lib/team-snapshot';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, UserCheck, AlertTriangle, UserX, Clock, Coffee, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatEmployeeNameLastFirst } from '@/lib/employee-name';

const bucketConfig: Record<SnapshotBucket, { label: string; color: string; bg: string; icon: typeof Users }> = {
  late: { label: 'Late', color: 'text-destructive', bg: 'bg-destructive/10', icon: AlertTriangle },
  absent: { label: 'Absent', color: 'text-warning', bg: 'bg-warning/10', icon: UserX },
  incomplete: { label: 'Missing clock out', color: 'text-warning', bg: 'bg-warning/10', icon: AlertTriangle },
  not_started: { label: 'Not in yet', color: 'text-muted-foreground', bg: 'bg-muted', icon: Clock },
  clocked_in: { label: 'In', color: 'text-success', bg: 'bg-success/10', icon: UserCheck },
  day_off: { label: 'Day off', color: 'text-primary', bg: 'bg-primary/10', icon: Coffee },
  closed: { label: 'Office closed', color: 'text-muted-foreground', bg: 'bg-muted', icon: Coffee },
  unscheduled: { label: 'Not scheduled', color: 'text-muted-foreground', bg: 'bg-muted', icon: Clock },
};

/** What needs a manager's eye today, in the order it needs it. */
const ATTENTION_ORDER: SnapshotBucket[] = ['late', 'absent', 'incomplete', 'not_started', 'clocked_in'];
/** Nothing to do about these; shown folded so eight unscheduled names do not bury one absence. */
const QUIET_ORDER: SnapshotBucket[] = ['day_off', 'closed', 'unscheduled'];

/** The Team Attendance page, focused on one person: where a manager acts on what they see here. */
const attendanceLink = (employeeId: string) => `/management/attendance?employee=${employeeId}`;

export function OrgSnapshotPanel() {
  const { data: snapshots, isLoading } = useOrgAttendanceSnapshot();
  const [quietOpen, setQuietOpen] = useState(false);

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

  // Group by bucket, names surname first like every roster in the office.
  const groups: Partial<Record<SnapshotBucket, EmployeeSnapshot[]>> = {};
  snapshots.forEach(s => {
    const b = statusBucket(s);
    (groups[b] ??= []).push(s);
  });
  for (const list of Object.values(groups)) {
    list.sort((a, b) => formatEmployeeNameLastFirst(a.display_name).localeCompare(formatEmployeeNameLastFirst(b.display_name)));
  }

  const counts = snapshotCounts(snapshots);
  const quietTotal = QUIET_ORDER.reduce((n, b) => n + (groups[b]?.length ?? 0), 0);

  const renderGroup = (bucket: SnapshotBucket) => {
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
              to={attendanceLink(emp.employee_id)}
              title="Open in Team Attendance"
              className={`text-xs px-2 py-1 rounded-md ${cfg.bg} ${cfg.color} hover:opacity-80 transition-opacity`}
            >
              {formatEmployeeNameLastFirst(emp.display_name)}
              {emp.is_late && emp.minutes_late > 0 && (
                <span className="ml-1 font-semibold">+{emp.minutes_late}m</span>
              )}
              {emp.is_remote && <span className="ml-1 opacity-70" title="Remote">📍</span>}
            </Link>
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Today's Team
          </CardTitle>
          <Link to="/management/attendance" className="text-xs text-primary hover:underline">Team Attendance →</Link>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary chips */}
        <div className="grid grid-cols-4 gap-2">
          <div className="text-center p-2 rounded-lg bg-muted/50">
            <p className="text-xl font-bold">{counts.total}</p>
            <p className="text-[10px] text-muted-foreground uppercase">Total</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-success/10" title="Everyone who has clocked in today, late arrivals included">
            <p className="text-xl font-bold text-success">{counts.in}</p>
            <p className="text-[10px] text-success uppercase">In</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-destructive/10" title="Arrived after their scheduled start">
            <p className="text-xl font-bold text-destructive">{counts.late}</p>
            <p className="text-[10px] text-destructive uppercase">Late</p>
          </div>
          <div className="text-center p-2 rounded-lg bg-warning/10" title="Scheduled today with no punches yet">
            <p className="text-xl font-bold text-warning">{counts.notIn}</p>
            <p className="text-[10px] text-warning uppercase">Not in</p>
          </div>
        </div>

        {/* Who needs attention, then who is in */}
        <div className="space-y-3">
          {ATTENTION_ORDER.map(renderGroup)}
        </div>

        {/* Off today: folded so it never buries the list above */}
        {quietTotal > 0 && (
          <div className="border-t pt-3">
            <button
              type="button"
              onClick={() => setQuietOpen(o => !o)}
              aria-expanded={quietOpen}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase text-muted-foreground hover:text-foreground"
            >
              {quietOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              Off today ({quietTotal})
              <span className="font-normal normal-case">
                {' · '}
                {QUIET_ORDER.filter(b => groups[b]?.length).map(b => `${bucketConfig[b].label} ${groups[b]!.length}`).join(' · ')}
              </span>
            </button>
            {quietOpen && (
              <div className="mt-3 space-y-3">
                {QUIET_ORDER.map(renderGroup)}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
