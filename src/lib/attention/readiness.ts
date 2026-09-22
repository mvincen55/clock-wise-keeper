/**
 * Payroll readiness for one pay period — computed from the period's RECORDS,
 * never from what happens to be visible in Attention.
 *
 *  - ready:     every scheduled day in the period has time on record or an
 *               explanation, and nothing is pending inside the period.
 *  - not_ready: at least one unresolved record would make payroll questionable.
 *  - unknown:   a source the verdict depends on is loading, stale, failed,
 *               unauthorized, or partial. Never reads as ready.
 *
 * Readiness and export are separate: the caller may always prepare the
 * report; the unresolved issues print on it.
 *
 * Layer 2/3 state (asked the employee, parked, snoozed) never removes an
 * issue: it is carried on the issue as `waiting` so the row can say
 * "waiting on Priya · still unresolved for payroll".
 */
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { AttendanceExceptionRow } from '@/hooks/useAttendanceExceptions';
import type { CorrectionRequestRow } from '@/hooks/useCorrectionRequests';
import type { DayOffRow } from '@/hooks/useDaysOff';
import type { OfficeClosureRow } from '@/hooks/useOfficeClosures';
import type { PtoRequest } from '@/hooks/usePtoRequests';
import type { TimeEntryRow } from '@/hooks/useTimeEntries';
import { missingTimeConditions, type MissingTimeKind } from './missing-time';
import { correctionEntryDate } from './records';
import type { ManagerFollowup, SourceStatus } from './types';

export type ReadinessStatus = 'ready' | 'not_ready' | 'unknown';

export type ReadinessIssueKind = MissingTimeKind | 'correction_pending' | 'pto_pending';

export type ReadinessIssue = {
  /** Same key as the Attention item for the same record condition. */
  key: string;
  kind: ReadinessIssueKind;
  employeeId: string | null;
  name: string;
  date: string;
  label: string;
  href: string;
  /** Layer 2/3 carried for display; never changes membership. */
  waiting: { workState: ManagerFollowup['work_state']; requestedAt: string | null; dueAt: string | null } | null;
};

export type WorthALook = {
  key: string;
  kind: 'overtime' | 'adjustment';
  employeeId: string | null;
  name: string;
  label: string;
  detail: string;
};

export type ReadinessInput = {
  period: { start: string; end: string };
  today: string;
  nowMinutes: number;
  bufferMinutes: number;
  /** 0 = Sunday … 6 = Saturday; payroll_settings.week_start_day. */
  weekStartDay: number;
  employees: { id: string; user_id: string | null; display_name: string }[];
  /** Owners never clock; their rows are excluded from every verdict. */
  ownerUserIds: Set<string>;
  dayStatuses: AttendanceDayStatusRow[];
  entries: TimeEntryRow[];
  daysOff: DayOffRow[];
  closures: OfficeClosureRow[];
  exceptions: AttendanceExceptionRow[];
  corrections: CorrectionRequestRow[];
  ptoRequests: PtoRequest[];
  adjustments?: { id: string; employee_id: string; adjustment_date: string; hours_delta: number; reason: string | null }[];
  followups: ManagerFollowup[];
  sources: { attendance: SourceStatus; requests: SourceStatus };
  otWeekMinutes?: number;
};

export type ReadinessResult = {
  status: ReadinessStatus;
  issues: ReadinessIssue[];
  worthALook: WorthALook[];
  summary: { people: number; shifts: number; minutesRecorded: number; approvedPtoDays: number; closures: number };
  degraded: { name: string; status: SourceStatus }[];
};

const inPeriod = (date: string, p: { start: string; end: string }) => date >= p.start && date <= p.end;

