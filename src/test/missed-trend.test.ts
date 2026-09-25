/**
 * missed-trend — cancellations and no-shows with an explicit source rule:
 * Dentrix postings first, Close the Day counts otherwise, never both; the
 * unassigned department stays visible as unassigned; unrecorded buckets are
 * gaps; comparisons need comparable coverage.
 */
import { describe, expect, it } from 'vitest';
import { chooseMissedSource, missedGranularityFor, missedSeries, type CloseoutMissedDay, type MissedEventLite } from '@/lib/missed-trend';
import { periodFor } from '@/lib/performance-series';

const ev = (date: string, code: '9100' | '9101', department: string): MissedEventLite => ({ business_date: date, code, department });
const co = (date: string, over: Partial<CloseoutMissedDay> = {}): CloseoutMissedDay => ({
  date, recorded: true, hygieneCancellations: 1, hygieneNoShows: 0, doctorCancellations: 0, doctorNoShows: 1, ...over,
});
const today = '2026-09-24';
const month = periodFor('this_month', today);

describe('source precedence', () => {
  it('postings win when any fall in the period; closeouts otherwise; neither is summed with the other', () => {
    expect(chooseMissedSource(month, [ev('2026-09-02', '9100', 'doctor')], [co('2026-09-03')])).toBe('postings');
    const s = missedSeries({ period: month, today, events: [ev('2026-09-02', '9100', 'doctor')], closeouts: [co('2026-09-03')] })!;
    expect(s.source).toBe('postings');
    expect(s.totals).toEqual({ cancellations: 0, noShows: 1, doctor: 1, hygiene: 0, unassigned: 0, total: 1 });
    expect(chooseMissedSource(month, [ev('2026-08-02', '9100', 'doctor')], [co('2026-09-03')])).toBe('closeouts');
    expect(chooseMissedSource(month, [], [co('2026-09-03', { recorded: false })])).toBeNull();
  });
  it('closeout counts only read days that recorded them', () => {
    const s = missedSeries({ period: month, today, events: [], closeouts: [co('2026-09-03'), co('2026-09-04', { recorded: false, hygieneCancellations: 9 })] })!;
    expect(s.source).toBe('closeouts');
    expect(s.totals.total).toBe(2);
    expect(s.recordedDays).toBe(1);
  });
});

describe('categories and buckets', () => {
  it('keeps unassigned postings apart from doctor and hygiene', () => {
    const s = missedSeries({ period: month, today, events: [ev('2026-09-02', '9101', 'other'), ev('2026-09-02', '9101', 'hygiene'), ev('2026-09-09', '9100', 'doctor')], closeouts: [] })!;
    expect(s.totals).toEqual({ cancellations: 2, noShows: 1, doctor: 1, hygiene: 1, unassigned: 1, total: 3 });
  });
  it('a month buckets by week; a week by day; a year by month', () => {
    expect(missedGranularityFor(periodFor('this_week', today))).toBe('day');
    expect(missedGranularityFor(month)).toBe('week');
    expect(missedGranularityFor(periodFor('last_12_months', today))).toBe('month');
  });
  it('an unrecorded week is a gap, not a row of zeros', () => {
    const s = missedSeries({ period: month, today, events: [ev('2026-09-02', '9101', 'hygiene')], closeouts: [] })!;
    expect(s.buckets[0]).toMatchObject({ start: '2026-09-01', end: '2026-09-06', recorded: true, cancellations: 1 });
    expect(s.buckets[1]).toMatchObject({ start: '2026-09-07', end: '2026-09-13', recorded: false, total: 0 });
    expect(s.buckets[s.buckets.length - 1].current).toBe(true);
  });
});

describe('comparisons', () => {
  it('postings compare against the same elapsed days of the prior period', () => {
    const s = missedSeries({ period: month, today, events: [ev('2026-09-02', '9101', 'hygiene'), ev('2026-08-05', '9100', 'doctor'), ev('2026-08-28', '9100', 'doctor')], closeouts: [] })!;
    expect(s.comparison).toMatchObject({ start: '2026-08-01', end: '2026-08-24', comparable: true });
    expect(s.comparison.totals.total).toBe(1); // Aug 28 is outside the comparable span
  });
  it('postings with no history before the period do not claim a comparison', () => {
    const s = missedSeries({ period: month, today, events: [ev('2026-09-02', '9101', 'hygiene')], closeouts: [] })!;
    expect(s.comparison.comparable).toBe(false);
    expect(s.comparison.reason).toMatch(/No postings recorded before/);
  });
  it('closeout counts need comparable recorded coverage on both sides', () => {
    const cur = Array.from({ length: 6 }, (_, i) => co(`2026-09-0${i + 1}`));
    const prior = Array.from({ length: 6 }, (_, i) => co(`2026-08-0${i + 1}`, { doctorNoShows: 0 }));
    const s = missedSeries({ period: month, today, events: [], closeouts: [...cur, ...prior] })!;
    expect(s.comparison.comparable).toBe(true);
    expect(s.comparison.totals.total).toBe(6);
    const thin = missedSeries({ period: month, today, events: [], closeouts: [...cur, prior[0]] })!;
    expect(thin.comparison.comparable).toBe(false);
    expect(thin.comparison.reason).toMatch(/Only 1 day recorded/);
  });
});
