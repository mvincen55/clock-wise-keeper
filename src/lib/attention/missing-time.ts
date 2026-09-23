/**
 * ONE definition of "missing time", shared by Attention and Payroll readiness.
 *
 * Today the product carries four notions of missing (AttendanceWorkspace's
 * isMissingShift, useMissingShifts, attendance-derive, payroll-utils'
 * detectDayIssue). This module is the rule both new consumers read; the
 * older consumers are wired to it in a later phase.
 *
 * Rules (all evaluated on a DAY-summary row for one person):
 *
 *  - The day is "past" once the office's clock is later than the scheduled
 *    end plus the missing-shift buffer, or the day is before today when the
 *    schedule carries no end time.
 *  - missing_day: scheduled, not closed, no punches, not covered by any
 *    recorded absence (a callout explains the day for payroll even though
 *    attendance still counts it as an absence, per #218), and no exception
 *    already resolved or ignored for that date.
 *  - missing_clock_out: punches exist and the last pair is open, past.
 *  - unpaired_punches: the live punch sequence breaks alternation or ends
 *    on an "in" on a day before today (payroll-utils' detectDayIssue).
 *  - time_suspect: the recompute flagged the row's timezone as suspect.
 *
 * Owners never clock, so callers exclude them before evaluation.
 */
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { AttendanceExceptionRow } from '@/hooks/useAttendanceExceptions';
import type { DayOffRow } from '@/hooks/useDaysOff';
import type { TimeEntryRow } from '@/hooks/useTimeEntries';
import { detectDayIssue } from '@/lib/payroll-utils';
import { parseClockMinutes } from '@/components/dashboard/staffing';

export type MissingTimeKind = 'missing_day' | 'missing_clock_out' | 'unpaired_punches' | 'time_suspect';

export type MissingTimeInput = {
  row: AttendanceDayStatusRow;
  /** The day's time entry with live punches, when one exists. */
  entry?: TimeEntryRow | null;
  /** Recorded absences covering this person on this date (any type). */
  daysOff: DayOffRow[];
  /** An office closure covers the date. */
  closed: boolean;
  /** The person's exception row for this date, if one exists. */
  exception?: AttendanceExceptionRow | null;
  /** "YYYY-MM-DD" in the office timezone. */
  today: string;
  /** Minutes since midnight in the office timezone. */
  nowMinutes: number;
  /** payroll_settings.missing_shift_buffer_minutes (default 60). */
  bufferMinutes: number;
};

/** True once the scheduled shift (plus buffer) is behind us. */
export function dayIsPast(row: Pick<AttendanceDayStatusRow, 'entry_date' | 'schedule_expected_end'>, today: string, nowMinutes: number, bufferMinutes: number): boolean {
  if (row.entry_date < today) return true;
  if (row.entry_date > today) return false;
  const end = parseClockMinutes(row.schedule_expected_end);
  if (end === null) return false;
  return nowMinutes > end + bufferMinutes;
}

/** Does a recorded absence cover this date for this person? */
export function coveredByDayOff(daysOff: DayOffRow[], employeeId: string | null, date: string): DayOffRow | null {
  return (
    daysOff.find(d => (employeeId ? d.employee_id === employeeId : true) && d.date_start <= date && d.date_end >= date) ?? null
  );
}

export function missingTimeConditions(input: MissingTimeInput): MissingTimeKind[] {
  const { row, entry, daysOff, closed, exception, today, nowMinutes, bufferMinutes } = input;
  const out: MissingTimeKind[] = [];
  if (row.office_closed || closed) return out;
  const past = dayIsPast(row, today, nowMinutes, bufferMinutes);

  if (row.timezone_suspect) out.push('time_suspect');

  if (row.is_scheduled_day && !row.has_punches && past) {
    const covered = coveredByDayOff(daysOff, row.employee_id, row.entry_date) || row.has_day_off;
    const settled = exception && (exception.status === 'resolved' || exception.status === 'ignored');
    if (!covered && !settled) out.push('missing_day');
  }

  if (row.has_punches && row.is_incomplete && past) out.push('missing_clock_out');

  if (entry && entry.punches.length > 0 && row.entry_date < today) {
    const ordered = [...entry.punches].sort((a, b) => a.seq - b.seq);
    const issue = detectDayIssue(ordered, entry.total_minutes, row.entry_date, today);
    // An open pair is already reported as missing_clock_out; anomalies and any
    // other unpaired shape are the payroll-facing "unpaired punches".
    if (issue === 'ANOMALY' || (issue === 'MISSING PUNCH' && !row.is_incomplete)) out.push('unpaired_punches');
  }
  return out;
}
