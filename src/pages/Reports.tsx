import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTimeEntries, TimeEntryRow, PunchRow } from '@/hooks/useTimeEntries';
import { useDaysOff } from '@/hooks/useDaysOff';
import { useTardies, TardyRow } from '@/hooks/useTardies';
import { useAttendanceExceptions } from '@/hooks/useAttendanceExceptions';
import { useAttendanceDayStatus } from '@/hooks/useAttendanceDayStatus';
import { useWorkedHourAdjustments, type WorkedHourAdjustmentRow } from '@/hooks/useWorkedHourAdjustments';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useOwnerUserIds } from '@/hooks/useOrgAttendanceSnapshot';
import { minutesToHHMM, formatTime, formatClock, formatDate, getToday } from '@/lib/time-utils';
import {
  adjustmentMinutes, computeWeeklyTotals, detectDayIssue, formatBreak, formatHoursMinutes, formatOtFlag,
  formatSignedHours, punchSegments, weekStartOf, type TimeStatus, type WeeklyTotalRow,
} from '@/lib/payroll-utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Printer, Download, MapPin, Hand, Clock, AlertTriangle, ChevronDown, ChevronRight, History } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import AccountabilityHistory from '@/components/accountability/AccountabilityHistory';
import { eventTypeLabel, buildAuditCsv, auditCodes, type AuditCodeMaps } from '@/lib/audit-export';
import { auditReason, describeAuditEvent, effectiveEventType } from '@/lib/audit-summary';
import { useOrgStaff } from '@/hooks/useStaffCodes';
import { staffCodeLabel } from '@/lib/staff-code';

type ReportType = 'weekly' | 'pay_period' | 'monthly' | 'pto' | 'tardy' | 'attendance_exceptions';

const exportTypeMap: Record<ReportType, string | null> = {
  weekly: 'timesheet',
  pay_period: 'timesheet',
  monthly: 'timesheet',
  pto: 'pto',
  tardy: 'exceptions',
  attendance_exceptions: 'exceptions',
};

type AuditEvent = {
  id: string;
  event_type: string;
  action_type: string | null;
  created_at: string;
  actor_id: string | null;
  user_id: string | null;
  employee_id: string | null;
  reason: string | null;
  before_json: any;
  after_json: any;
  event_details: any;
  related_date: string | null;
  related_entry_id: string | null;
};

function SourceBadge({ source }: { source: string }) {
  if (source === 'auto_location') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-accent text-accent font-medium">
        <MapPin className="h-2.5 w-2.5" /> GPS
      </Badge>
    );
  }
  if (source === 'import') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-muted-foreground/40 text-muted-foreground font-medium">
        <FileText className="h-2.5 w-2.5" /> Import
      </Badge>
    );
  }
  if (source === 'system_adjustment') {
    return (
      <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-warning text-warning font-medium">
        <Clock className="h-2.5 w-2.5" /> System
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] gap-1 px-1.5 py-0 border-muted-foreground/30 text-muted-foreground font-medium">
      <Hand className="h-2.5 w-2.5" /> Manual
    </Badge>
  );
}

/** The daily-row grid: Date | Punches | Total | Status | Notes. Header, rows, and footer share it. */
const DAY_ROW_GRID = 'grid grid-cols-[1fr_2fr_70px_auto_auto] md:grid-cols-[1.1fr_2.2fr_80px_120px_1fr]';

/**
 * Every clock-in and clock-out of the day as worked stretches, with the
 * lunch and break gaps between them. Payroll checks the whole day, not
 * just the first in and the last out.
 */
