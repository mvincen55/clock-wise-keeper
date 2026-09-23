/**
 * One vocabulary and one time rule for a person's day (src/lib/attendance-day.ts):
 *  - a day still ahead is Scheduled, never Absent, whatever the engine's flag says;
 *  - today reads Not in yet once the shift has started and Absent once it has ended;
 *  - a callout is an absence with a reason, whenever it falls; planned time off is not;
 *  - an open punch pair is In today and a Missing clock-out once the day has ended;
 *  - the lighter summary rows, with no absence rows attached, read the engine's callout signature.
 */
import { describe, expect, it } from 'vitest';
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { DayOffRow } from '@/hooks/useDaysOff';
import { DAY_WORDS, STATUS_CODE_LABELS, dayWord, isAbsence, isMissingClockOut } from '@/lib/attendance-day';

const day = (over: Partial<AttendanceDayStatusRow>): AttendanceDayStatusRow => ({
  id: 'row', user_id: 'login', employee_id: 'emp', entry_date: '2026-09-21',
  schedule_expected_start: '08:25:00', schedule_expected_end: '17:00:00', is_scheduled_day: true,
  office_closed: false, has_punches: false, is_remote: false, is_absent: true, is_incomplete: false,
  is_late: false, minutes_late: 0, tardy_approval_status: 'unreviewed', has_edits: false,
  has_day_comment: false, has_day_off: false, timezone_suspect: false, status_code: 'absent',
  status_reasons: {}, recompute_version: 1, computed_at: '2026-09-22T00:00:00Z', ...over,
});
const off = (type: string, date = '2026-09-21'): DayOffRow => ({
  id: `off-${type}`, user_id: 'login', employee_id: 'emp', date_start: date, date_end: date, type, hours: 8, notes: null, created_at: '',
} as DayOffRow);
// Tuesday Sep 22 at 10:00 AM, with the office's one-hour buffer.
const clock = { today: '2026-09-22', nowMinutes: 10 * 60, bufferMinutes: 60 };

describe('a day that has not ended is never absent', () => {
  it('a scheduled day ahead reads Scheduled and is not counted, even with the engine flag set', () => {
    const future = day({ entry_date: '2026-09-25' });
    expect(dayWord(future, [], clock)).toEqual({ label: DAY_WORDS.scheduled, tone: 'calm' });
    expect(isAbsence(future, [], clock)).toBe(false);
  });

  it('today before the shift starts is Scheduled; after it starts, Not in yet; after it ends, Absent', () => {
    const today = day({ entry_date: '2026-09-22' });
    expect(dayWord(today, [], { ...clock, nowMinutes: 8 * 60 }).label).toBe(DAY_WORDS.scheduled);
    expect(dayWord(today, [], clock).label).toBe(DAY_WORDS.notInYet);
    expect(isAbsence(today, [], clock)).toBe(false);
    const evening = { ...clock, nowMinutes: 18 * 60 + 30 };
    expect(dayWord(today, [], evening).label).toBe(DAY_WORDS.absent);
    expect(isAbsence(today, [], evening)).toBe(true);
  });

  it('yesterday with nothing recorded is Absent', () => {
    expect(dayWord(day({}), [], clock)).toEqual({ label: DAY_WORDS.absent, tone: 'urgent' });
    expect(isAbsence(day({}), [], clock)).toBe(true);
  });
});

describe('recorded absences', () => {
  it('a callout is an absence with a reason, today or in the future; planned time off is not', () => {
    const future = day({ entry_date: '2026-09-25', has_day_off: true });
    expect(dayWord(future, [off('unscheduled', '2026-09-25')], clock).label).toBe(DAY_WORDS.callout);
    expect(isAbsence(future, [off('unscheduled', '2026-09-25')], clock)).toBe(true);
    expect(dayWord(day({ has_day_off: true }), [off('scheduled_with_notice')], clock).label).toBe(DAY_WORDS.timeOff);
    expect(isAbsence(day({ has_day_off: true }), [off('scheduled_with_notice')], clock)).toBe(false);
    expect(dayWord(day({ has_day_off: true }), [off('medical_leave')], clock).label).toBe('Medical leave');
  });

  it('without absence rows, the engine signature (day off and still absent) is the callout', () => {
    expect(dayWord(day({ has_day_off: true }), [], clock).label).toBe(DAY_WORDS.callout);
    expect(isAbsence(day({ has_day_off: true }), [], clock)).toBe(true);
    expect(dayWord(day({ is_absent: false, has_day_off: true, status_code: 'day_off' }), [], clock).label).toBe(DAY_WORDS.timeOff);
  });

  it('a closure is Office closed and never an absence', () => {
    expect(dayWord(day({ office_closed: true }), [], clock).label).toBe(DAY_WORDS.closed);
    expect(isAbsence(day({ office_closed: true }), [], clock)).toBe(false);
  });
});

describe('punches', () => {
  it('an open pair is In today and a Missing clock-out once the day has ended', () => {
    const open = day({ entry_date: '2026-09-22', is_absent: false, has_punches: true, is_incomplete: true, status_code: 'incomplete' });
    expect(dayWord(open, [], clock).label).toBe(DAY_WORDS.in);
    expect(isMissingClockOut(open, clock)).toBe(false);
    const yesterday = { ...open, entry_date: '2026-09-21' };
    expect(dayWord(yesterday, [], clock).label).toBe(DAY_WORDS.missingClockOut);
    expect(isMissingClockOut(yesterday, clock)).toBe(true);
  });

  it('a closed day with punches is Arrived; an unscheduled day with none is Not scheduled', () => {
    expect(dayWord(day({ is_absent: false, has_punches: true, status_code: 'ok' }), [], clock).label).toBe(DAY_WORDS.arrived);
    expect(dayWord(day({ is_absent: false, is_scheduled_day: false, status_code: 'unscheduled' }), [], clock).label).toBe(DAY_WORDS.notScheduled);
  });
});

describe('the engine status codes use the same words', () => {
  it('maps every code to a word from the vocabulary', () => {
    expect(STATUS_CODE_LABELS.absent.label).toBe(DAY_WORDS.absent);
    expect(STATUS_CODE_LABELS.incomplete.label).toBe(DAY_WORDS.missingClockOut);
    expect(STATUS_CODE_LABELS.closure.label).toBe(DAY_WORDS.closed);
    expect(STATUS_CODE_LABELS.unscheduled.label).toBe(DAY_WORDS.notScheduled);
    expect(STATUS_CODE_LABELS.day_off.label).toBe(DAY_WORDS.timeOff);
  });
});
