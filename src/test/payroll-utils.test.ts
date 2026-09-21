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
  adjustmentMinutes, formatSignedHours, punchSegments, formatBreak,
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

describe('computeWeeklyTotals with worked-hour adjustments', () => {
  const entry = (employee_id: string, entry_date: string, total_minutes: number) =>
    ({ employee_id, entry_date, total_minutes });

  it('an adjustment counts toward the hours paid in the week it is dated', () => {
    // Mon–Fri 8h = 2400 recorded; a -7.28h installment dated Saturday of
    // the same Monday-start week comes off the payroll total.
    const rows = computeWeeklyTotals([
      entry('e1', '2026-09-14', 480), entry('e1', '2026-09-15', 480),
      entry('e1', '2026-09-16', 480), entry('e1', '2026-09-17', 480),
      entry('e1', '2026-09-18', 480),
    ], 1, [{ employee_id: 'e1', entry_date: '2026-09-19', hours_delta: '-7.28' }]);
    expect(rows).toHaveLength(1);
    expect(rows[0].worked_minutes).toBe(2400);
    expect(rows[0].adjustment_minutes).toBe(-437);
    expect(rows[0].total_minutes).toBe(1963);
    expect(rows[0].ot_minutes).toBe(0);
  });

  it('an added adjustment can push a week over 40 hours, and the OT flag follows the paid total', () => {
    const rows = computeWeeklyTotals(
      [entry('e1', '2026-09-14', OT_WEEK_MINUTES)], 1,
      [{ employee_id: 'e1', entry_date: '2026-09-15', hours_delta: 2.5 }],
    );
    expect(rows[0].total_minutes).toBe(OT_WEEK_MINUTES + 150);
    expect(rows[0].ot_minutes).toBe(150);
  });

  it('a week that holds only an adjustment still gets a row — it is still paid', () => {
    const rows = computeWeeklyTotals([], 1, [{ employee_id: 'e2', entry_date: '2026-09-16', hours_delta: 6.99 }]);
    expect(rows).toEqual([{ employee_id: 'e2', week_start: '2026-09-14', total_minutes: 419, worked_minutes: 0, adjustment_minutes: 419, ot_minutes: 0 }]);
  });

  it('an adjustment dated in another week never leaks into this one', () => {
    const rows = computeWeeklyTotals(
      [entry('e1', '2026-09-14', 480)], 1,
      [{ employee_id: 'e1', entry_date: '2026-09-21', hours_delta: 1 }],
    );
    const thisWeek = rows.find(r => r.week_start === '2026-09-14')!;
    expect(thisWeek.adjustment_minutes).toBe(0);
    expect(rows.find(r => r.week_start === '2026-09-21')!.adjustment_minutes).toBe(60);
  });

  it('without adjustments the totals are unchanged', () => {
    const rows = computeWeeklyTotals([entry('e1', '2026-09-14', 500)], 1);
    expect(rows[0]).toMatchObject({ total_minutes: 500, worked_minutes: 500, adjustment_minutes: 0 });
  });
});

describe('adjustment helpers', () => {
  it('converts signed hours (numeric strings included) to whole minutes', () => {
    expect(adjustmentMinutes('-7.28')).toBe(-437);
    expect(adjustmentMinutes(6.99)).toBe(419);
    expect(adjustmentMinutes('nonsense')).toBe(0);
  });

  it('always shows the sign so a deduction reads as one', () => {
    expect(formatSignedHours(-7.28)).toBe('-7.28h');
    expect(formatSignedHours('6.99')).toBe('+6.99h');
    expect(formatSignedHours(0)).toBe('0.00h');
  });
});

describe('formatBreak', () => {
  it('reads as people say it', () => {
    expect(formatBreak(30)).toBe('30m');
    expect(formatBreak(75)).toBe('1h 15m');
  });
});

describe('punchSegments', () => {
  const p = (punch_type: string, punch_time: string) => ({ punch_type, punch_time });

  it('pairs every in with its out and measures the lunch between them', () => {
    const segments = punchSegments([
      p('in', '2026-09-14T12:29:00Z'), p('out', '2026-09-14T16:01:00Z'),
      p('in', '2026-09-14T16:31:00Z'), p('out', '2026-09-14T22:27:00Z'),
    ]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ minutes: 212, break_minutes: null });
    expect(segments[1]).toMatchObject({ minutes: 356, break_minutes: 30 });
    expect(segments[1].in?.punch_time).toBe('2026-09-14T16:31:00Z');
  });

  it('keeps a still-open day and an orphan out visible instead of dropping them', () => {
    const open = punchSegments([p('in', '2026-09-14T12:29:00Z')]);
    expect(open).toEqual([{ in: p('in', '2026-09-14T12:29:00Z'), out: null, minutes: null, break_minutes: null }]);

    const orphan = punchSegments([p('out', '2026-09-14T16:01:00Z'), p('in', '2026-09-14T16:31:00Z'), p('out', '2026-09-14T20:00:00Z')]);
    expect(orphan[0]).toMatchObject({ in: null, minutes: null });
    expect(orphan[1]).toMatchObject({ minutes: 209, break_minutes: 30 });
  });

  it('an in followed by another in closes nothing and starts a new stretch', () => {
    const segments = punchSegments([p('in', '2026-09-14T12:00:00Z'), p('in', '2026-09-14T13:00:00Z'), p('out', '2026-09-14T14:00:00Z')]);
    expect(segments).toHaveLength(2);
    expect(segments[0]).toMatchObject({ out: null, minutes: null });
    expect(segments[1]).toMatchObject({ minutes: 60 });
  });
});
