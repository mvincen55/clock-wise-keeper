/**
 * Payroll-week math and time-record flags.
 *
 * Guards the Phase 5 contract (Time Clock Legitimacy Hardening): one
 * week definition from payroll_settings.week_start_day; a week over
 * 2400 minutes is FLAGGED (never paid) as hours over 40; missing
 * punches and pairing anomalies are detected exactly as specified; and
 * the PTO accrual basis never includes hours over 40/week.
 */
import { describe, it, expect } from 'vitest';
import {
  OT_WEEK_MINUTES, weekStartOf, computeWeeklyTotals,
  formatHoursMinutes, formatOtFlag, detectDayIssue, accrualBasisWorkedHours,
} from '@/lib/payroll-utils';

describe('weekStartOf', () => {
  it('follows week_start_day', () => {
    // 2026-08-12 is a Wednesday.
    expect(weekStartOf('2026-08-12', 1)).toBe('2026-08-10'); // Monday start
    expect(weekStartOf('2026-08-12', 0)).toBe('2026-08-09'); // Sunday start
    expect(weekStartOf('2026-08-12', 3)).toBe('2026-08-12'); // Wednesday start, same day
    expect(weekStartOf('2026-08-12', 4)).toBe('2026-08-06'); // Thursday start, prior week
  });

  it('is stable across DST transitions (plain-date math)', () => {
    // US spring-forward 2026-03-08 (a Sunday).
    expect(weekStartOf('2026-03-08', 1)).toBe('2026-03-02');
    expect(weekStartOf('2026-03-09', 1)).toBe('2026-03-09');
    expect(weekStartOf('2026-03-08', 0)).toBe('2026-03-08');
  });
});

describe('computeWeeklyTotals', () => {
  const entry = (employee_id: string, entry_date: string, total_minutes: number) =>
    ({ employee_id, entry_date, total_minutes });

  it('a 45-hour week flags 5 hours of OT', () => {
    // Mon–Fri, 9h/day = 2700 minutes, Monday-start week.
    const rows = computeWeeklyTotals([
      entry('e1', '2026-08-10', 540), entry('e1', '2026-08-11', 540),
      entry('e1', '2026-08-12', 540), entry('e1', '2026-08-13', 540),
      entry('e1', '2026-08-14', 540),
    ], 1);
    expect(rows).toHaveLength(1);
    expect(rows[0].total_minutes).toBe(2700);
    expect(rows[0].ot_minutes).toBe(300);
    expect(formatOtFlag(rows[0].ot_minutes)).toBe('OT: 5h 0m over');
  });

  it('exactly 40 hours is not OT', () => {
    const rows = computeWeeklyTotals([entry('e1', '2026-08-10', OT_WEEK_MINUTES)], 1);
    expect(rows[0].ot_minutes).toBe(0);
  });

  it('the week boundary follows week_start_day: same days, different weeks', () => {
    // Sat 2026-08-08 + Sun 2026-08-09. Monday-start: both land in the
    // week of Aug 3. Sunday-start: Saturday closes the Aug 2 week and
    // Sunday opens the Aug 9 week.
    const days = [entry('e1', '2026-08-08', 1500), entry('e1', '2026-08-09', 1500)];
    const mondayStart = computeWeeklyTotals(days, 1);
    expect(mondayStart).toHaveLength(1);
    expect(mondayStart[0].ot_minutes).toBe(600);
    const sundayStart = computeWeeklyTotals(days, 0);
    expect(sundayStart).toHaveLength(2);
    expect(sundayStart.every(w => w.ot_minutes === 0)).toBe(true);
  });

  it('employees are tallied separately', () => {
    const rows = computeWeeklyTotals([
      entry('e1', '2026-08-10', 2500), entry('e2', '2026-08-10', 2300),
    ], 1);
    expect(rows.find(r => r.employee_id === 'e1')!.ot_minutes).toBe(100);
    expect(rows.find(r => r.employee_id === 'e2')!.ot_minutes).toBe(0);
  });
});

describe('detectDayIssue', () => {
  const p = (punch_type: string, punch_time: string) => ({ punch_type, punch_time });
  const TODAY = '2026-08-14';

  it('a clean paired day is fine', () => {
    expect(detectDayIssue(
      [p('in', '2026-08-13T13:00:00Z'), p('out', '2026-08-13T21:00:00Z')], 480, '2026-08-13', TODAY,
    )).toBeNull();
  });

  it('in/in silently computing zero is an ANOMALY', () => {
    expect(detectDayIssue(
      [p('in', '2026-08-13T13:00:00Z'), p('in', '2026-08-13T17:00:00Z')], 0, '2026-08-13', TODAY,
    )).toBe('ANOMALY');
  });

  it('a negative pair is an ANOMALY', () => {
    expect(detectDayIssue(
      [p('in', '2026-08-13T21:00:00Z'), p('out', '2026-08-13T13:00:00Z')], -480, '2026-08-13', TODAY,
    )).toBe('ANOMALY');
  });

  it('punches present but zero total is an ANOMALY', () => {
    expect(detectDayIssue(
      [p('in', '2026-08-13T13:00:00Z'), p('out', '2026-08-13T13:00:00Z')], 0, '2026-08-13', TODAY,
    )).toBe('ANOMALY');
  });

  it('an unpaired in before today is a MISSING PUNCH', () => {
    expect(detectDayIssue([p('in', '2026-08-13T13:00:00Z')], 0, '2026-08-13', TODAY)).toBe('MISSING PUNCH');
  });

  it('a still-open TODAY is normal, not missing', () => {
    expect(detectDayIssue([p('in', '2026-08-14T13:00:00Z')], 0, TODAY, TODAY)).toBeNull();
  });

  it('no punches means no punch-level issue (missing DAYS come from the schedule)', () => {
    expect(detectDayIssue([], 0, '2026-08-13', TODAY)).toBeNull();
  });
});

describe('accrualBasisWorkedHours', () => {
  it('hours over 40 never enter the accrual basis, whatever the cap', () => {
    expect(accrualBasisWorkedHours(45, 45)).toBe(40);
    expect(accrualBasisWorkedHours(45, 50)).toBe(40);
  });
  it('the office cap still applies below 40', () => {
    expect(accrualBasisWorkedHours(42, 35)).toBe(35);
  });
  it('normal weeks pass through', () => {
    expect(accrualBasisWorkedHours(38, 40)).toBe(38);
  });
});

describe('formatHoursMinutes', () => {
  it('renders h/m', () => {
    expect(formatHoursMinutes(195)).toBe('3h 15m');
    expect(formatHoursMinutes(60)).toBe('1h 0m');
  });
});
