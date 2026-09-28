import { describe, expect, it } from 'vitest';
import { adjacentDay, EMPTY_OFFICE_CALENDAR, isOfficeDay, weekdayOf, type OfficeDayCalendar } from '@/lib/office-days';

const calendar = (over: Partial<OfficeDayCalendar> = {}): OfficeDayCalendar => ({
  closedDates: new Set<string>(),
  openDates: new Set<string>(),
  ...over,
});
const open = (c: OfficeDayCalendar) => (d: string) => isOfficeDay(d, c);

describe('isOfficeDay', () => {
  it('opens Monday to Friday and closes the weekend unless told otherwise', () => {
    expect(weekdayOf('2026-06-07')).toBe(0);
    expect(isOfficeDay('2026-06-08', EMPTY_OFFICE_CALENDAR)).toBe(true); // Monday
    expect(isOfficeDay('2026-06-12', EMPTY_OFFICE_CALENDAR)).toBe(true); // Friday
    expect(isOfficeDay('2026-06-06', EMPTY_OFFICE_CALENDAR)).toBe(false); // Saturday
    expect(isOfficeDay('2026-06-07', EMPTY_OFFICE_CALENDAR)).toBe(false); // Sunday
  });
  it('closes a full-day closure, even one the office also marked open', () => {
    const laborDay = calendar({ closedDates: new Set(['2026-09-07']), openDates: new Set(['2026-09-07']) });
    expect(isOfficeDay('2026-09-07', laborDay)).toBe(false);
    expect(isOfficeDay('2026-09-08', laborDay)).toBe(true);
  });
  it('opens only the Saturday the office marked open', () => {
    const c = calendar({ openDates: new Set(['2026-06-06']) });
    expect(isOfficeDay('2026-06-06', c)).toBe(true);
    expect(isOfficeDay('2026-06-13', c)).toBe(false);
  });
  it('lets an office set its own weekly pattern', () => {
    const c = calendar({ openWeekdays: new Set([2, 3, 4, 6]) });
    expect(isOfficeDay('2026-06-08', c)).toBe(false); // Monday
    expect(isOfficeDay('2026-06-06', c)).toBe(true); // Saturday
  });
  it('reads the weekday on the days the clocks change', () => {
    expect(weekdayOf('2026-03-08')).toBe(0);
    expect(weekdayOf('2026-11-01')).toBe(0);
    expect(weekdayOf('2026-03-09')).toBe(1);
  });
});

describe('adjacentDay', () => {
  it('steps over the weekend and a holiday', () => {
    expect(adjacentDay('2026-06-08', -1, open(EMPTY_OFFICE_CALENDAR))).toBe('2026-06-05');
    expect(adjacentDay('2026-06-05', 1, open(EMPTY_OFFICE_CALENDAR))).toBe('2026-06-08');
    const laborDay = calendar({ closedDates: new Set(['2026-09-07']) });
    expect(adjacentDay('2026-09-08', -1, open(laborDay))).toBe('2026-09-04');
    expect(adjacentDay('2026-09-04', 1, open(laborDay))).toBe('2026-09-08');
  });
  it('crosses a whole closed week', () => {
    const week = calendar({ closedDates: new Set(['2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-25']) });
    expect(adjacentDay('2026-12-28', -1, open(week))).toBe('2026-12-18');
  });
  it('stops at the limit and reports nothing within reach', () => {
    expect(adjacentDay('2026-06-08', 1, open(EMPTY_OFFICE_CALENDAR), 0)).toBeNull();
    expect(adjacentDay('2026-06-05', 1, open(EMPTY_OFFICE_CALENDAR), 2)).toBeNull();
    expect(adjacentDay('2026-06-05', 1, open(EMPTY_OFFICE_CALENDAR), 3)).toBe('2026-06-08');
    expect(adjacentDay('2026-06-08', -1, () => false)).toBeNull();
  });
});
