import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock, CalendarDays, Plus, ShieldAlert, Loader2 } from 'lucide-react';
import ManagementShell from '@/components/management/ManagementShell';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useEmployeeDetail, useEmployeeTimeEntries } from '@/hooks/useEmployees';
import { useEmployeeDaysOff } from '@/hooks/useEmployeeSchedules';
import { useResolvedEmployeeAttendance } from '@/hooks/useAttendanceFallback';
import { useEmployeeIncidentReports, type IncidentReport } from '@/hooks/useIncidentReports';
import { useOrgBypasses } from '@/hooks/useChecklistBypasses';
import { useTrainingAssignments, useTrainingModules } from '@/hooks/useTraining';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useManagerFollowups } from '@/hooks/useManagerFollowups';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import EditEmployeeDialog from '@/components/team/EditEmployeeDialog';
import EmployeeSetupCard from '@/components/team/EmployeeSetupCard';
import EmployeeContactCard from '@/components/team/EmployeeContactCard';
import EmployeeFavoritesCard from '@/components/team/EmployeeFavoritesCard';
import MemberProfileRow from '@/components/team/MemberProfileRow';
import WorkedHourAdjustments from '@/components/team/WorkedHourAdjustments';
import ScheduleTab from '@/components/team/ScheduleTab';
import AccountabilityHistory from '@/components/accountability/AccountabilityHistory';
import IncidentReportModal from '@/components/IncidentReportModal';
import IncidentReportDetail from '@/components/IncidentReportDetail';
import { formatEmployeeNameLastFirst } from '@/lib/employee-name';
import { formatDate, formatTime, formatClock, minutesToHHMM, getToday, shiftDate } from '@/lib/time-utils';
import { CATEGORY_LABELS, SEVERITY_CLASSES, SEVERITY_LABELS, STATUS_CLASSES, STATUS_LABELS, formatClockTime, labelFor, type IncidentSeverity, type IncidentStatus } from '@/lib/incidents';

/**
 * The person record (design §7.4): a stable header, an at-a-glance strip,
 * then five sections — Overview · Time · Record · Development · Profile —
 * as in-page blocks with a jump strip. The schedule editor, the day-off and
 * punch history, and the setup card stay canonical here; nothing on this
 * page decides anything that Attention decides.
 */
const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'time', label: 'Time' },
  { id: 'record', label: 'Record' },
  { id: 'development', label: 'Development' },
  { id: 'profile', label: 'Profile' },
] as const;

const statusBadge: Record<string, { label: string; className: string }> = {
  ok: { label: 'Arrived', className: 'bg-success/20 text-success' },
  remote_ok: { label: 'Remote', className: 'bg-accent/20 text-accent' },
  late: { label: 'Late', className: 'bg-warning/20 text-warning' },
  absent: { label: 'Absent', className: 'bg-destructive/20 text-destructive' },
  incomplete: { label: 'Incomplete', className: 'bg-warning/20 text-warning' },
  closure: { label: 'Closed', className: 'bg-muted text-muted-foreground' },
  day_off: { label: 'Day Off', className: 'bg-primary/20 text-primary' },
  unscheduled: { label: 'No Schedule', className: 'bg-muted text-muted-foreground' },
  timezone_suspect: { label: 'TZ Issue', className: 'bg-destructive/20 text-destructive' },
};

