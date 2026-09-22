import { describe, expect, it } from 'vitest';
import { currentScheduleByEmployee, describeWorkingHours, observedHoursByWeekday, periodsFromWeekdays } from '@/lib/provider-working-schedule';

// Calibration reuses the work schedules the office already saved in Team.
// These pin the translation from schedule rows to working periods and the
// choice of which schedule is in force today.

describe('periodsFromWeekdays', () => {
  it('turns enabled rows into hours and disabled rows into off-days, sorted by weekday', () => {
    expect(periodsFromWeekdays([
      { weekday: 2, enabled: false, start_time: '08:00:00', end_time: '17:00:00' },
      { weekday: 1, enabled: true, start_time: '07:30:00', end_time: '16:30:00' },
    ])).toEqual([
      { weekday: 1, startMinutes: 450, endMinutes: 990 },
      { weekday: 2, startMinutes: 0, endMinutes: 0 },
    ]);
  });

  it('skips rows it cannot trust instead of guessing', () => {
    expect(periodsFromWeekdays([
      { weekday: 3, enabled: true, start_time: '17:00:00', end_time: '08:00:00' },
      { weekday: 9, enabled: true, start_time: '08:00:00', end_time: '17:00:00' },
      { weekday: 4, enabled: true, start_time: 'nope', end_time: '17:00:00' },
    ])).toEqual([]);
  });
});

describe('currentScheduleByEmployee', () => {
  const monday = [{ weekday: 1, enabled: true, start_time: '08:00:00', end_time: '17:00:00' }];
  const friday = [{ weekday: 5, enabled: true, start_time: '09:00:00', end_time: '15:00:00' }];

  it('picks the latest schedule that has started and not ended', () => {
    const result = currentScheduleByEmployee([
      { employeeId: 'e1', effectiveStart: '2026-01-01', effectiveEnd: null, weekdays: monday },
      { employeeId: 'e1', effectiveStart: '2026-06-01', effectiveEnd: null, weekdays: friday },
      { employeeId: 'e1', effectiveStart: '2027-01-01', effectiveEnd: null, weekdays: monday },
      { employeeId: 'e2', effectiveStart: '2026-01-01', effectiveEnd: '2026-02-01', weekdays: monday },
    ], '2026-09-15');
    expect(result.get('e1')).toEqual([{ weekday: 5, startMinutes: 540, endMinutes: 900 }]);
    expect(result.has('e2')).toBe(false);
  });

  it('prefers the first schedule given when two start the same day (assignments before versions)', () => {
    const result = currentScheduleByEmployee([
      { employeeId: 'e1', effectiveStart: '2026-06-01', effectiveEnd: null, weekdays: monday },
      { employeeId: 'e1', effectiveStart: '2026-06-01', effectiveEnd: null, weekdays: friday },
    ], '2026-09-15');
    expect(result.get('e1')).toEqual([{ weekday: 1, startMinutes: 480, endMinutes: 1020 }]);
  });
});

describe('describeWorkingHours', () => {
  it('reads as one line, with split shifts listed and off-days named', () => {
    expect(describeWorkingHours([
      { weekday: 2, startMinutes: 0, endMinutes: 0 },
      { weekday: 1, startMinutes: 780, endMinutes: 1020 },
      { weekday: 1, startMinutes: 505, endMinutes: 720 },
      { weekday: 5, startMinutes: 505, endMinutes: 1020 },
    ])).toBe('Mon 8:25 AM–12:00 PM, 1:00 PM–5:00 PM · Tue off · Fri 8:25 AM–5:00 PM');
  });
});

describe('observedHoursByWeekday', () => {
  const day = (businessDate: string, start: number | null, end: number | null, first: number | null = start, last: number | null = end) =>
    ({ businessDate, availableStartMinute: start, availableEndMinute: end, firstPatientMinute: first, lastPatientMinute: last });
  it('learns a weekday from the median of enough captured days and leaves thin weekdays unknown', () => {
    const learned = observedHoursByWeekday([
      day('2026-09-07', 520, 1010), // Mon 8:40–4:50
      day('2026-09-14', 505, 1020), // Mon 8:25–5:00
      day('2026-09-21', 520, 1010), // Mon 8:40–4:50
      day('2026-09-15', 585, 1200), // Tue — only one capture
    ]);
    expect(learned).toEqual({ periods: [{ weekday: 1, startMinutes: 520, endMinutes: 1010 }], days: 3, since: '2026-09-07' });
  });
  it('uses the lower median start and upper median end when counts are even', () => {
    const learned = observedHoursByWeekday([day('2026-09-07', 500, 1000), day('2026-09-14', 520, 1020)]);
    expect(learned?.periods).toEqual([{ weekday: 1, startMinutes: 500, endMinutes: 1020 }]);
  });
  it('falls back to patients when no open slot was visible, and skips days it cannot read', () => {
    const learned = observedHoursByWeekday([
      day('2026-09-09', null, null, 540, 960), // Wed, patients only
      day('2026-09-16', null, null, 540, 990),
      day('2026-09-23', null, null, null, null), // nothing visible
      day('bad-date', 480, 1020),
      day('2026-09-30', 700, 600), // ends before it starts
    ]);
    expect(learned).toEqual({ periods: [{ weekday: 3, startMinutes: 540, endMinutes: 990 }], days: 2, since: '2026-09-09' });
    expect(observedHoursByWeekday([day('2026-09-09', 480, 1020)])).toBeNull();
  });
});
