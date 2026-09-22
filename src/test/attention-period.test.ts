/**
 * The pay period payroll is prepared for is the last completed one, and a
 * deadline exists only when the office set one.
 */
import { describe, expect, it } from 'vitest';
import { lastCompletedPayPeriod } from '@/lib/attention/period';

const base = { pay_period_type: 'weekly', week_start_day: 1, payroll_due_days_after_period: null, pay_period_anchor: null };

describe('lastCompletedPayPeriod', () => {
  it('weekly: the week before the current one, on the office week start', () => {
    // 2026-09-21 is a Monday.
    expect(lastCompletedPayPeriod('2026-09-21', base)).toMatchObject({ start: '2026-09-14', end: '2026-09-20', dueDate: null, dueLabel: null, assumed: false });
    expect(lastCompletedPayPeriod('2026-09-23', base)).toMatchObject({ start: '2026-09-14', end: '2026-09-20' });
    expect(lastCompletedPayPeriod('2026-09-23', { ...base, week_start_day: 0 })).toMatchObject({ start: '2026-09-13', end: '2026-09-19' });
  });
  it('a due date is derived only when the office set the days after the period', () => {
    expect(lastCompletedPayPeriod('2026-09-21', { ...base, payroll_due_days_after_period: 4 })).toMatchObject({ dueDate: '2026-09-24', dueLabel: 'payroll Thu' });
    expect(lastCompletedPayPeriod('2026-09-21', { ...base, payroll_due_days_after_period: 0 })).toMatchObject({ dueDate: '2026-09-20', dueLabel: 'payroll Sun' });
  });
  it('bi-weekly with a known period start counts 14-day periods from it', () => {
    const s = { ...base, pay_period_type: 'biweekly', pay_period_anchor: '2026-08-31' };
    expect(lastCompletedPayPeriod('2026-09-21', s)).toMatchObject({ start: '2026-08-31', end: '2026-09-13', assumed: false });
    expect(lastCompletedPayPeriod('2026-09-28', s)).toMatchObject({ start: '2026-09-14', end: '2026-09-27', assumed: false });
    expect(lastCompletedPayPeriod('2026-09-13', s)).toMatchObject({ start: '2026-08-17', end: '2026-08-30' });
  });
  it('bi-weekly without a period start assumes the two weeks before the current one and says so', () => {
    expect(lastCompletedPayPeriod('2026-09-23', { ...base, pay_period_type: 'biweekly' })).toMatchObject({ start: '2026-09-07', end: '2026-09-20', assumed: true });
  });
});