const DAY_OFF_LABELS: Record<string, string> = {
  scheduled_with_notice: 'Time off', unscheduled: 'Callout', office_closed: 'Office closed', medical_leave: 'Medical leave', other: 'Other',
};

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function PersonRecord() {
  const { employeeId } = useParams<{ employeeId: string }>();
  const { data: ctx } = useOrgContext();
  const { data: employee, isLoading: empLoading } = useEmployeeDetail(employeeId);
  const [range, setRange] = useState(() => ({ start: shiftDate(getToday(), -29), end: getToday() }));
  const { data: daysOff, isLoading: daysOffLoading, error: daysOffError } = useEmployeeDaysOff(employeeId, range.start, range.end);
  const { rows: attendance, isLoading: attLoading } = useResolvedEmployeeAttendance(employeeId, range);
  const { data: entries } = useEmployeeTimeEntries(employeeId, range);
  const { data: incidents } = useEmployeeIncidentReports(employeeId);
  const { data: bypasses } = useOrgBypasses(ctx?.org_id);
  const { data: training } = useTrainingAssignments();
  const { data: modules } = useTrainingModules();
  const { data: followups } = useManagerFollowups();
  const attention = useAttentionItems();

  const [incidentFormOpen, setIncidentFormOpen] = useState(false);
  const [editingIncident, setEditingIncident] = useState<IncidentReport | null>(null);
  const [selectedIncident, setSelectedIncident] = useState<IncidentReport | null>(null);

  const openItems = useMemo(() => attention.unresolved.filter(i => i.subject.employeeId === employeeId), [attention.unresolved, employeeId]);
  const notes = useMemo(() => {
    const keys = new Set(openItems.map(i => i.key));
    return (followups ?? []).filter(f => keys.has(f.item_key) && f.note);
  }, [followups, openItems]);

  if (empLoading || attLoading) {
    return (
      <ManagementShell room="people">
        <div className="flex min-h-[40vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
      </ManagementShell>
    );
  }
  if (!employee) {
    return (
      <ManagementShell room="people">
        <div className="p-8 text-center text-muted-foreground">
          <p>This person was not found.</p>
          <Button asChild variant="outline" className="mt-4"><Link to="/management/people?view=everyone">Back to People</Link></Button>
        </div>
      </ManagementShell>
    );
  }

  const name = formatEmployeeNameLastFirst(employee.display_name);
  const stats = (attendance || []).reduce(
    (acc, row) => {
      if (row.is_absent) acc.absent++;
      else if (row.is_late) acc.late++;
      else if (row.has_punches) acc.present++;
      return acc;
    },
    { present: 0, late: 0, absent: 0 },
  );
  const minutesInRange = (entries ?? []).reduce((n, e) => n + (e.total_minutes || 0), 0);
  const personBypasses = (bypasses ?? []).filter(b => b.employee_id === employee.id);
  const myTraining = (training ?? []).filter(t => employee.user_id && t.assigned_to === employee.user_id);
  const moduleTitle = (id: string) => modules?.find(m => m.id === id)?.title ?? 'Module';
  const needsNow = openItems.filter(i => i.work === 'needs_action' && !i.parkedUntil && !i.snoozedUntil);
  const glance = openItems.length === 0
    ? 'Nothing open'
    : `${openItems.length} open${needsNow.length !== openItems.length ? ` · ${openItems.length - needsNow.length} waiting or parked` : ''}`;

  return (
    <ManagementShell room="people">
      <div className="space-y-8">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="icon" aria-label="Back to People"><Link to="/management/people?view=everyone"><ArrowLeft className="h-4 w-4" /></Link></Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl md:text-3xl font-bold">{name}</h1>
            <p className="text-muted-foreground">{employee.email || 'No email'}{employee.tag ? ` · code ${employee.tag}` : ''}{employee.team ? ` · ${employee.team}` : ''}</p>
          </div>
          <EditEmployeeDialog employee={employee} />
        </div>

        <dl className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Last 30 days</dt><dd className="text-sm font-medium">{stats.present} present · {stats.late} late · {stats.absent} absent</dd></div>
          <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Hours in range</dt><dd className="text-sm font-medium">{minutesToHHMM(minutesInRange)}</dd></div>
          <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Open items</dt><dd className="text-sm font-medium">{glance}</dd></div>
          <div className="rounded-lg border p-3"><dt className="text-xs text-muted-foreground">Employment start</dt><dd className="text-sm font-medium">{employee.real_hire_date ? formatDate(employee.real_hire_date) : employee.hire_date ? formatDate(employee.hire_date) : 'not set'}</dd></div>
        </dl>

        <nav aria-label="Sections" className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 border-b bg-background/95 px-1 py-2 backdrop-blur">
          {SECTIONS.map(s => <a key={s.id} href={`#${s.id}`} className="min-h-9 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{s.label}</a>)}
        </nav>

        <Section id="overview" title="Overview">
          {openItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing open for {employee.preferred_name || employee.display_name}.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {openItems.map(i => (
                <li key={i.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                  <span>
                    <span className="font-medium">{i.label}</span>
                    <span className="text-muted-foreground">
                      {i.work === 'waiting_on_employee' ? ' · waiting on their answer' : i.work === 'followed_up' ? ' · followed up' : ''}
                      {i.parkedUntil ? ` · parked until ${formatDate(i.parkedUntil)}` : ''}
                      {i.deadline ? ` · still due ${i.deadline.label}` : ''}
                      {i.payroll ? ' · payroll' : ''}
                    </span>
                  </span>
                  <Button asChild size="sm" variant="outline"><Link to={`/management?item=${i.key}`}>{i.verb === 'decide' ? 'Review' : 'Open'}</Link></Button>
                </li>
              ))}
            </ul>
          )}
          {notes.length > 0 && (
            <div className="space-y-1">
              <h3 className="text-sm font-medium">Manager notes</h3>
              {notes.map(n => <p key={n.item_key} className="text-sm text-muted-foreground">{formatDate(n.updated_at)} · {n.note}</p>)}
            </div>
          )}
        </Section>

        <Section id="time" title="Time">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1"><Label htmlFor="history-start">History from</Label><Input id="history-start" type="date" value={range.start} max={range.end} onChange={e => { if (e.target.value && e.target.value <= range.end) setRange({ ...range, start: e.target.value }); }} /></div>
            <div className="space-y-1"><Label htmlFor="history-end">Through</Label><Input id="history-end" type="date" value={range.end} min={range.start} onChange={e => { if (e.target.value && e.target.value >= range.start) setRange({ ...range, end: e.target.value }); }} /></div>
            <Button asChild variant="outline" size="sm"><Link to={`/management/attendance?employee=${employee.id}`}>Edit punches and days off in Team Attendance</Link></Button>
          </div>

          <Card className="card-elevated">
            <CardHeader className="border-b"><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Attendance</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!attendance?.length ? <p className="py-8 text-center text-muted-foreground">No attendance data in this range.</p> : (
                <div className="divide-y">
                  {attendance.map((row: { id: string; entry_date: string; status_code: string; schedule_expected_start?: string | null; minutes_late?: number | null }) => {
                    const sb = statusBadge[row.status_code] || statusBadge.ok;
                    return (
                      <div key={row.id} className="flex items-center justify-between px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="w-24 text-sm font-medium">{formatDate(row.entry_date)}</span>
                          <span className={`rounded px-2 py-0.5 text-xs font-medium ${sb.className}`}>{sb.label}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                          {row.schedule_expected_start && <span>Sched: {formatClock(String(row.schedule_expected_start))}</span>}
                          {row.minutes_late != null && row.minutes_late > 0 && <span className="font-semibold text-warning">+{row.minutes_late}min</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="card-elevated">
            <CardHeader className="border-b"><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5" />Clock-ins and clock-outs</CardTitle></CardHeader>
            <CardContent className="p-0">
              {!entries?.length ? <p className="py-8 text-center text-muted-foreground">No time entries in this range.</p> : (
                <div className="divide-y">
                  {entries.map(entry => (
                    <div key={entry.id} className="px-4 py-3">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-sm font-medium">{formatDate(entry.entry_date)}</span>
                        <span className="time-display text-sm font-semibold">{minutesToHHMM(entry.total_minutes || 0)}</span>
                      </div>
                      {entry.punches && entry.punches.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {[...entry.punches].filter(p => !p.voided_at).sort((a, b) => a.seq - b.seq).map(p => (
                            <span key={p.id} className={`rounded px-1.5 py-0.5 text-xs ${p.punch_type === 'in' ? 'bg-success/20 text-success' : 'bg-destructive/20 text-destructive'}`}>{p.punch_type} {formatTime(p.punch_time)}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Days off and callouts</CardTitle></CardHeader>
            <CardContent>
              {daysOffError ? <p role="alert" className="text-sm text-destructive">Could not load days off. Please try again.</p> : daysOffLoading ? <p className="text-sm text-muted-foreground">Loading days off…</p> : daysOff?.length ? (
                <div className="divide-y">
                  {daysOff.map(day => (
                    <div key={day.id} className="py-3">
                      <p className="text-sm font-medium">{formatDate(day.date_start)}{day.date_end !== day.date_start ? ` – ${formatDate(day.date_end)}` : ''}</p>
                      <p className="text-sm text-muted-foreground">{DAY_OFF_LABELS[day.type] ?? day.type}{day.hours != null ? ` · ${day.hours} hours` : ''}</p>
                      {day.notes && <p className="mt-1 text-sm">{day.notes}</p>}
                    </div>
                  ))}
                </div>
              ) : <p className="text-sm text-muted-foreground">No days off in this range.</p>}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Schedule</CardTitle></CardHeader>
            <CardContent><ScheduleTab employee={{ id: employee.id, display_name: employee.display_name, email: employee.email, user_id: employee.user_id, timezone: employee.timezone ?? 'America/New_York', tag: employee.tag, preferred_name: employee.preferred_name }} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Worked-hour adjustments</CardTitle></CardHeader>
            <CardContent><WorkedHourAdjustments employeeId={employee.id} /></CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Employment dates and PTO policy</CardTitle></CardHeader>
            <CardContent><EmployeeSetupCard employeeId={employee.id} /></CardContent>
          </Card>
        </Section>

        <Section id="record" title="Record">
          <AccountabilityHistory employeeId={employeeId} />

          <Card className="card-elevated">
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-5 w-5" />Incident reports</CardTitle>
                <Button variant="outline" size="sm" onClick={() => { setEditingIncident(null); setIncidentFormOpen(true); }}><Plus className="mr-2 h-4 w-4" /> File report</Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {!incidents?.length ? <p className="py-8 text-center text-muted-foreground">No incident reports.</p> : (
                <div className="divide-y">
                  {incidents.map(report => {
                    const time = formatClockTime(report.incident_time);
                    return (
                      <button key={report.id} onClick={() => setSelectedIncident(report)} className="w-full px-4 py-3 text-left transition-colors hover:bg-muted/50">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-sm font-medium">{labelFor(CATEGORY_LABELS, report.category)}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-muted-foreground">{formatDate(report.incident_date)}{time ? ` · ${time}` : ''}</span>
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${SEVERITY_CLASSES[report.severity as IncidentSeverity] ?? 'bg-muted text-muted-foreground'}`}>{labelFor(SEVERITY_LABELS, report.severity)}</span>
                            <span className={`rounded px-2 py-0.5 text-xs font-medium ${STATUS_CLASSES[report.status as IncidentStatus] ?? 'bg-muted text-muted-foreground'}`}>{labelFor(STATUS_LABELS, report.status)}</span>
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

          <Card>
            <CardHeader><CardTitle>Checklist bypasses</CardTitle></CardHeader>
            <CardContent>
              {personBypasses.length === 0 ? <p className="text-sm text-muted-foreground">No bypasses on record.</p> : (
                <div className="divide-y">
                  {personBypasses.slice(0, 12).map(b => (
                    <div key={b.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                      <span>{formatDate(b.checklist_date)} · {b.incomplete_count} item{b.incomplete_count === 1 ? '' : 's'} open</span>
                      <span className="text-muted-foreground">{b.reason ? `“${b.reason}”` : b.resolved ? 'resolved' : 'reason owed'}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </Section>

        <Section id="development" title="Development">
          <Card>
            <CardHeader><CardTitle>Training</CardTitle></CardHeader>
            <CardContent>
              {!employee.user_id ? <p className="text-sm text-muted-foreground">Training is assigned to a login; this person has none yet.</p>
                : myTraining.length === 0 ? <p className="text-sm text-muted-foreground">No training assigned.</p> : (
                <div className="divide-y">
                  {myTraining.map(t => (
                    <div key={t.id} className="flex flex-wrap justify-between gap-2 py-2 text-sm">
                      <Link to={`/training?assignment=${t.id}`} className="font-medium hover:underline">{moduleTitle(t.module_id)}</Link>
                      <span className="text-muted-foreground">{t.status.replace(/_/g, ' ')}{t.due_date ? ` · due ${formatDate(t.due_date)}` : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          <p className="text-sm text-muted-foreground">Goals and the month's challenge live in <Link to="/goals" className="underline">Goals</Link>; this person's tally shows there.</p>
        </Section>

        <Section id="profile" title="Profile">
          <Card><CardContent className="p-4"><MemberProfileRow employee={{ id: employee.id, user_id: employee.user_id, display_name: employee.display_name, preferred_name: employee.preferred_name, tag: employee.tag, favorites: employee.favorites as Record<string, string> | null }} /></CardContent></Card>
          <EmployeeContactCard employee={employee} />
          <EmployeeFavoritesCard favorites={employee.favorites} />
          <p className="text-sm text-muted-foreground">Permissions and operational roles are set for the office in <Link to="/management/office/settings#permissions" className="underline">Office settings</Link>.</p>
        </Section>

        <IncidentReportModal
          open={incidentFormOpen}
          report={editingIncident}
          defaultEmployeeId={employee.id}
          employees={[{ id: employee.id, display_name: employee.display_name }]}
          onClose={() => { setIncidentFormOpen(false); setEditingIncident(null); }}
        />
        <IncidentReportDetail
          report={selectedIncident}
          employeeName={name}
          onClose={() => setSelectedIncident(null)}
          onEdit={report => { setSelectedIncident(null); setEditingIncident(report); setIncidentFormOpen(true); }}
        />
      </div>
    </ManagementShell>
  );
}