/** Days from `weekStartDay` so a week bucket can be keyed. */
function weekKey(date: string, weekStartDay: number): string {
  const d = new Date(date + 'T12:00:00Z');
  const back = (d.getUTCDay() - weekStartDay + 7) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function deriveReadiness(input: ReadinessInput): ReadinessResult {
  const {
    period, today, nowMinutes, bufferMinutes, weekStartDay, employees, ownerUserIds, dayStatuses, entries, daysOff,
    closures, exceptions, corrections, ptoRequests, adjustments = [], followups, sources, otWeekMinutes = 2400,
  } = input;
  const nameOf = (employeeId: string | null, userId?: string | null) => {
    const e = employees.find(x => x.id === employeeId) || (userId ? employees.find(x => x.user_id === userId) : undefined);
    return e?.display_name ?? 'Team member';
  };
  const followupFor = (key: string) => followups.find(f => f.item_key === key) ?? null;
  const waitingOf = (key: string): ReadinessIssue['waiting'] => {
    const f = followupFor(key);
    if (!f) return null;
    if (f.work_state === 'needs_action' && !f.parked_until && !f.snoozed_until) return null;
    return { workState: f.work_state, requestedAt: f.requested_at, dueAt: f.due_at };
  };

  const degraded = (['attendance', 'requests'] as const)
    .filter(name => sources[name].state !== 'ok')
    .map(name => ({ name, status: sources[name] }));

  const closureDates = new Set(closures.map(c => c.closure_date));
  const entryByKey = new Map<string, TimeEntryRow>();
  entries.forEach(e => { if (e.employee_id) entryByKey.set(`${e.employee_id}|${e.entry_date}`, e); });
  const exceptionByKey = new Map<string, AttendanceExceptionRow>();
  exceptions.forEach(x => exceptionByKey.set(`${x.employee_id}|${x.exception_date}`, x));

  const issues: ReadinessIssue[] = [];
  const rows = dayStatuses.filter(r => inPeriod(r.entry_date, period) && !ownerUserIds.has(r.user_id));
  for (const row of rows) {
    const kinds = missingTimeConditions({
      row,
      entry: row.employee_id ? entryByKey.get(`${row.employee_id}|${row.entry_date}`) : null,
      daysOff: daysOff.filter(d => d.employee_id === row.employee_id),
      closed: closureDates.has(row.entry_date),
      exception: row.employee_id ? exceptionByKey.get(`${row.employee_id}|${row.entry_date}`) : null,
      today, nowMinutes, bufferMinutes,
    });
    for (const kind of kinds) {
      const key = `${kind}:${row.id}`;
      const label = {
        missing_day: 'Scheduled, no time recorded',
        missing_clock_out: 'No clock-out (open punch pair)',
        unpaired_punches: 'Punches do not pair',
        time_suspect: 'Time looks off (timezone)',
      }[kind];
      issues.push({
        key, kind, employeeId: row.employee_id, name: nameOf(row.employee_id, row.user_id), date: row.entry_date, label,
        href: `/management/attendance?employee=${row.employee_id ?? ''}&date=${row.entry_date}`,
        waiting: waitingOf(key),
      });
    }
  }
  for (const c of corrections) {
    if (c.status !== 'pending') continue;
    const date = correctionEntryDate(c);
    if (date && !inPeriod(date, period)) continue;
    const key = `correction_request:${c.id}`;
    issues.push({ key, kind: 'correction_pending', employeeId: c.employee_id, name: nameOf(c.employee_id), date: date ?? '', label: 'Correction request pending', href: `/management?item=${key}`, waiting: waitingOf(key) });
  }
  for (const p of ptoRequests) {
    if (p.status !== 'pending') continue;
    if (p.end_date < period.start || p.start_date > period.end) continue;
    const key = `pto_request:${p.id}`;
    issues.push({ key, kind: 'pto_pending', employeeId: p.employee_id ?? null, name: nameOf(p.employee_id ?? null, p.created_by), date: p.start_date, label: 'PTO request pending inside the period', href: `/management?item=${key}`, waiting: waitingOf(key) });
  }

  // Worth a look: never blocks. Overtime is flagged, never paid out here.
  const worthALook: WorthALook[] = [];
  const weekly = new Map<string, number>();
  for (const e of entries) {
    if (!e.employee_id || !inPeriod(e.entry_date, period)) continue;
    const k = `${e.employee_id}|${weekKey(e.entry_date, weekStartDay)}`;
    weekly.set(k, (weekly.get(k) ?? 0) + (e.total_minutes ?? 0));
  }
  for (const [k, minutes] of weekly) {
    if (minutes <= otWeekMinutes) continue;
    const [employeeId, week] = k.split('|');
    const over = minutes - otWeekMinutes;
    worthALook.push({ key: `overtime:${k}`, kind: 'overtime', employeeId, name: nameOf(employeeId), label: `week of ${week} · ${(minutes / 60).toFixed(1)}h`, detail: `${(over / 60).toFixed(1)}h over ${otWeekMinutes / 60} · flagged here, never paid out here` });
  }
  for (const a of adjustments) {
    if (!inPeriod(a.adjustment_date, period)) continue;
    worthALook.push({ key: `adjustment:${a.id}`, kind: 'adjustment', employeeId: a.employee_id, name: nameOf(a.employee_id), label: `${a.adjustment_date} · ${a.hours_delta > 0 ? '+' : ''}${a.hours_delta}h adjustment`, detail: a.reason ?? '' });
  }

  const people = new Set(rows.map(r => r.employee_id ?? r.user_id)).size;
  const shifts = rows.filter(r => r.has_punches).length;
  const minutesRecorded = entries.filter(e => inPeriod(e.entry_date, period)).reduce((n, e) => n + (e.total_minutes ?? 0), 0);
  const approvedPtoDays = daysOff.filter(d => d.type === 'scheduled_with_notice' && d.date_end >= period.start && d.date_start <= period.end).length;
  const periodClosures = closures.filter(c => inPeriod(c.closure_date, period)).length;

  const status: ReadinessStatus = degraded.length ? 'unknown' : issues.length ? 'not_ready' : 'ready';
  return { status, issues, worthALook, summary: { people, shifts, minutesRecorded, approvedPtoDays, closures: periodClosures }, degraded };
}
