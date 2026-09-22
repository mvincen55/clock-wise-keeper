/**
 * The pay period payroll is being prepared for: the most recent period that
 * has ended.
 *
 *  - weekly: the week before the current one, on payroll_settings.week_start_day;
 *  - bi-weekly with a known period start (pay_period_anchor): 14-day periods
 *    counted from it;
 *  - bi-weekly without one: the two weeks before the current week, marked
 *    `assumed` so a surface can say the office has not named a period start.
 *
 * The deadline exists only when the office set payroll_due_days_after_period;
 * otherwise `dueDate` is null and nothing derives one.
 */
import { shiftDate, daysBetween } from '@/lib/time-utils';
import { weekStartOf } from '@/lib/payroll-utils';

export type PayPeriod = {
  start: string;
  end: string;
  dueDate: string | null;
  /** "payroll Thu" — the label a deadline chip shows. */
  dueLabel: string | null;
  /** True when a bi-weekly office has not named a period start. */
  assumed: boolean;
};

export type PayPeriodSettings = {
  pay_period_type: string;
  week_start_day: number;
  payroll_due_days_after_period: number | null;
  pay_period_anchor: string | null;
};

const weekdayShort = (date: string) =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

export function payPeriodDue(end: string, dueDays: number | null): Pick<PayPeriod, 'dueDate' | 'dueLabel'> {
  if (dueDays === null || dueDays === undefined || Number.isNaN(dueDays)) return { dueDate: null, dueLabel: null };
  const dueDate = shiftDate(end, dueDays);
  return { dueDate, dueLabel: `payroll ${weekdayShort(dueDate)}` };
}

/** The last completed pay period as of `today`. */
export function lastCompletedPayPeriod(today: string, settings: PayPeriodSettings): PayPeriod {
  const weekStartDay = Number.isInteger(settings.week_start_day) ? settings.week_start_day : 1;
  const currentWeekStart = weekStartOf(today, weekStartDay);
  const due = (end: string) => payPeriodDue(end, settings.payroll_due_days_after_period);

  if (settings.pay_period_type === 'biweekly') {
    const anchor = settings.pay_period_anchor && /^\d{4}-\d{2}-\d{2}$/.test(settings.pay_period_anchor) ? settings.pay_period_anchor : null;
    if (anchor) {
      // The period containing today starts at anchor + 14k; the one before it is complete.
      const offset = daysBetween(anchor, today);
      const k = Math.floor(offset / 14);
      const currentStart = shiftDate(anchor, k * 14);
      const start = shiftDate(currentStart, -14);
      const end = shiftDate(currentStart, -1);
      return { start, end, ...due(end), assumed: false };
    }
    const start = shiftDate(currentWeekStart, -14);
    const end = shiftDate(currentWeekStart, -1);
    return { start, end, ...due(end), assumed: true };
  }

  const start = shiftDate(currentWeekStart, -7);
  const end = shiftDate(currentWeekStart, -1);
  return { start, end, ...due(end), assumed: false };
}