function DayPunchList({ punches }: { punches: PunchRow[] }) {
  const segments = punchSegments(punches);
  if (segments.length === 0) return <span className="text-muted-foreground">—</span>;
  return (
    <div className="space-y-1">
      {segments.map((seg, i) => (
        <div key={i}>
          {seg.break_minutes != null && seg.break_minutes > 0 && (
            <div className="text-[10px] text-muted-foreground font-sans pl-1">{formatBreak(seg.break_minutes)} break</div>
          )}
          <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {seg.in ? (
              <span className="inline-flex items-center gap-1"><span>{formatTime(seg.in.punch_time)}</span><SourceBadge source={seg.in.source} /></span>
            ) : (
              <span className="text-warning text-xs font-sans">no clock in</span>
            )}
            <span className="text-muted-foreground">–</span>
            {seg.out ? (
              <span className="inline-flex items-center gap-1"><span>{formatTime(seg.out.punch_time)}</span><SourceBadge source={seg.out.source} /></span>
            ) : (
              <span className="text-warning text-xs font-sans">no clock out</span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** "08:29 AM–12:01 PM; 12:31 PM–06:27 PM" for the CSV — every stretch of the day. */
function punchSequenceText(punches: PunchRow[]): string {
  return punchSegments(punches)
    .map(seg => `${seg.in ? formatTime(seg.in.punch_time) : 'no in'}–${seg.out ? formatTime(seg.out.punch_time) : 'no out'}`)
    .join('; ');
}

function PunchSourceList({ punches }: { punches: PunchRow[] }) {
  const sources = new Set(punches.map(p => p.source));
  return (
    <div className="flex flex-wrap gap-1">
      {Array.from(sources).map(s => <SourceBadge key={s} source={s} />)}
    </div>
  );
}

function AuditTrailRow({ event, codes }: { event: AuditEvent; codes: AuditCodeMaps }) {
  const ts = new Date(event.created_at);
  const timeStr = ts.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'America/New_York' });
  const dateStr = ts.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York' });
  const names = auditCodes(event, codes);
  const reason = auditReason(event);

  return (
    <div className="flex items-start gap-4 py-2.5 px-4 text-xs">
      {/* Timestamp */}
      <div className="shrink-0 w-[130px] text-muted-foreground">
        <div className="font-medium text-foreground/70">{dateStr}</div>
        <div>{timeStr}</div>
      </div>

      {/* What happened, in plain English, attributed by staff code */}
      <div className="flex-1 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge variant="outline" className="text-[10px] px-2 py-0.5 font-semibold">
            {eventTypeLabel(effectiveEventType(event))}
          </Badge>
          <span className="font-mono text-muted-foreground">{names.employee}</span>
        </div>
        <p className="text-[12px]">{describeAuditEvent(event, names)}</p>
        {reason && (
          <p className="text-muted-foreground mt-0.5">
            <span className="italic">"{reason}"</span>
          </p>
        )}
      </div>

      {/* Actor */}
      <div className="shrink-0 text-right text-muted-foreground min-w-[80px]">
        <span className="font-medium font-mono text-foreground/70">{names.actor || 'System'}</span>
      </div>
    </div>
  );
}

export default function Reports() {
  const { user } = useAuth();
  const { data: payrollSettings } = usePayrollSettings();

  const weekStartDay = payrollSettings?.week_start_day ?? 1;
  const nowDate = new Date();
  const dayOfWeek = nowDate.getDay();
  const daysBack = (dayOfWeek - weekStartDay + 7) % 7;
  const currentPeriodStart = new Date(nowDate);
  currentPeriodStart.setDate(nowDate.getDate() - daysBack);
  const priorStart = new Date(currentPeriodStart);
  priorStart.setDate(currentPeriodStart.getDate() - 7);
  const priorEnd = new Date(priorStart);
  priorEnd.setDate(priorStart.getDate() + 6);

  const [reportType, setReportType] = useState<ReportType>('weekly');
  const [startDate, setStartDate] = useState(priorStart.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(priorEnd.toISOString().split('T')[0]);
  const [generated, setGenerated] = useState(false);
  const [showAuditTrail, setShowAuditTrail] = useState(false);
  const [showLateFlags, setShowLateFlags] = useState(true);
  
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [expandedAudit, setExpandedAudit] = useState<Set<string>>(new Set());

  // Reports is org-wide for admins (RLS still limits employees to their own).
  const { data: entries } = useTimeEntries(startDate || undefined, endDate || undefined, 'all');
  const { data: daysOff } = useDaysOff();
  const { data: tardies } = useTardies(startDate || undefined, endDate || undefined);
  const { data: exceptions } = useAttendanceExceptions(startDate || undefined, endDate || undefined);
  const { data: dayStatus } = useAttendanceDayStatus(startDate || undefined, endDate || undefined);
  // Worked-hour offsets ("Offset hours" on the Team page) dated in the
  // range. They are paid in the week they are dated, so they print with
  // the punches and count in every total below.
  const { data: adjustments } = useWorkedHourAdjustments(startDate || undefined, endDate || undefined);
  const adjustmentRows: WorkedHourAdjustmentRow[] = adjustments || [];
  const { data: orgEmployees } = useOrgEmployees();
  const { data: ownerUserIds } = useOwnerUserIds();
  // Canonical staff codes (employees.tag): everything printed here is
  // attributed by code, never by a person's name.
  const { data: orgStaff } = useOrgStaff();
  const codeByEmployee = new Map<string, string>();
  const codeByUser = new Map<string, string>();
  (orgStaff || []).forEach(m => {
    if (m.code) codeByEmployee.set(m.employeeId, m.code);
    if (m.code && m.userId) codeByUser.set(m.userId, m.code);
  });
  const staffCodes: AuditCodeMaps = { byEmployee: codeByEmployee, byUser: codeByUser };

  // Recorded minutes from punches, the signed adjustment minutes, and the
  // payroll total that combines them.
  const totalMinutes = entries?.reduce((sum, e) => sum + (e.total_minutes || 0), 0) || 0;
  const adjustmentTotalMinutes = adjustmentRows.reduce((sum, a) => sum + adjustmentMinutes(a.hours_delta), 0);
  const payrollMinutes = totalMinutes + adjustmentTotalMinutes;
  const tardyMap = new Map<string, TardyRow>();
  (tardies || []).forEach(t => tardyMap.set(t.entry_date, t));

  const activeTardies = (tardies || []).filter(t => !t.resolved);
  const trackedTardies = activeTardies.filter(t => t.approval_status !== 'approved');
  const totalMinutesLate = activeTardies.reduce((s, t) => s + t.minutes_late, 0);
  const totalDays = entries?.length || 0;
  const editedDays = entries?.filter(e => e.punches.some(p => p.is_edited)).length || 0;

  // ---- The payroll dimension: one week definition, per-employee ----
  const employeeName = (id: string | null | undefined) =>
    id ? staffCodeLabel(codeByEmployee.get(id)) : 'Unassigned';
  const today = getToday();

  // OT flags: per employee per payroll week from server-computed totals
  // (voided punches never count). 2400 minutes = 40 hours.
  const weeklyTotals: WeeklyTotalRow[] = computeWeeklyTotals(entries || [], weekStartDay, adjustmentRows);
  const weeklyByKey = new Map(weeklyTotals.map(w => [`${w.employee_id}|${w.week_start}`, w]));
  const weeklyFor = (e: TimeEntryRow): WeeklyTotalRow | undefined =>
    e.employee_id ? weeklyByKey.get(`${e.employee_id}|${weekStartOf(e.entry_date, weekStartDay)}`) : undefined;

  // Missing-time flags. Missing days come from attendance_day_status —
  // the same schedule resolution the recompute engine maintains — so a
  // day only counts as missing when it was scheduled with no punches,
  // no day-off coverage, and no office closure. Owners never clock, so
  // their rows are excluded. Unpaired sequences and pairing anomalies
  // come from the entries' live punches.
  const dayIssueByEntry = new Map<string, Exclude<TimeStatus, 'OK' | 'MISSING DAY'>>();
  for (const e of entries || []) {
    const issue = detectDayIssue(e.punches, e.total_minutes, e.entry_date, today);
    if (issue) dayIssueByEntry.set(e.id, issue);
  }
  const missingDays = (dayStatus || []).filter(r =>
    r.is_absent && r.entry_date < today && !(r.user_id && ownerUserIds?.has(r.user_id)),
  );
  type TimeFlag = { employeeLabel: string; date: string; kind: TimeStatus };
  const timeFlags: TimeFlag[] = [
    ...missingDays.map(r => ({
      employeeLabel: employeeName(r.employee_id),
      date: r.entry_date,
      kind: 'MISSING DAY' as TimeStatus,
    })),
    ...(entries || [])
      .filter(e => dayIssueByEntry.has(e.id))
      .map(e => ({
        employeeLabel: employeeName(e.employee_id),
        date: e.entry_date,
        kind: dayIssueByEntry.get(e.id)! as TimeStatus,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date) || a.employeeLabel.localeCompare(b.employeeLabel));
  const flaggedEmployeeCount = new Set(timeFlags.map(f => f.employeeLabel)).size;

  const timeStatusFor = (e: TimeEntryRow): TimeStatus => dayIssueByEntry.get(e.id) ?? 'OK';

  // Daily rows grouped by employee so the org-wide report reads per
  // person instead of as undifferentiated dates. Hour adjustments sit in
  // date order among the days they belong with, and the group total is
  // the payroll figure: punched minutes plus the adjustments.
  type DayItem =
    | { kind: 'entry'; date: string; entry: TimeEntryRow }
    | { kind: 'adjustment'; date: string; adjustment: WorkedHourAdjustmentRow };
  const groupedEntries = (() => {
    const groups = new Map<string, { label: string; items: DayItem[]; minutes: number }>();
    const groupFor = (employeeId: string | null) => {
      const key = employeeId ?? 'unassigned';
      let g = groups.get(key);
      if (!g) {
        g = { label: employeeName(employeeId), items: [], minutes: 0 };
        groups.set(key, g);
      }
      return g;
    };
    for (const e of entries || []) {
      const g = groupFor(e.employee_id);
      g.items.push({ kind: 'entry', date: e.entry_date, entry: e });
      g.minutes += e.total_minutes || 0;
    }
    for (const a of adjustmentRows) {
      const g = groupFor(a.employee_id);
      g.items.push({ kind: 'adjustment', date: a.entry_date, adjustment: a });
      g.minutes += adjustmentMinutes(a.hours_delta);
    }
    for (const g of groups.values()) g.items.sort((a, b) => b.date.localeCompare(a.date));
    return [...groups.values()].sort((a, b) => a.label.localeCompare(b.label));
  })();

  // Fetch audit events and resolve actor names
  useEffect(() => {
    if (!generated || !showAuditTrail || !user) return;
    (async () => {
      const { data } = await supabase
        .from('audit_events')
        .select('*')
        .gte('related_date', startDate)
        .lte('related_date', endDate)
        .order('created_at', { ascending: false })
        .limit(500);
      setAuditEvents((data as AuditEvent[]) || []);
    })();
  }, [generated, showAuditTrail, startDate, endDate, user]);

  const auditByEntry = new Map<string, AuditEvent[]>();
  auditEvents.forEach(e => {
    if (e.related_entry_id) {
      const arr = auditByEntry.get(e.related_entry_id) || [];
      arr.push(e);
      auditByEntry.set(e.related_entry_id, arr);
    }
  });
  const auditByDate = new Map<string, AuditEvent[]>();
  auditEvents.forEach(e => {
    if (e.related_date) {
      const arr = auditByDate.get(e.related_date) || [];
      arr.push(e);
      auditByDate.set(e.related_date, arr);
    }
  });

  const toggleAudit = (id: string) => {
    setExpandedAudit(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleGenerate = () => {
    if (startDate && endDate) setGenerated(true);
  };

  const handlePrint = () => window.print();

  const escapeCsv = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const handleDownloadCsv = (overrideType?: string) => {
    const isAudit = overrideType === 'audit';

    if (isAudit) {
      // Audit trail CSV — built from already-loaded auditEvents, one row per changed field
      downloadCsvBlob(buildAuditCsv(auditEvents, staffCodes), `audit_${startDate}_${endDate}.csv`);
      return;
    }

    // Timesheet CSV — built from already-loaded entries (same data shown
    // on screen). Weekly Total / OT Hours flag the payroll week; this
    // system does not compute overtime pay — it flags so the payroll
    // operator cannot miss it. MISSING DAY rows are appended after the
    // dailies so a day with no entry still reaches the CSV.
    const isTimesheet = ['weekly', 'pay_period', 'monthly'].includes(reportType);
    if (isTimesheet) {
      const header = ['Employee', 'Date', 'Punches', 'First In', 'First In Source', 'Last Out', 'Last Out Source', 'Total', 'Minutes Late', 'Status', 'Remote', 'Edited', 'Comment', 'Weekly Total', 'OT Hours', 'Time Status'];
      const sourceLabel = (s: string) => s === 'auto_location' ? 'GPS' : s === 'system_adjustment' ? 'System' : s === 'import' ? 'Import' : 'Manual';
      const weeklyAt = (employeeId: string | null, date: string) =>
        employeeId ? weeklyByKey.get(`${employeeId}|${weekStartOf(date, weekStartDay)}`) : undefined;
      // Days and hour adjustments share one list, per employee in date order.
      const csvItems: { label: string; date: string; cells: string[] }[] = (entries || []).map(e => {
        const firstIn = e.punches.find(p => p.punch_type === 'in');
        const lastOut = [...e.punches].reverse().find(p => p.punch_type === 'out');
        const tardy = tardyMap.get(e.entry_date);
        const hasEdits = e.punches.some(p => p.is_edited);
        const weekly = weeklyFor(e);
        return { label: employeeName(e.employee_id), date: e.entry_date, cells: [
          employeeName(e.employee_id),
          formatDate(e.entry_date),
          punchSequenceText(e.punches),
          firstIn ? formatTime(firstIn.punch_time) : '',
          firstIn ? sourceLabel(firstIn.source) : '',
          lastOut ? formatTime(lastOut.punch_time) : '',
          lastOut ? sourceLabel(lastOut.source) : '',
          e.total_minutes != null ? minutesToHHMM(e.total_minutes) : '',
          tardy && !tardy.resolved ? String(tardy.minutes_late) : '',
          tardy && !tardy.resolved ? `${tardy.minutes_late}m late` : '',
          e.is_remote ? 'Yes' : '',
          hasEdits ? 'Yes' : '',
          e.entry_comment || '',
          weekly ? minutesToHHMM(weekly.total_minutes) : '',
          weekly && weekly.ot_minutes > 0 ? formatHoursMinutes(weekly.ot_minutes) : '',
          timeStatusFor(e),
        ] };
      });
      for (const a of adjustmentRows) {
        const weekly = weeklyAt(a.employee_id, a.entry_date);
        csvItems.push({ label: employeeName(a.employee_id), date: a.entry_date, cells: [
          employeeName(a.employee_id),
          formatDate(a.entry_date),
          '', '', '', '', '',
          minutesToHHMM(adjustmentMinutes(a.hours_delta)),
          '',
          `Hours adjustment ${formatSignedHours(a.hours_delta)}`,
          '', '',
          a.reason,
          weekly ? minutesToHHMM(weekly.total_minutes) : '',
          weekly && weekly.ot_minutes > 0 ? formatHoursMinutes(weekly.ot_minutes) : '',
          'HOURS ADJUSTMENT',
        ] });
      }
      csvItems.sort((a, b) => a.label.localeCompare(b.label) || a.date.localeCompare(b.date));
      const rows = csvItems.map(item => item.cells.map(escapeCsv).join(','));
      const missingRows = missingDays.map(r => [
        employeeName(r.employee_id),
        formatDate(r.entry_date),
        '', '', '', '', '', '', '', '', '', '', '', '', '',
        'MISSING DAY',
      ].map(escapeCsv).join(','));
      const totalRow = ['Total', '', '', '', '', '', '', minutesToHHMM(payrollMinutes), '', '', '', '', '', '', '', ''].join(',');
      const csv = [header.join(','), ...rows, ...missingRows, totalRow].join('\n');
      downloadCsvBlob(csv, `timesheet_${startDate}_${endDate}.csv`);
      return;
    }

    // Tardy CSV
    if (reportType === 'tardy') {
      const header = ['Date', 'Expected Start', 'Actual Start', 'Minutes Late', 'Reason', 'Status'];
      const rows = activeTardies.map(t => [
        formatDate(t.entry_date),
        formatClock(t.expected_start_time, ''),
        formatTime(t.actual_start_time),
        String(t.minutes_late),
        t.reason_text || '',
        t.approval_status,
      ].map(escapeCsv).join(','));
      const csv = [header.join(','), ...rows].join('\n');
      downloadCsvBlob(csv, `tardy_${startDate}_${endDate}.csv`);
      return;
    }

    // PTO CSV
    if (reportType === 'pto') {
      const header = ['Start Date', 'End Date', 'Type', 'Notes'];
      const filtered = (daysOff || []).filter(d => d.date_start >= startDate && d.date_start <= endDate);
      const rows = filtered.map(d => [
        formatDate(d.date_start),
        d.date_start !== d.date_end ? formatDate(d.date_end) : '',
        d.type?.replace(/_/g, ' ') || '',
        d.notes || '',
      ].map(escapeCsv).join(','));
      const csv = [header.join(','), ...rows].join('\n');
      downloadCsvBlob(csv, `pto_${startDate}_${endDate}.csv`);
      return;
    }

    // Attendance exceptions CSV
    if (reportType === 'attendance_exceptions') {
      const header = ['Date', 'Type', 'Status', 'Reason', 'Resolution'];
      const rows = (exceptions || []).map(e => [
        formatDate(e.exception_date),
        e.type?.replace(/_/g, ' ') || '',
        e.status || '',
        e.reason_text || '',
        e.resolution_action?.replace(/_/g, ' ') || '',
      ].map(escapeCsv).join(','));
      const csv = [header.join(','), ...rows].join('\n');
      downloadCsvBlob(csv, `exceptions_${startDate}_${endDate}.csv`);
      return;
    }

    toast.error('Unknown report type');
  };

  const downloadCsvBlob = (csv: string, filename: string) => {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
  };

  // One worked-hour adjustment, printed where it is paid: among that
  // employee's days, with its signed hours in the Total column and the
  // reason where a day's comment would go.
  const renderAdjustmentRow = (a: WorkedHourAdjustmentRow) => (
    <div
      key={`adjustment-${a.id}`}
      className={`${DAY_ROW_GRID} items-center gap-2 px-4 py-3 border-b border-l-2 border-l-accent bg-accent/5`}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="font-medium text-sm">{formatDate(a.entry_date)}</span>
        <Badge variant="outline" className="text-[9px] px-1 py-0 border-accent text-accent">HOURS ADJUSTMENT</Badge>
      </div>
      <div className="text-xs text-muted-foreground">Counts toward the hours paid this week</div>
      <div className={`text-sm font-mono font-semibold ${a.hours_delta < 0 ? 'text-destructive' : ''}`}>
        {formatSignedHours(a.hours_delta)}
      </div>
      <div>
        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Adjustment</Badge>
      </div>
      <div className="text-xs text-muted-foreground min-w-0 whitespace-normal">{a.reason}</div>
    </div>
  );

  const renderTimesheetRow = (e: TimeEntryRow) => {
    const tardy = tardyMap.get(e.entry_date);
    const hasEdits = e.punches.some(p => p.is_edited);
    const entryAudit = auditByEntry.get(e.id) || [];
    const isExpanded = expandedAudit.has(e.id);

    return (
      <div key={e.id}>
        <div
          className={`${DAY_ROW_GRID} items-center gap-2 px-4 py-3 border-b hover:bg-muted/30 transition-colors ${hasEdits ? 'border-l-2 border-l-warning' : ''}`}
        >
          {/* Date */}
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{formatDate(e.entry_date)}</span>
            {hasEdits && (
              <Badge variant="outline" className="text-[9px] px-1 py-0 border-warning text-warning">
                EDITED
              </Badge>
            )}
          </div>

          {/* Every clock-in and clock-out, with lunch and breaks between */}
          <div className="text-sm font-mono">
            <DayPunchList punches={e.punches} />
          </div>

          {/* Total */}
          <div className="text-sm font-mono font-semibold">
            {e.total_minutes != null ? minutesToHHMM(e.total_minutes) : '—'}
          </div>

          {/* Late flag */}
          <div>
            {showLateFlags && tardy && !tardy.resolved && (
              <div className="flex items-center gap-1">
                <AlertTriangle className="h-3 w-3 text-destructive" />
                <span className="text-xs text-destructive font-medium">{tardy.minutes_late}m late</span>
              </div>
            )}
            {e.is_remote && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">Remote</Badge>
            )}
          </div>

          {/* Comment + Audit expand */}
          <div className="flex items-center gap-2 min-w-0">
            {e.entry_comment && (
              <span className="text-xs text-muted-foreground truncate max-w-[150px]" title={e.entry_comment}>
                {e.entry_comment}
              </span>
            )}
            {showAuditTrail && entryAudit.length > 0 && (
              <button
                onClick={() => toggleAudit(e.id)}
                className="flex items-center gap-1 text-xs text-accent hover:text-accent/80 shrink-0"
              >
                <History className="h-3 w-3" />
                {entryAudit.length}
                {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </button>
            )}
          </div>
        </div>

        {/* Expanded audit trail */}
        {showAuditTrail && isExpanded && entryAudit.length > 0 && (
          <div className="bg-muted/10 border-b space-y-1 py-2 px-2">
            {entryAudit.map(a => <AuditTrailRow key={a.id} event={a} codes={staffCodes} />)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      {/* Controls */}
      <div className="no-print">
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Reports</h1>
        <Button asChild variant="outline"><Link to="/report-history">Dentrix report history</Link></Button>
        <p className="text-muted-foreground text-sm mt-1">Generate, print, and export time reports</p>

        <Card className="mt-4">
          <CardContent className="p-5 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Report Type</Label>
                <Select value={reportType} onValueChange={v => { setReportType(v as ReportType); setGenerated(false); }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="weekly">Weekly Timesheet</SelectItem>
                    <SelectItem value="pay_period">Pay Period Summary</SelectItem>
                    <SelectItem value="monthly">Monthly Summary</SelectItem>
                    <SelectItem value="pto">PTO Summary</SelectItem>
                    <SelectItem value="tardy">Tardy Report</SelectItem>
                    <SelectItem value="attendance_exceptions">Attendance Exceptions</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Start Date</Label>
                <Input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setGenerated(false); }} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wider text-muted-foreground">End Date</Label>
                <Input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setGenerated(false); }} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-5 pt-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <Switch checked={showAuditTrail} onCheckedChange={setShowAuditTrail} />
                <span className="text-sm">Audit trail</span>
              </label>
              {reportType !== 'tardy' && reportType !== 'pto' && reportType !== 'attendance_exceptions' && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <Switch checked={showLateFlags} onCheckedChange={setShowLateFlags} />
                  <span className="text-sm">Late flags</span>
                </label>
              )}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={handleGenerate} disabled={!startDate || !endDate} size="sm">
                <FileText className="mr-2 h-4 w-4" />
                Generate
              </Button>
              <Button variant="outline" size="sm" onClick={() => handleDownloadCsv()} disabled={!startDate || !endDate}>
                <Download className="mr-2 h-4 w-4" />
                CSV
              </Button>
              {showAuditTrail && (
                <Button variant="outline" size="sm" onClick={() => handleDownloadCsv('audit')} disabled={!startDate || !endDate}>
                  <Download className="mr-2 h-3.5 w-3.5" />
                  Audit CSV
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Generated Report */}
      {generated && (
        <div className="space-y-4">
          {/* Missing-time banner: the manager cannot run payroll blind.
              Warns loudly, never blocks the report, never blocks a punch. */}
          {(reportType === 'weekly' || reportType === 'pay_period' || reportType === 'monthly') && timeFlags.length > 0 && (
            <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-4 space-y-2">
              <p className="font-bold text-destructive flex items-center gap-2">
                <AlertTriangle className="h-5 w-5" />
                {flaggedEmployeeCount} employee{flaggedEmployeeCount === 1 ? ' has' : 's have'} missing or incomplete time
              </p>
              <ul className="text-sm space-y-1">
                {timeFlags.map((f, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span className="font-medium">{f.employeeLabel}</span>
                    <span className="text-muted-foreground">{formatDate(f.date)}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                      f.kind === 'MISSING DAY' ? 'bg-destructive/20 text-destructive'
                      : f.kind === 'MISSING PUNCH' ? 'bg-warning/20 text-warning'
                      : 'bg-destructive/20 text-destructive'
                    }`}>{f.kind}</span>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted-foreground">
                Fix these from the{' '}
                <Link to="/management/attendance" className="underline font-medium">Team Attendance page</Link>
                {' '}before sending hours to payroll. The report stays available either way.
              </p>
            </div>
          )}

          <div className="no-print flex justify-end">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="mr-2 h-4 w-4" />
              Print
            </Button>
          </div>

          <Card>
            <CardHeader className="pb-3 border-b">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-lg font-bold tracking-tight">
                    {reportType === 'weekly' && 'Weekly Timesheet'}
                    {reportType === 'pay_period' && 'Pay Period Summary'}
                    {reportType === 'monthly' && 'Monthly Summary'}
                    {reportType === 'pto' && 'PTO Summary'}
                    {reportType === 'tardy' && 'Tardy Report'}
                    {reportType === 'attendance_exceptions' && 'Attendance Exceptions'}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    {formatDate(startDate)} — {formatDate(endDate)}
                  </p>
                </div>
                <p className="text-[10px] text-muted-foreground font-mono">
                  {new Date().toLocaleString()}
                </p>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {/* Timesheet reports */}
              {(reportType === 'weekly' || reportType === 'pay_period' || reportType === 'monthly') && (
                <>
                  {/* Summary strip */}
                  <div className="grid grid-cols-4 gap-0 border-b divide-x">
                    <div className="p-3 text-center">
                      <p className="text-xl font-bold font-mono">{minutesToHHMM(payrollMinutes)}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Hours</p>
                      {adjustmentRows.length > 0 && (
                        <p className="text-[10px] text-muted-foreground font-mono">
                          {minutesToHHMM(totalMinutes)} recorded {adjustmentTotalMinutes < 0 ? '−' : '+'} {minutesToHHMM(Math.abs(adjustmentTotalMinutes))} adjustments
                        </p>
                      )}
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xl font-bold">{totalDays}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Days Worked</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xl font-bold text-destructive">{activeTardies.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Late Days</p>
                    </div>
                    <div className="p-3 text-center">
                      <p className="text-xl font-bold text-warning">{editedDays}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Edited Days</p>
                    </div>
                  </div>

                  {/* Weekly totals + OT flags, per employee per payroll week */}
                  {weeklyTotals.length > 0 && (
                    <div className="border-b">
                      <div className="px-4 py-2 bg-muted/40 flex items-center gap-2">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Weekly Totals</h3>
                        <span
                          className="text-[10px] text-muted-foreground cursor-help"
                          title="This system does not compute overtime pay. It flags weeks over 40 hours so your payroll operator (Paychex or otherwise) cannot miss them."
                        >
                          ⓘ OT is flagged, never paid out here
                        </span>
                      </div>
                      <div className="divide-y">
                        {weeklyTotals.map(w => (
                          <div key={`${w.employee_id}|${w.week_start}`} className="grid grid-cols-[1.2fr_120px_80px_1fr] items-center gap-2 px-4 py-2 text-sm">
                            <span className="font-medium">{employeeName(w.employee_id)}</span>
                            <span className="text-muted-foreground text-xs">Week of {formatDate(w.week_start)}</span>
                            <span className="font-mono font-semibold">
                              {minutesToHHMM(w.total_minutes)}
                              {w.adjustment_minutes !== 0 && (
                                <span className="ml-1 text-[10px] font-sans font-normal text-muted-foreground" title={`${minutesToHHMM(w.worked_minutes)} recorded plus adjustments`}>
                                  incl. {formatSignedHours(w.adjustment_minutes / 60)} adj.
                                </span>
                              )}
                            </span>
                            <span>
                              {w.ot_minutes > 0 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-destructive/20 text-destructive font-bold">
                                  {formatOtFlag(w.ot_minutes)}
                                </span>
                              )}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Column headers */}
                  <div className={`${DAY_ROW_GRID} gap-2 px-4 py-2 bg-muted/50 border-b text-[10px] font-semibold uppercase tracking-wider text-muted-foreground`}>
                    <span>Date</span>
                    <span>Punches (in – out, with breaks)</span>
                    <span>Total</span>
                    <span>Status</span>
                    <span>Notes</span>
                  </div>

                  {/* Rows, grouped per employee */}
                  {groupedEntries.map(group => (
                    <div key={group.label}>
                      <div className="px-4 py-1.5 bg-muted/30 border-b text-xs font-semibold flex justify-between">
                        <span>{group.label}</span>
                        <span className="font-mono">{minutesToHHMM(group.minutes)}</span>
                      </div>
                      {group.items.map(item => item.kind === 'entry' ? renderTimesheetRow(item.entry) : renderAdjustmentRow(item.adjustment))}
                    </div>
                  ))}

                  {/* Footer */}
                  <div className={`${DAY_ROW_GRID} gap-2 px-4 py-3 bg-muted/30 border-t-2 font-bold text-sm`}>
                    <span className="text-right">Total</span>
                    <span></span>
                    <span className="font-mono">{minutesToHHMM(payrollMinutes)}</span>
                    <span></span>
                    <span></span>
                  </div>
                </>
              )}

              {/* Tardy report */}
              {reportType === 'tardy' && (
                <>
                  <div className="grid grid-cols-3 gap-0 border-b divide-x">
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-destructive">{activeTardies.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Late Days</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-warning">{trackedTardies.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tracked</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-destructive">{totalMinutesLate}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Min Late</p>
                    </div>
                  </div>

                  <div className="divide-y">
                    {activeTardies.map(t => (
                      <div key={t.id} className="grid grid-cols-[1.2fr_80px_100px_60px_1fr_80px] items-center gap-2 px-4 py-3 text-sm hover:bg-muted/30">
                        <span className="font-medium">{formatDate(t.entry_date)}</span>
                        <span className="font-mono text-muted-foreground">{formatClock(t.expected_start_time)}</span>
                        <span className="font-mono">{formatTime(t.actual_start_time)}</span>
                        <span className="font-bold text-destructive">{t.minutes_late}m</span>
                        <span className="text-xs text-muted-foreground truncate">{t.reason_text || '—'}</span>
                        <Badge
                          variant={t.approval_status === 'approved' ? 'default' : 'secondary'}
                          className="text-[10px] px-1.5 py-0 w-fit capitalize"
                        >
                          {t.approval_status}
                        </Badge>
                      </div>
                    ))}
                  </div>

                  <div className="px-4 py-3 bg-muted/30 border-t-2 flex justify-between font-bold text-sm">
                    <span>Total Late</span>
                    <span className="text-destructive">{totalMinutesLate} min</span>
                  </div>
                </>
              )}

              {/* PTO report */}
              {reportType === 'pto' && (
                <div className="divide-y">
                  {(daysOff || [])
                    .filter(d => d.date_start >= startDate && d.date_start <= endDate)
                    .map(d => (
                      <div key={d.id} className="px-4 py-3 flex justify-between items-center text-sm hover:bg-muted/30">
                        <span className="font-medium">
                          {formatDate(d.date_start)}
                          {d.date_start !== d.date_end ? ` — ${formatDate(d.date_end)}` : ''}
                        </span>
                        <Badge variant="secondary" className="capitalize text-xs">{d.type?.replace(/_/g, ' ')}</Badge>
                      </div>
                    ))}
                  {!(daysOff || []).filter(d => d.date_start >= startDate && d.date_start <= endDate).length && (
                    <p className="p-6 text-center text-muted-foreground text-sm">No time off in this period</p>
                  )}
                </div>
              )}

              {/* Attendance exceptions */}
              {reportType === 'attendance_exceptions' && (
                <>
                  <div className="grid grid-cols-3 gap-0 border-b divide-x">
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-warning">{(exceptions || []).filter(e => e.type === 'missing_shift').length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Missing Shifts</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-destructive">{activeTardies.length}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Tardies</p>
                    </div>
                    <div className="p-4 text-center">
                      <p className="text-2xl font-bold text-destructive">{totalMinutesLate}</p>
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total Min Late</p>
                    </div>
                  </div>

                  {(exceptions || []).filter(e => e.type === 'missing_shift').length > 0 && (
                    <div className="border-b">
                      <div className="px-4 py-2 bg-muted/40">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Missing Shifts</h3>
                      </div>
                      <div className="divide-y">
                        {(exceptions || []).filter(e => e.type === 'missing_shift').map(e => (
                          <div key={e.id} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm items-center hover:bg-muted/30">
                            <span className="font-medium">{formatDate(e.exception_date)}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 w-fit capitalize">{e.status}</Badge>
                            <span className="text-xs text-muted-foreground">{e.reason_text || '—'}</span>
                            <span className="text-xs capitalize">{e.resolution_action?.replace('_', ' ') || '—'}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activeTardies.length > 0 && (
                    <div>
                      <div className="px-4 py-2 bg-muted/40">
                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tardies</h3>
                      </div>
                      <div className="divide-y">
                        {activeTardies.map(t => (
                          <div key={t.id} className="grid grid-cols-4 gap-2 px-4 py-3 text-sm items-center hover:bg-muted/30">
                            <span className="font-medium">{formatDate(t.entry_date)}</span>
                            <span className="font-bold text-destructive">{t.minutes_late}m</span>
                            <span className="text-xs text-muted-foreground">{t.reason_text || '—'}</span>
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 w-fit capitalize">{t.approval_status}</Badge>
                          </div>
                        ))}
                      </div>
                      <div className="px-4 py-3 bg-muted/30 border-t-2 flex justify-between font-bold text-sm">
                        <span>Total Late</span>
                        <span className="text-destructive">{totalMinutesLate} min</span>
                      </div>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

          {/* Standalone audit trail section */}
          {showAuditTrail && auditEvents.length > 0 && (
            <Card>
              <CardHeader className="pb-2 border-b">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <History className="h-4 w-4 text-accent" />
                  Audit Trail ({auditEvents.length} events)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0 max-h-[400px] overflow-y-auto">
                <div className="divide-y">
                  {auditEvents.map(e => (
                    <div key={e.id}>
                      <AuditTrailRow event={e} codes={staffCodes} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          <div className="no-print">
            <AccountabilityHistory />
          </div>
        </div>
      )}
    </div>
  );
}
