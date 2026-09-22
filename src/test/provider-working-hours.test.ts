import { describe, expect, it } from 'vitest';
import { currentScheduleByEmployee, describeWorkingHours, periodsFromWeekdays } from '@/lib/provider-working-schedule';

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
