/**
 * One vocabulary for a person's day, read the same way by Team Attendance,
 * People, the person record, the Today snapshot, Home, Attention, Reports,
 * and the member's own banner. One condition, one word:
 *
 *   Absent             a scheduled day that ended with no time recorded; a
 *                      callout is an absence with a reason (#218)
 *   Missing clock-out  punches with no closing clock-out, once the day ended
 *   Late               arrived after the grace period
 *   Time off           a recorded, explained day off
 *   Callout            an unscheduled day off: an absence with a reason
 *   Office closed      a closure covers the day
 *   Not scheduled      no shift that day
 *   Scheduled          a shift still ahead: nobody is absent before their day ends
 *   Not in yet         today, shift started, no punches yet
 *   In                 clocked in right now (today, open punch pair)
 *   Arrived            punches recorded and closed (the day-summary word)
 *
 * The engine sets `is_absent` the moment a scheduled day has no punches,
 * for tomorrow as much as for last week, so every reader applies the time
 * rule here: a day is absent only once it has ended (schedule end plus the
 * office's buffer), or when a callout explains it whenever it falls.
 */
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { DayOffRow } from '@/hooks/useDaysOff';
import type { Tone } from '@/components/dashboard/types';
import { parseClockMinutes } from '@/components/dashboard/staffing';
import { dayIsPast } from '@/lib/attention/missing-time';

export const DAY_WORDS = {
  absent: 'Absent',
  missingClockOut: 'Missing clock-out',
  late: 'Late',
  timeOff: 'Time off',
  callout: 'Callout',
  closed: 'Office closed',
  notScheduled: 'Not scheduled',
  scheduled: 'Scheduled',
  notInYet: 'Not in yet',
  in: 'In',
  arrived: 'Arrived',
  timeSuspect: 'Time looks off',
} as const;

/** The recorded-absence types, in the office's words. */
export const DAY_OFF_LABELS: Record<string, string> = {
  scheduled_with_notice: DAY_WORDS.timeOff,
  unscheduled: DAY_WORDS.callout,
  office_closed: DAY_WORDS.closed,
  medical_leave: 'Medical leave',
  other: 'Other',
};

/** A recorded absence that explains the day. A callout does not: it is an absence with a reason. */
export const EXPLAINED_DAY_OFF_TYPES = ['scheduled_with_notice', 'medical_leave', 'other'];

/** The `status_code` the engine writes, in the same words. */
export const STATUS_CODE_LABELS: Record<string, { label: string; tone: Tone }> = {
  ok: { label: DAY_WORDS.arrived, tone: 'calm' },
  remote_ok: { label: 'Remote', tone: 'calm' },
  late: { label: DAY_WORDS.late, tone: 'attention' },
  absent: { label: DAY_WORDS.absent, tone: 'urgent' },
  incomplete: { label: DAY_WORDS.missingClockOut, tone: 'attention' },
  closure: { label: DAY_WORDS.closed, tone: 'calm' },
  day_off: { label: DAY_WORDS.timeOff, tone: 'calm' },
  unscheduled: { label: DAY_WORDS.notScheduled, tone: 'calm' },
  timezone_suspect: { label: DAY_WORDS.timeSuspect, tone: 'attention' },
};

export type DayClock = {
  /** "YYYY-MM-DD" in the office timezone. */
  today: string;
  /** Minutes since midnight in the office timezone. */
  nowMinutes: number;
  /** payroll_settings.missing_shift_buffer_minutes (default 60). */
  bufferMinutes: number;
};

export type DayWord = { label: string; tone: Tone };

/** The fields the rule reads; the day-status row and the lighter summary rows both carry them. */
export type DayLike = Pick<
  AttendanceDayStatusRow,
  'entry_date' | 'is_absent' | 'has_punches' | 'is_incomplete' | 'has_day_off' | 'office_closed' | 'is_scheduled_day' | 'schedule_expected_start' | 'schedule_expected_end'
>;

/**
 * What the recorded absences say about the day. Without the absence rows
 * (the lighter summaries), the engine's own signature stands in: a callout
 * carries the day-off flag while the day stays absent.
 */
const coverOf = (row: DayLike, cover: DayOffRow[]) => ({
  planned: cover.find(d => EXPLAINED_DAY_OFF_TYPES.includes(d.type)) ?? null,
  callout: cover.length > 0 ? cover.some(d => d.type === 'unscheduled') : row.has_day_off && row.is_absent,
});

/**
 * Is this day an absence? The engine's flag, read with the time rule: a
 * callout is an absence whenever it falls; otherwise only once the day has
 * ended with nothing recorded and no explained day off.
 */
export function isAbsence(row: DayLike, cover: DayOffRow[], clock: DayClock): boolean {
  if (!row.is_absent || row.office_closed) return false;
  const { planned, callout } = coverOf(row, cover);
  if (callout) return true;
  if (planned) return false;
  return dayIsPast(row, clock.today, clock.nowMinutes, clock.bufferMinutes);
}

/**
 * One primary word for the day. Planned time off and a callout are read
 * from the recorded absence, so a callout never shows as time off. A day
 * that has not ended is "Scheduled", or "Not in yet" once its shift has
 * started today; it is never "Absent".
 */
export function dayWord(row: DayLike, cover: DayOffRow[], clock: DayClock): DayWord {
  const { planned, callout } = coverOf(row, cover);
  if (row.office_closed) return { label: DAY_WORDS.closed, tone: 'calm' };
  if (planned) return { label: DAY_OFF_LABELS[planned.type] ?? DAY_WORDS.timeOff, tone: 'calm' };
  if (callout) return { label: DAY_WORDS.callout, tone: 'urgent' };
  const past = dayIsPast(row, clock.today, clock.nowMinutes, clock.bufferMinutes);
  if (row.has_punches) {
    if (row.is_incomplete) return past ? { label: DAY_WORDS.missingClockOut, tone: 'attention' } : { label: DAY_WORDS.in, tone: 'steady' };
    return { label: DAY_WORDS.arrived, tone: 'calm' };
  }
  if (row.has_day_off) return { label: DAY_WORDS.timeOff, tone: 'calm' };
  if (!row.is_scheduled_day) return { label: DAY_WORDS.notScheduled, tone: 'calm' };
  if (past) return { label: DAY_WORDS.absent, tone: 'urgent' };
  const start = parseClockMinutes(row.schedule_expected_start);
  if (row.entry_date === clock.today && start !== null && clock.nowMinutes >= start) return { label: DAY_WORDS.notInYet, tone: 'attention' };
  return { label: DAY_WORDS.scheduled, tone: 'calm' };
}

/** Punches with no closing clock-out, once the day has ended. Today's open pair is someone clocked in. */
export function isMissingClockOut(row: DayLike, clock: DayClock): boolean {
  return row.has_punches && row.is_incomplete && dayIsPast(row, clock.today, clock.nowMinutes, clock.bufferMinutes);
}

/** Badge classes for a tone, shared by the tables that show a day word. */
export const DAY_TONE_CLASS: Record<Tone, string> = {
  urgent: 'bg-destructive/20 text-destructive',
  attention: 'bg-warning/20 text-warning',
  steady: 'bg-success/20 text-success',
  calm: 'bg-muted text-muted-foreground',
};
