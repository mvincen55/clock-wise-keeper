/**
 * Which dates are office days.
 *
 * The office's own calendar answers it. A full-day closure (a generated
 * holiday, a snow day) closes the office. Sundays are closed. A Saturday is
 * closed unless the office marked that date open. Every other day is open.
 * The Office Calendar and Close the Day read this one rule, so a day the
 * calendar shows closed is never a day the closeout asks anyone to seal.
 *
 * The weekly pattern is a parameter with a Monday-to-Friday default, so an
 * office that opens on other days can say so without changing the rule.
 *
 * Plain "YYYY-MM-DD" dates throughout. Weekday arithmetic goes through UTC
 * noon like time-utils, so a DST shift never moves a date.
 */
import { shiftDate } from '@/lib/time-utils';

export type OfficeDayCalendar = {
  /** Full-day office closures. */
  closedDates: ReadonlySet<string>;
  /** Dates the office works although the weekly pattern says closed (open Saturdays). */
  openDates: ReadonlySet<string>;
  /** Weekdays (0 = Sunday … 6 = Saturday) the office opens every week. Monday to Friday when absent. */
  openWeekdays?: ReadonlySet<number>;
};

export const DEFAULT_OPEN_WEEKDAYS: ReadonlySet<number> = new Set([1, 2, 3, 4, 5]);

export const EMPTY_OFFICE_CALENDAR: OfficeDayCalendar = {
  closedDates: new Set<string>(),
  openDates: new Set<string>(),
};

/** 0 = Sunday … 6 = Saturday for a plain date. */
export function weekdayOf(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
}

/** Whether the office is open on this date by its calendar: a closure wins, then a marked open date, then the weekly pattern. */
export function isOfficeDay(date: string, calendar: OfficeDayCalendar): boolean {
  if (calendar.closedDates.has(date)) return false;
  if (calendar.openDates.has(date)) return true;
  return (calendar.openWeekdays ?? DEFAULT_OPEN_WEEKDAYS).has(weekdayOf(date));
}

/**
 * The nearest date after (`step` 1) or before (`step` -1) `date` that
 * `isOpen` accepts, looking at most `limit` days out; null when none is
 * within reach. Callers bound the search: Close the Day never offers a day
 * after today, so it passes the days left until today as the limit.
 */
export function adjacentDay(
  date: string,
  step: -1 | 1,
  isOpen: (date: string) => boolean,
  limit = 62,
): string | null {
  let cursor = date;
  for (let i = 0; i < limit; i++) {
    cursor = shiftDate(cursor, step);
    if (isOpen(cursor)) return cursor;
  }
  return null;
}

/**
 * How many office days fall in an inclusive date range, by the calendar
 * above. Zero for an inverted range. This is the denominator behind
 * office-day pacing and closeout completeness: a period with twenty office
 * days and eighteen closeouts is two days short, whatever the weekends say.
 */
export function countOfficeDays(start: string, end: string, calendar: OfficeDayCalendar): number {
  if (end < start) return 0;
  let count = 0;
  for (let cursor = start; cursor <= end; cursor = shiftDate(cursor, 1)) {
    if (isOfficeDay(cursor, calendar)) count += 1;
  }
  return count;
}

/** The office days in an inclusive range, oldest first. */
export function listOfficeDays(start: string, end: string, calendar: OfficeDayCalendar): string[] {
  const out: string[] = [];
  if (end < start) return out;
  for (let cursor = start; cursor <= end; cursor = shiftDate(cursor, 1)) {
    if (isOfficeDay(cursor, calendar)) out.push(cursor);
  }
  return out;
}
