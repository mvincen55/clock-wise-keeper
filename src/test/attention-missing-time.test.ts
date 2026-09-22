/**
 * One definition of "missing time", shared by Attention and Payroll readiness.
 *
 *  - a scheduled day with no punches is missing only once the shift plus the
 *    buffer is behind us, and never when a recorded absence covers it — a
 *    callout explains the day for payroll even though attendance still counts
 *    it as an absence;
 *  - a resolved or ignored exception settles a missing day;
 *  - an open punch pair past the shift is a missing clock-out;
 *  - a broken punch sequence on a past day is "unpaired punches";
 *  - closures produce nothing.
 */
import { describe, expect, it } from 'vitest';
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { DayOffRow } from '@/hooks/useDaysOff';
import type { TimeEntryRow, PunchRow } from '@/hooks/useTimeEntries';
import { dayIsPast, missingTimeConditions } from '@/lib/attention/missing-time';

const row = (over: Partial<AttendanceDayStatusRow> = {}): AttendanceDayStatusRow => ({
  id: 'ds-1', user_id: 'u1', employee_id: 'e1', entry_date: '2026-09-18',
  schedule_expected_start: '08:00:00', schedule_expected_end: '17:00:00',
  is_scheduled_day: true, office_closed: false, has_punches: false, is_remote: false,
  is_absent: true, is_incomplete: false, is_late: false, minutes_late: 0,
  tardy_approval_status: 'unreviewed', has_edits: false, has_day_comment: false,
  has_day_off: false, timezone_suspect: false, status_code: 'absent', status_reasons: {},
  recompute_version: 1, computed_at: '2026-09-18T22:00:00Z', ...over,
});
const dayOff = (over: Partial<DayOffRow> = {}): DayOffRow => ({
  id: 'do-1', user_id: 'u1', employee_id: 'e1', date_start: '2026-09-18', date_end: '2026-09-18',
  type: 'unscheduled', hours: 8, notes: null, created_at: '2026-09-18T12:00:00Z', ...over,
});
const punch = (seq: number, type: 'in' | 'out', time: string): PunchRow => ({
  id: `p${seq}`, time_entry_id: 't1', seq, punch_type: type, punch_time: time, source: 'manual', raw_text: null,
  created_at: time, low_confidence: false, location_lat: null, location_lng: null, is_edited: false,
  original_punch_time: null, edited_at: null, edited_by: null, voided_at: null, voided_by: null, void_reason: null,
});
const entry = (punches: PunchRow[], total: number | null = 0): TimeEntryRow => ({
  id: 't1', user_id: 'u1', employee_id: 'e1', entry_date: '2026-09-18', total_minutes: total, source: 'manual',
  notes: null, created_at: '', updated_at: '', is_remote: false, entry_comment: null, punches, all_punches: punches,
});
const base = { daysOff: [] as DayOffRow[], closed: false, exception: null, today: '2026-09-21', nowMinutes: 8 * 60 + 24, bufferMinutes: 60 };

describe('dayIsPast', () => {
  it('a past date is past; a future date is not', () => {
    expect(dayIsPast(row(), '2026-09-21', 0, 60)).toBe(true);
    expect(dayIsPast(row({ entry_date: '2026-09-22' }), '2026-09-21', 23 * 60, 60)).toBe(false);
  });
  it('today is past only after the scheduled end plus the buffer', () => {
    const today = row({ entry_date: '2026-09-21' });
    expect(dayIsPast(today, '2026-09-21', 17 * 60 + 30, 60)).toBe(false);
    expect(dayIsPast(today, '2026-09-21', 18 * 60 + 1, 60)).toBe(true);
  });
  it('today with no schedule end is never past', () => {
    expect(dayIsPast(row({ entry_date: '2026-09-21', schedule_expected_end: null }), '2026-09-21', 23 * 60, 60)).toBe(false);
  });
});

describe('missingTimeConditions', () => {
  it('a scheduled past day with no punches and no explanation is a missing day', () => {
    expect(missingTimeConditions({ ...base, row: row() })).toEqual(['missing_day']);
  });
  it('a callout explains the day for payroll (attendance still counts the absence)', () => {
    expect(missingTimeConditions({ ...base, row: row(), daysOff: [dayOff({ type: 'unscheduled' })] })).toEqual([]);
    expect(missingTimeConditions({ ...base, row: row({ has_day_off: true }) })).toEqual([]);
  });
  it('a day off for someone else never covers this person', () => {
    expect(missingTimeConditions({ ...base, row: row(), daysOff: [dayOff({ employee_id: 'e2' })] })).toEqual(['missing_day']);
  });
  it('a resolved or ignored exception settles the day; an open one does not', () => {
    const exc = (status: 'open' | 'resolved' | 'ignored') => ({ id: 'x', user_id: 'u1', employee_id: 'e1', exception_date: '2026-09-18', type: 'missing_shift', status, reason_text: null, resolution_action: null, created_at: '', resolved_at: null } as never);
    expect(missingTimeConditions({ ...base, row: row(), exception: exc('resolved') })).toEqual([]);
    expect(missingTimeConditions({ ...base, row: row(), exception: exc('ignored') })).toEqual([]);
    expect(missingTimeConditions({ ...base, row: row(), exception: exc('open') })).toEqual(['missing_day']);
  });
  it('today before the buffer elapses is not missing yet', () => {
    expect(missingTimeConditions({ ...base, row: row({ entry_date: '2026-09-21' }), nowMinutes: 9 * 60 })).toEqual([]);
  });
  it('an open punch pair past the shift is a missing clock-out, not a missing day', () => {
    const r = row({ has_punches: true, is_incomplete: true, is_absent: false });
    expect(missingTimeConditions({ ...base, row: r, entry: entry([punch(1, 'in', '2026-09-18T11:58:00Z')]) })).toEqual(['missing_clock_out']);
  });
  it('a broken sequence on a past day is unpaired punches', () => {
    const r = row({ has_punches: true, is_absent: false });
    const e = entry([punch(1, 'in', '2026-09-18T12:00:00Z'), punch(2, 'in', '2026-09-18T13:00:00Z')], 0);
    expect(missingTimeConditions({ ...base, row: r, entry: e })).toEqual(['unpaired_punches']);
  });
  it('a closure produces nothing, whatever else is true', () => {
    expect(missingTimeConditions({ ...base, row: row(), closed: true })).toEqual([]);
    expect(missingTimeConditions({ ...base, row: row({ office_closed: true }) })).toEqual([]);
  });
  it('a suspect timezone is its own condition and can coexist', () => {
    expect(missingTimeConditions({ ...base, row: row({ timezone_suspect: true }) })).toEqual(['time_suspect', 'missing_day']);
  });
});
