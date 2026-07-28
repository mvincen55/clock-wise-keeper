/**
 * Incident Reports — the office injury and exposure log.
 *
 * Anyone on the team can file one; an employee's report always saves to
 * their own record, while owners and managers file for anyone. What the
 * list shows is decided by RLS, not by this page: employees see their own
 * reports, owners and managers see the whole office.
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus, ShieldAlert } from 'lucide-react';
import IncidentReportModal from '@/components/IncidentReportModal';
import IncidentReportDetail from '@/components/IncidentReportDetail';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import {
  useIncidentReports,
  type IncidentReport,
  type IncidentReportWithEmployee,
} from '@/hooks/useIncidentReports';
import { formatDate } from '@/lib/time-utils';
import {
  CATEGORY_LABELS,
  INCIDENT_CATEGORIES,
  SEVERITY_CLASSES,
  SEVERITY_LABELS,
  STATUSES,
  STATUS_CLASSES,
  STATUS_LABELS,
  formatClockTime,
  labelFor,
  type IncidentSeverity,
  type IncidentStatus,
} from '@/lib/incidents';

const ALL = 'all';

export default function IncidentReports() {
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const { data: reports, isLoading } = useIncidentReports();
  // Only owners and managers can read the roster; employees file for
  // themselves and never need the picker.
  const { data: employees } = useOrgEmployees();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IncidentReport | null>(null);
  const [selected, setSelected] = useState<IncidentReportWithEmployee | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>(ALL);
  const [categoryFilter, setCategoryFilter] = useState<string>(ALL);
  const [employeeFilter, setEmployeeFilter] = useState<string>(ALL);

  const roster = useMemo(
    () => (employees || []).map(e => ({ id: e.id, display_name: e.display_name })),
    [employees]
  );

  const visible = useMemo(() => {
    return (reports || []).filter(r => {
      if (statusFilter !== ALL && r.status !== statusFilter) return false;
      if (categoryFilter !== ALL && r.category !== categoryFilter) return false;
      if (employeeFilter !== ALL && r.employee_id !== employeeFilter) return false;
      return true;
    });
  }, [reports, statusFilter, categoryFilter, employeeFilter]);

  const openCount = (reports || []).filter(r => r.status !== 'closed').length;

  const nameFor = (report: IncidentReportWithEmployee | IncidentReport): string => {
    const embedded = (report as IncidentReportWithEmployee).employee?.display_name;
    if (embedded) return embedded;
    if (report.employee_id === ctx?.employee_id) return 'You';
    return roster.find(e => e.id === report.employee_id)?.display_name || 'Team member';
  };

  const startNew = () => {
    setEditing(null);
    setFormOpen(true);
  };

  const startEdit = (report: IncidentReport) => {
    setSelected(null);
    setEditing(report);
    setFormOpen(true);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Incident Reports</h1>
          <p className="text-muted-foreground">
            {isManager
              ? 'Injuries, exposures, and safety events across the office. Each report files to the employee it happened to.'
              : 'Injuries, exposures, and safety events. Your reports save to your record — your managers and owners can read them.'}
          </p>
        </div>
        <Button onClick={startNew}>
          <Plus className="mr-2 h-4 w-4" /> New Report
        </Button>
      </div>

      {isManager && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Card className="card-elevated">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">{reports?.length ?? 0}</p>
              <p className="text-xs text-muted-foreground">Total</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-warning">{openCount}</p>
              <p className="text-xs text-muted-foreground">Needs review</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-destructive">
                {(reports || []).filter(r => r.category === 'sharps_injury').length}
              </p>
              <p className="text-xs text-muted-foreground">Sharps</p>
            </CardContent>
          </Card>
          <Card className="card-elevated">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold">
                {(reports || []).filter(r => r.follow_up_required).length}
              </p>
              <p className="text-xs text-muted-foreground">Follow-up open</p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card className="card-elevated">
        <CardHeader className="border-b">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5" />
              {isManager ? 'All Reports' : 'My Reports'}
            </CardTitle>
            <div className="flex flex-wrap gap-2">
              {isManager && roster.length > 0 && (
                <Select value={employeeFilter} onValueChange={setEmployeeFilter}>
                  <SelectTrigger className="h-9 w-[170px]">
                    <SelectValue placeholder="Everyone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>Everyone</SelectItem>
                    {roster.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.display_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className="h-9 w-[190px]">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {INCIDENT_CATEGORIES.map(c => (
                    <SelectItem key={c} value={c}>{CATEGORY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="h-9 w-[140px]">
                  <SelectValue placeholder="Any status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Any status</SelectItem>
                  {STATUSES.map(s => (
                    <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : !visible.length ? (
            <div className="py-12 text-center text-muted-foreground">
              <p>{reports?.length ? 'No reports match these filters.' : 'No incident reports filed.'}</p>
              {!reports?.length && (
                <Button variant="outline" className="mt-4" onClick={startNew}>
                  File the first one
                </Button>
              )}
            </div>
          ) : (
            <div className="divide-y">
              {visible.map(report => {
                const time = formatClockTime(report.incident_time);
                return (
                  <button
                    key={report.id}
                    onClick={() => setSelected(report)}
                    className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium">{nameFor(report)}</span>
                        <span className="text-xs text-muted-foreground">
                          {formatDate(report.incident_date)}
                          {time ? ` · ${time}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
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
                    <p className="mt-1 text-sm text-muted-foreground">
                      <span className="text-foreground">
                        {labelFor(CATEGORY_LABELS, report.category)}
                      </span>
                      {report.location ? ` · ${report.location}` : ''} — {report.description}
                    </p>
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <IncidentReportModal
        open={formOpen}
        report={editing}
        employees={roster}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
      />

      <IncidentReportDetail
        report={selected}
        employeeName={selected ? nameFor(selected) : ''}
        onClose={() => setSelected(null)}
        onEdit={startEdit}
      />
    </div>
  );
}
