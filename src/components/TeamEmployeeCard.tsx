import { useState, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useEmployeeAttendance, useEmployeeTimeEntries } from '@/hooks/useEmployees';
import { useEmployeeScheduleAssignments, useEmployeeTardies, useEmployeeDaysOff } from '@/hooks/useEmployeeSchedules';
import { WEEKDAY_NAMES } from '@/hooks/useScheduleVersions';
import { formatDate, formatTime, minutesToHHMM } from '@/lib/time-utils';
import { ChevronDown, ChevronUp, Clock, Calendar, AlertTriangle, CalendarOff, Loader2, Pencil } from 'lucide-react';
import { Link } from 'react-router-dom';

type Employee = {
  id: string;
  display_name: string;
  email: string | null;
  user_id: string | null;
  timezone: string;
};

type WeekStats = {
  present: number;
  late: number;
  absent: number;
};

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

function getLast30Days() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 29);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

export default function TeamEmployeeCard({ employee, stats }: { employee: Employee; stats: WeekStats }) {
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState('attendance');
  const range = useMemo(() => getLast30Days(), []);

  return (
    <Card className="card-elevated overflow-hidden">
      {/* Header - always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-sm font-bold text-primary shrink-0">
            {employee.display_name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm font-semibold">{employee.display_name}</p>
            <p className="text-xs text-muted-foreground">{employee.email || 'No email'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {stats.late > 0 && (
            <Badge variant="outline" className="text-warning border-warning/30 text-xs">{stats.late} late</Badge>
          )}
          {stats.absent > 0 && (
            <Badge variant="outline" className="text-destructive border-destructive/30 text-xs">{stats.absent} absent</Badge>
          )}
          {stats.present > 0 && (
            <Badge variant="outline" className="text-success border-success/30 text-xs">{stats.present} present</Badge>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded content */}
      {expanded && (
        <CardContent className="border-t pt-3 pb-4 px-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full grid grid-cols-4 mb-3">
              <TabsTrigger value="attendance" className="text-xs"><Calendar className="h-3 w-3 mr-1" />Attendance</TabsTrigger>
              <TabsTrigger value="schedule" className="text-xs"><Clock className="h-3 w-3 mr-1" />Schedule</TabsTrigger>
              <TabsTrigger value="tardies" className="text-xs"><AlertTriangle className="h-3 w-3 mr-1" />Tardies</TabsTrigger>
              <TabsTrigger value="callouts" className="text-xs"><CalendarOff className="h-3 w-3 mr-1" />Callouts</TabsTrigger>
            </TabsList>

            <TabsContent value="attendance">
              <AttendanceTab employeeId={employee.id} range={range} />
            </TabsContent>
            <TabsContent value="schedule">
              <ScheduleTab employeeId={employee.id} />
            </TabsContent>
            <TabsContent value="tardies">
              <TardiesTab employeeId={employee.id} range={range} />
            </TabsContent>
            <TabsContent value="callouts">
              <CalloutsTab employeeId={employee.id} />
            </TabsContent>
          </Tabs>

          <div className="mt-3 flex justify-end">
            <Link to={`/team/${employee.id}`}>
              <Button variant="outline" size="sm" className="text-xs">
                <Pencil className="h-3 w-3 mr-1" />Full Detail
              </Button>
            </Link>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

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
              {row.schedule_expected_start && (
                <span>Sched: {row.schedule_expected_start?.toString().slice(0, 5)}</span>
              )}
              {row.minutes_late != null && row.minutes_late > 0 && (
                <span className="text-warning font-semibold">+{row.minutes_late}min</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScheduleTab({ employeeId }: { employeeId: string }) {
  const { data: assignments, isLoading } = useEmployeeScheduleAssignments(employeeId);

  if (isLoading) return <LoadingSpinner />;
  if (!assignments?.length) return <EmptyState text="No schedule assigned. Assign one from Settings." />;

  return (
    <div className="space-y-3">
      {assignments.map((a: any) => {
        const sv = a.schedule_version;
        if (!sv) return null;
        const weekdays = (sv.weekdays || []).sort((x: any, y: any) => x.weekday - y.weekday);
        const isActive = !a.effective_end || a.effective_end >= new Date().toISOString().split('T')[0];

        return (
          <div key={a.id} className={`rounded-lg border ${isActive ? 'border-primary/30' : 'border-muted'}`}>
            <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
              <div>
                <p className="text-sm font-medium">{sv.name || 'Schedule'}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDate(a.effective_start)}{a.effective_end ? ` → ${formatDate(a.effective_end)}` : ' → Present'}
                </p>
              </div>
              {isActive && <Badge variant="default" className="text-xs">Active</Badge>}
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
  );
}

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
            {t.reason_text && (
              <p className="text-xs text-muted-foreground mt-1 italic">"{t.reason_text}"</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function CalloutsTab({ employeeId }: { employeeId: string }) {
  const { data: daysOff, isLoading } = useEmployeeDaysOff(employeeId);

  if (isLoading) return <LoadingSpinner />;
  if (!daysOff?.length) return <EmptyState text="No callouts or days off recorded." />;

  return (
    <div className="divide-y rounded-lg border max-h-80 overflow-y-auto">
      {daysOff.map((d: any) => (
        <div key={d.id} className="px-3 py-2 text-sm">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="font-medium text-xs w-20">{formatDate(d.date_start)}</span>
              {d.date_start !== d.date_end && (
                <span className="text-xs text-muted-foreground">→ {formatDate(d.date_end)}</span>
              )}
            </div>
            <Badge variant="outline" className="text-xs">
              {DAY_OFF_LABELS[d.type] || d.type}
            </Badge>
          </div>
          {d.notes && (
            <p className="text-xs text-muted-foreground mt-1 italic">"{d.notes}"</p>
          )}
          {d.hours != null && (
            <p className="text-xs text-muted-foreground mt-0.5">{d.hours}h</p>
          )}
        </div>
      ))}
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex justify-center py-6">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <p className="text-center text-muted-foreground text-sm py-6">{text}</p>;
}
