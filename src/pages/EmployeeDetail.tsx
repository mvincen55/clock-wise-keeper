import { useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useEmployeeDetail, useEmployeeAttendance, useEmployeeTimeEntries } from '@/hooks/useEmployees';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Clock, CalendarDays, Plus, ShieldAlert } from 'lucide-react';
import { formatDate, formatTime, minutesToHHMM } from '@/lib/time-utils';
import IncidentReportModal from '@/components/IncidentReportModal';
import IncidentReportDetail from '@/components/IncidentReportDetail';
import { useEmployeeIncidentReports, type IncidentReport } from '@/hooks/useIncidentReports';
import {
  CATEGORY_LABELS,
  SEVERITY_CLASSES,
  SEVERITY_LABELS,
  STATUS_CLASSES,
  STATUS_LABELS,
  formatClockTime,
  labelFor,
  type IncidentSeverity,
  type IncidentStatus,
} from '@/lib/incidents';

function getLast14Days() {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - 13);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

const statusBadge: Record<string, { label: string; className: string }> = {
  ok: { label: 'OK', className: 'bg-success/20 text-success' },
  remote_ok: { label: 'Remote', className: 'bg-accent/20 text-accent' },
  late: { label: 'Late', className: 'bg-warning/20 text-warning' },
  absent: { label: 'Absent', className: 'bg-destructive/20 text-destructive' },
  incomplete: { label: 'Incomplete', className: 'bg-warning/20 text-warning' },
  closure: { label: 'Closed', className: 'bg-muted text-muted-foreground' },
  day_off: { label: 'Day Off', className: 'bg-primary/20 text-primary' },
  unscheduled: { label: 'No Schedule', className: 'bg-muted text-muted-foreground' },
  timezone_suspect: { label: 'TZ Issue', className: 'bg-destructive/20 text-destructive' },
};

export default function EmployeeDetail() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { data: ctx } = useOrgContext();
  const { data: employee, isLoading: empLoading } = useEmployeeDetail(employeeId);
  const range = useMemo(() => getLast14Days(), []);
  const { data: attendance, isLoading: attLoading } = useEmployeeAttendance(employeeId, range);
  const { data: entries } = useEmployeeTimeEntries(employeeId, range);
  const { data: incidents } = useEmployeeIncidentReports(employeeId);

  const [incidentFormOpen, setIncidentFormOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<IncidentReport | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentReport | null>(null);

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  if (empLoading || attLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isManager || !employee) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        <p>Employee not found or access denied.</p>
        <Link to="/team"><Button variant="outline" className="mt-4">Back to Team</Button></Link>
      </div>
    );
  }

  // Summary stats
  const stats = (attendance || []).reduce(
    (acc, row) => {
      if (row.is_absent) acc.absent++;
      else if (row.is_late) acc.late++;
      else if (row.has_punches) acc.present++;
      acc.totalMinutesLate += row.minutes_late || 0;
      return acc;
    },
    { present: 0, late: 0, absent: 0, totalMinutesLate: 0 }
  );

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/team">
          <Button variant="ghost" size="icon"><ArrowLeft className="h-4 w-4" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">{employee.display_name}</h1>
          <p className="text-muted-foreground">{employee.email || 'No email'} · Eastern (ET)</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-3">
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-success">{stats.present}</p>
            <p className="text-xs text-muted-foreground">Present</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-warning">{stats.late}</p>
            <p className="text-xs text-muted-foreground">Late</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.absent}</p>
            <p className="text-xs text-muted-foreground">Absent</p>
          </CardContent>
        </Card>
        <Card className="card-elevated">
          <CardContent className="p-3 text-center">
            <p className="text-2xl font-bold">{stats.totalMinutesLate}</p>
            <p className="text-xs text-muted-foreground">Min Late</p>
          </CardContent>
        </Card>
      </div>

      {/* Incident Reports — injuries and exposures filed to this record. */}
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />Incident Reports
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setEditingIncident(null);
                setIncidentFormOpen(true);
              }}
            >
              <Plus className="mr-2 h-4 w-4" /> File Report
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {!incidents?.length ? (
            <p className="text-center text-muted-foreground py-8">No incident reports.</p>
          ) : (
            <div className="divide-y">
              {incidents.map(report => {
                const time = formatClockTime(report.incident_time);
                return (
                  <button
                    key={report.id}
                    onClick={() => setSelectedIncident(report)}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium">
                        {labelFor(CATEGORY_LABELS, report.category)}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground">
                          {formatDate(report.incident_date)}
                          {time ? ` · ${time}` : ''}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            SEVERITY_CLASSES[report.severity as IncidentSeverity] ??
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {labelFor(SEVERITY_LABELS, report.severity)}
                        </span>
                        <span
                          className={`text-xs px-2 py-0.5 rounded font-medium ${
                            STATUS_CLASSES[report.status as IncidentStatus] ??
                            'bg-muted text-muted-foreground'
                          }`}
                        >
                          {labelFor(STATUS_LABELS, report.status)}
                        </span>
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{report.description}</p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <IncidentReportModal
        open={incidentFormOpen}
        report={editingIncident}
        defaultEmployeeId={employee.id}
        employees={[{ id: employee.id, display_name: employee.display_name }]}
        onClose={() => {
          setIncidentFormOpen(false);
          setEditingIncident(null);
        }}
      />

      <IncidentReportDetail
        report={selectedIncident}
        employeeName={employee.display_name}
        onClose={() => setSelectedIncident(null)}
        onEdit={report => {
          setSelectedIncident(null);
          setEditingIncident(report);
          setIncidentFormOpen(true);
        }}
      />

      {/* Attendance Timeline */}
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Last 14 Days</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!attendance?.length ? (
            <p className="text-center text-muted-foreground py-8">No attendance data.</p>
          ) : (
            <div className="divide-y">
              {attendance.map(row => {
                const sb = statusBadge[row.status_code] || statusBadge.ok;
                return (
                  <div key={row.id} className="flex items-center justify-between px-4 py-2.5">
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium w-24">{formatDate(row.entry_date)}</span>
                      <span className={`text-xs px-2 py-0.5 rounded font-medium ${sb.className}`}>{sb.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
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
          )}
        </CardContent>
      </Card>

      {/* Recent Time Entries */}
      <Card className="card-elevated">
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Recent Time Entries</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {!entries?.length ? (
            <p className="text-center text-muted-foreground py-8">No time entries.</p>
          ) : (
            <div className="divide-y">
              {entries.map(entry => (
                <div key={entry.id} className="px-4 py-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{formatDate(entry.entry_date)}</span>
                    <span className="time-display text-sm font-semibold">{minutesToHHMM(entry.total_minutes || 0)}</span>
                  </div>
                  {entry.punches && entry.punches.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {(entry.punches as any[]).sort((a: any, b: any) => a.seq - b.seq).map((p: any) => (
                        <span key={p.id} className={`text-xs px-1.5 py-0.5 rounded ${p.punch_type === 'in' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>
                          {p.punch_type} {formatTime(p.punch_time)}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
