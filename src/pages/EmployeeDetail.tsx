import EmployeeContactCard from '@/components/team/EmployeeContactCard';
import EmployeeFavoritesCard from '@/components/team/EmployeeFavoritesCard';
import { useEmployeeDaysOff } from '@/hooks/useEmployeeSchedules';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useEmployeeDetail, useEmployeeTimeEntries } from '@/hooks/useEmployees';
import { useResolvedEmployeeAttendance } from '@/hooks/useAttendanceFallback';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmployeeTimeHistory from '@/components/team/EmployeeTimeHistory';
import { Button } from '@/components/ui/button';
import { Loader2, ArrowLeft, Plus, ShieldAlert } from 'lucide-react';
import { formatDate, getToday, shiftDate } from '@/lib/time-utils';
import EditEmployeeDialog from '@/components/team/EditEmployeeDialog';
import { formatEmployeeName } from '@/lib/employee-name';
import EmployeeSetupCard from '@/components/team/EmployeeSetupCard';
import AccountabilityHistory from '@/components/accountability/AccountabilityHistory';
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
  const end = getToday();
  return { start: shiftDate(end, -13), end };
}

export default function EmployeeDetail() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { data: ctx } = useOrgContext();
  const { data: employee, isLoading: empLoading } = useEmployeeDetail(employeeId);
  const [range, setRange] = useState(() => getLast14Days());
  const { data: daysOff, isLoading: daysOffLoading, error: daysOffError } = useEmployeeDaysOff(employeeId, range.start, range.end);
  const { rows: attendance, isLoading: attLoading } = useResolvedEmployeeAttendance(employeeId, range);
  const { data: entries, isLoading: entriesLoading, isError: entriesError } = useEmployeeTimeEntries(employeeId, range);
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
          <h1 className="text-2xl md:text-3xl font-bold">{formatEmployeeName(employee.display_name)}</h1>
          <p className="text-muted-foreground">{employee.email || 'No email'} · Eastern (ET)</p>
        </div>
        <EditEmployeeDialog employee={employee} />
      </div>

      <Card><CardHeader><CardTitle>Employment dates and PTO policy</CardTitle></CardHeader><CardContent><EmployeeSetupCard employeeId={employee.id}/></CardContent></Card>

      <EmployeeContactCard employee={employee} />
      <EmployeeFavoritesCard favorites={employee.favorites} />

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label htmlFor="history-start">History from</Label><Input id="history-start" type="date" value={range.start} max={range.end} onChange={e => { if (e.target.value && e.target.value <= range.end) setRange({ ...range, start: e.target.value }); }} /></div>
        <div className="space-y-1"><Label htmlFor="history-end">Through</Label><Input id="history-end" type="date" value={range.end} min={range.start} onChange={e => { if (e.target.value && e.target.value >= range.start) setRange({ ...range, end: e.target.value }); }} /></div>
      </div>

      <Card>
        <CardHeader><CardTitle>Days off and callouts</CardTitle></CardHeader>
        <CardContent>
          {daysOffError ? <p role="alert" className="text-sm text-destructive">Could not load days off. Please try again.</p> : daysOffLoading ? <p className="text-sm text-muted-foreground">Loading days off…</p> : daysOff?.length ? <div className="divide-y">
            {daysOff.map(day => <div key={day.id} className="py-3">
              <p className="text-sm font-medium">{formatDate(day.date_start)}{day.date_end !== day.date_start ? ` – ${formatDate(day.date_end)}` : ''}</p>
              <p className="text-sm text-muted-foreground">{({ scheduled_with_notice: 'Time off', unscheduled: 'Callout', office_closed: 'Office closed', medical_leave: 'Medical leave', other: 'Other' })[day.type]}{day.hours != null ? ` · ${day.hours} hours` : ''}</p>
              {day.notes && <p className="text-sm mt-1">{day.notes}</p>}
            </div>)}
          </div> : <p className="text-sm text-muted-foreground">No days off in this date range.</p>}
        </CardContent>
      </Card>

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

      <EmployeeTimeHistory
        key={employee.id + ':' + range.start + ':' + range.end}
        employeeId={employee.id}
        employeeName={formatEmployeeName(employee.display_name)}
        attendance={attendance || []}
        entries={entries || []}
        entriesLoading={entriesLoading}
        entriesError={entriesError}
      />

      <AccountabilityHistory employeeId={employeeId} />
    </div>
  );
}
