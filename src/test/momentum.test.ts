import { describe, expect, it } from 'vitest';
import {
  bestStreak,
  currentStreak,
  dayState,
  expandDateRange,
  recentDays,
  shiftDate,
  type AttendanceFacts,
  type StreakInput,
} from '@/lib/momentum';

const TODAY = '2026-07-30';

/** A normal scheduled work day. */
const workDay: AttendanceFacts = {
  is_scheduled_day: true,
  office_closed: false,
  has_day_off: false,
};

function build(opts: {
  workDates: string[];
  doneDates?: string[];
  ptoDates?: string[];
  closureDates?: string[];
  overrides?: Record<string, AttendanceFacts>;
  dailyItemCount?: number;
}): StreakInput {
  const attendance = new Map<string, AttendanceFacts>();
  for (const d of opts.workDates) attendance.set(d, workDay);
  for (const [d, facts] of Object.entries(opts.overrides ?? {})) attendance.set(d, facts);
  return {
    today: TODAY,
    attendance,
    ptoDates: new Set(opts.ptoDates ?? []),
    closureDates: new Set(opts.closureDates ?? []),
    dailyItemCount: opts.dailyItemCount ?? 2,
    doneByDate: new Map((opts.doneDates ?? []).map(d => [d, opts.dailyItemCount ?? 2])),
  };
}

/** The last `n` days, newest first. */
const back = (n: number) => Array.from({ length: n }, (_, i) => shiftDate(TODAY, -i));

describe('streak day states', () => {
  it('counts a fully checked scheduled day as complete', () => {
    const input = build({ workDates: [TODAY], doneDates: [TODAY] });
    expect(dayState(TODAY, input)).toBe('complete');
  });

  it('leaves today pending when items are still open', () => {
    const input = build({ workDates: [TODAY] });
    expect(dayState(TODAY, input)).toBe('pending');
  });

  it('counts a past scheduled day with open items as missed', () => {
    const y = shiftDate(TODAY, -1);
    expect(dayState(y, build({ workDates: [y] }))).toBe('missed');
  });

  it('pauses on an approved day off', () => {
    const d = shiftDate(TODAY, -1);
    const input = build({
      workDates: [],
      overrides: { [d]: { ...workDay, has_day_off: true } },
    });
    expect(dayState(d, input)).toBe('paused');
  });

  it('pauses on an office closure', () => {
    const d = shiftDate(TODAY, -1);
    const input = build({
      workDates: [],
      overrides: { [d]: { ...workDay, office_closed: true } },
    });
    expect(dayState(d, input)).toBe('paused');
  });

  it('pauses on verified PTO even when attendance still says scheduled', () => {
    const d = shiftDate(TODAY, -1);
    const input = build({ workDates: [d], ptoDates: [d] });
    expect(dayState(d, input)).toBe('paused');
  });

  it('pauses on a recorded closure even when attendance still says scheduled', () => {
    const d = shiftDate(TODAY, -1);
    const input = build({ workDates: [d], closureDates: [d] });
    expect(dayState(d, input)).toBe('paused');
  });

  it('pauses on a non-scheduled day', () => {
    const d = shiftDate(TODAY, -1);
    const input = build({
      workDates: [],
      overrides: { [d]: { ...workDay, is_scheduled_day: false } },
    });
    expect(dayState(d, input)).toBe('paused');
  });

  it('pauses when the office has no daily checklist items to complete', () => {
    const input = build({ workDates: [TODAY], dailyItemCount: 0 });
    expect(dayState(TODAY, input)).toBe('paused');
  });
});

describe('streaks pause rather than break', () => {
  it('carries the streak across approved PTO', () => {
    const days = back(6); // today .. -5
    const [d0, d1, pto, d3, d4, d5] = days;
    const input = build({
      workDates: [d0, d1, pto, d3, d4, d5],
      doneDates: [d0, d1, d3, d4, d5],
      ptoDates: [pto],
    });
    expect(currentStreak(input)).toBe(5);
  });

  it('carries the streak across an approved day off', () => {
    const [d0, d1, off, d3] = back(4);
    const input = build({
      workDates: [d0, d1, d3],
      doneDates: [d0, d1, d3],
      overrides: { [off]: { ...workDay, has_day_off: true } },
    });
    expect(currentStreak(input)).toBe(3);
  });

  it('carries the streak across an office closure', () => {
    const [d0, d1, closed, d3] = back(4);
    const input = build({
      workDates: [d0, d1, d3],
      doneDates: [d0, d1, d3],
      closureDates: [closed],
    });
    expect(currentStreak(input)).toBe(3);
  });

  it('carries the streak across a weekend of non-scheduled days', () => {
    const [d0, sat, sun, d3] = back(4);
    const input = build({
      workDates: [d0, d3],
      doneDates: [d0, d3],
      overrides: {
        [sat]: { ...workDay, is_scheduled_day: false },
        [sun]: { ...workDay, is_scheduled_day: false },
      },
    });
    expect(currentStreak(input)).toBe(2);
  });

  it('breaks only on a missed scheduled work day', () => {
    const [d0, d1, missed, d3] = back(4);
    const input = build({
      workDates: [d0, d1, missed, d3],
      doneDates: [d0, d1, d3],
    });
    expect(currentStreak(input)).toBe(2);
  });

  it('does not punish an unfinished today', () => {
    const [d0, d1, d2] = back(3);
    const input = build({ workDates: [d0, d1, d2], doneDates: [d1, d2] });
    expect(dayState(d0, input)).toBe('pending');
    expect(currentStreak(input)).toBe(2);
  });

  it('keeps the best streak after a break', () => {
    const days = back(8);
    const done = [days[6], days[5], days[4], days[3]]; // four in a row, then a miss
    const input = build({ workDates: days, doneDates: [...done, days[1], days[0]] });
    expect(currentStreak(input)).toBe(2);
    expect(bestStreak(input)).toBe(4);
  });

  it('reports zero when nothing has been completed', () => {
    expect(currentStreak(build({ workDates: back(5) }))).toBe(0);
  });
});

describe('date helpers', () => {
  it('walks dates across month boundaries', () => {
    expect(shiftDate('2026-08-01', -1)).toBe('2026-07-31');
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('expands an inclusive PTO range', () => {
    expect(expandDateRange('2026-07-29', '2026-08-01')).toEqual([
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
    ]);
  });

  it('returns the recent dot strip oldest first', () => {
    const input = build({ workDates: back(14), doneDates: back(14) });
    const days = recentDays(input, 14);
    expect(days).toHaveLength(14);
    expect(days[0].date).toBe(shiftDate(TODAY, -13));
    expect(days[13].date).toBe(TODAY);
  });
});
