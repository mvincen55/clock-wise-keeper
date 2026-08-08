import type { EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import type { PersonStatus, Tone } from './types';

/**
 * Staffing semantics, in one testable place.
 *
 * `attendance_day_status` is a DAY-SUMMARY record: `is_scheduled_day` means
 * "scheduled sometime today", and `is_absent` flips the moment a scheduled
 * person has no punches — at 7 AM before their shift as much as at 10 PM after
 * it. Those flags are correct for end-of-day review, but they are NOT a live
 * "who is on the floor right now" answer.
 *
 * This module derives the live questions the dashboards actually ask, from the
 * fields that can prove them:
 *  - the office phase (before open / open / after close / closed / no schedule),
 *    from each person's `schedule_expected_start` / `schedule_expected_end`;
 *  - "expected right now", from whether a person's own interval covers now;
 *  - "clocked in right now", from an open punch pair (`is_incomplete` is exactly
 *    "has punches with no closing clock-out");
 *  - "needs review", only for facts the day has already made true.
 *
 * When schedule times are missing, the phase is `unknown_hours` and callers
 * must not make live claims — they fall back to day-level language.
 */

export type OfficePhase =
  | 'closed_today'   // an office closure covers today
  | 'no_schedule'    // nobody (who clocks) is scheduled today
  | 'before_open'    // scheduled shifts exist, none has started
  | 'open'           // now is inside at least the outer shift envelope
  | 'after_close'    // every scheduled shift has ended
  | 'unknown_hours'; // scheduled people exist but shift times are missing

export type OfficeStatus = {
  phase: OfficePhase;
  /** Short state line, e.g. "Open", "Closed for the day". */
  headline: string;
  /** One supporting sentence, e.g. "Today's workday ended at 5:00 PM." */
  detail: string;
};

export type StaffingSummary = {
  office: OfficeStatus;
  /** People whose own shift interval covers this moment. Null off-hours. */
  expectedNow: number | null;
  /** People with an open punch pair right now. Null off-hours. */
  presentNow: number | null;
  /** Expected right now with no punches at all yet. Null off-hours. */
  missingNow: number | null;
  /** People scheduled at some point today (net of closures and days off). */
  scheduledToday: number;
  /** Live roster rows — only rendered during open / unknown phases. */
  rows: PersonStatus[];
  /**
   * Attendance facts the day has already made true and someone should look at:
   * no-punch scheduled days already past their end, unreviewed tardies, and
   * missing clock-outs after shift end. Zero means genuinely clear.
   */
  reviewCount: number;
  reviewDetail: string;
};

/** "HH:MM[:SS]" -> minutes from midnight, or null. */
export function parseClockMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** "HH:MM[:SS]" -> "h:MM AM/PM" for copy. */
export function formatClockLabel(t: string | null | undefined): string {
  const mins = parseClockMinutes(t);
  if (mins === null) return '';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const suffix = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function minutesOfDay(now: Date): number {
  return now.getHours() * 60 + now.getMinutes();
}

/** Rows that describe a real working day: scheduled, office open, not off. */
function workingRows(rows: EmployeeSnapshot[]): EmployeeSnapshot[] {
  return rows.filter(r => r.is_scheduled_day && !r.office_closed && !r.has_day_off);
}

/** Is this person's own scheduled interval covering this moment? */
export function isExpectedNow(row: EmployeeSnapshot, nowMinutes: number): boolean {
  if (!row.is_scheduled_day || row.office_closed || row.has_day_off) return false;
  const start = parseClockMinutes(row.schedule_expected_start);
  const end = parseClockMinutes(row.schedule_expected_end);
  if (start === null || end === null) return false;
  return nowMinutes >= start && nowMinutes <= end;
}

/** An open punch pair means clocked in at this moment. */
export function isClockedInNow(row: EmployeeSnapshot): boolean {
  return row.has_punches && row.is_incomplete;
}

export function officeStatus(rows: EmployeeSnapshot[], now: Date): OfficeStatus {
  const nowMin = minutesOfDay(now);
  if (rows.length > 0 && rows.some(r => r.office_closed)) {
    return {
      phase: 'closed_today',
      headline: 'Office closed today',
      detail: 'A closure covers today — no staffing is expected.',
    };
  }
  const working = workingRows(rows);
  if (working.length === 0) {
    return {
      phase: 'no_schedule',
      headline: 'No one scheduled today',
      detail: 'No shifts are on the schedule for today.',
    };
  }
  const starts = working
    .map(r => parseClockMinutes(r.schedule_expected_start))
    .filter((v): v is number => v !== null);
  const ends = working
    .map(r => parseClockMinutes(r.schedule_expected_end))
    .filter((v): v is number => v !== null);
  if (starts.length === 0 || ends.length === 0) {
    return {
      phase: 'unknown_hours',
      headline: 'Scheduled today',
      detail: 'Shift times are not set, so live staffing cannot be shown.',
    };
  }
  const open = Math.min(...starts);
  const close = Math.max(...ends);
  if (nowMin < open) {
    return {
      phase: 'before_open',
      headline: 'Not open yet',
      detail: `First shift starts at ${formatClockLabel(minutesToClock(open))}.`,
    };
  }
  if (nowMin > close) {
    return {
      phase: 'after_close',
      headline: 'Closed for the day',
      detail: `Today's workday ended at ${formatClockLabel(minutesToClock(close))}.`,
    };
  }
  return {
    phase: 'open',
    headline: 'Open',
    detail: `Workday runs until ${formatClockLabel(minutesToClock(close))}.`,
  };
}

function minutesToClock(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}

/**
 * One person's status line, aware of the time of day.
 * Nobody is "Out" merely because their shift has not started or has ended.
 */
export function personStatusAt(row: EmployeeSnapshot, now: Date): PersonStatus {
  const nowMin = minutesOfDay(now);
  const start = parseClockMinutes(row.schedule_expected_start);
  const end = parseClockMinutes(row.schedule_expected_end);
  const base = { id: row.employee_id, name: row.display_name };

  if (row.office_closed) return { ...base, status: 'Office closed', tone: 'calm' };
  if (row.has_day_off) return { ...base, status: 'Approved off', tone: 'calm' };
  if (!row.is_scheduled_day) {
    // Someone unscheduled who clocked in anyway is still genuinely here.
    if (isClockedInNow(row)) return { ...base, status: row.is_remote ? 'In — remote' : 'In', tone: 'steady' };
    return { ...base, status: 'Not scheduled', tone: 'calm' };
  }

  const shiftEnded = end !== null && nowMin > end;
  const shiftStarted = start !== null && nowMin >= start;

  if (isClockedInNow(row)) {
    if (shiftEnded) return { ...base, status: 'Still clocked in', tone: 'attention' };
    const label = row.is_remote ? 'In — remote' : 'In';
    return row.is_late
      ? { ...base, status: `${label} · late ${row.minutes_late}m`, tone: 'attention' }
      : { ...base, status: label, tone: 'steady' };
  }

  if (row.has_punches) {
    if (shiftEnded) {
      return row.is_late
        ? { ...base, status: `Done · was late ${row.minutes_late}m`, tone: 'calm' }
        : { ...base, status: 'Done for the day', tone: 'calm' };
    }
    return { ...base, status: 'Clocked out', tone: 'calm' };
  }

  // No punches at all today.
  if (shiftEnded) return { ...base, status: 'No punch today', tone: 'attention' };
  if (shiftStarted) return { ...base, status: 'Not in yet', tone: 'attention' };
  if (start !== null) return { ...base, status: `Starts ${formatClockLabel(row.schedule_expected_start)}`, tone: 'calm' };
  return { ...base, status: 'Scheduled today', tone: 'calm' };
}

/**
 * Count only attendance facts already true and worth a human look.
 * Off-hours quiet is NOT an exception; a scheduled day that ended with no
 * punches, an unreviewed tardy, or a missing clock-out after shift end is.
 */
export function attendanceReview(rows: EmployeeSnapshot[], now: Date): { count: number; detail: string } {
  const nowMin = minutesOfDay(now);
  let absences = 0;
  let tardies = 0;
  let missingOut = 0;
  for (const r of workingRows(rows)) {
    const end = parseClockMinutes(r.schedule_expected_end);
    const shiftEnded = end !== null && nowMin > end;
    if (!r.has_punches && shiftEnded) absences += 1;
    if (r.is_late && r.tardy_approval_status === 'unreviewed') tardies += 1;
    if (r.has_punches && r.is_incomplete && shiftEnded) missingOut += 1;
  }
  const parts: string[] = [];
  if (absences) parts.push(`${absences} no-punch day${absences === 1 ? '' : 's'}`);
  if (tardies) parts.push(`${tardies} unreviewed lat${tardies === 1 ? 'e arrival' : 'e arrivals'}`);
  if (missingOut) parts.push(`${missingOut} missing clock-out${missingOut === 1 ? '' : 's'}`);
  return { count: absences + tardies + missingOut, detail: parts.join(' · ') };
}

/** The full staffing read for a management dashboard. */
export function staffingSummary(rows: EmployeeSnapshot[], now: Date): StaffingSummary {
  const office = officeStatus(rows, now);
  const nowMin = minutesOfDay(now);
  const working = workingRows(rows);
  const review = attendanceReview(rows, now);

  const live = office.phase === 'open' || office.phase === 'unknown_hours';
  const expectedRows = office.phase === 'open' ? rows.filter(r => isExpectedNow(r, nowMin)) : null;
  const expectedNow = expectedRows ? expectedRows.length : null;
  const presentNow = live ? rows.filter(isClockedInNow).length : null;
  const missingNow = expectedRows ? expectedRows.filter(r => !r.has_punches).length : null;

  // The roster is only a LIVE surface while the office is (possibly) working.
  const rosterPhases: OfficePhase[] = ['open', 'unknown_hours', 'before_open'];
  const rows_ = rosterPhases.includes(office.phase)
    ? working.map(r => personStatusAt(r, now))
    : [];

  return {
    office,
    expectedNow,
    presentNow,
    missingNow,
    scheduledToday: working.length,
    rows: rows_,
    reviewCount: review.count,
    reviewDetail: review.detail,
  };
}

/**
 * Owners run the office and never punch a clock; they must never appear in an
 * attendance roster, denominator, or exception count. Filtering happens here —
 * at the data boundary — not by hiding a rendered name.
 */
export function excludeNonClocking<T extends { user_id: string | null }>(
  rows: T[],
  nonClockingUserIds: ReadonlySet<string>,
): T[] {
  return rows.filter(r => !r.user_id || !nonClockingUserIds.has(r.user_id));
}
