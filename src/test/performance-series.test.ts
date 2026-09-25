/**
 * performance-series — the one selector behind the Home chart and strip.
 * These rules keep the surfaces honest:
 *  - a day with no row is null, never zero, and never summed;
 *  - a closeout with $0 collected is a real zero;
 *  - closeouts and report history never blend into one total, and the
 *    precedence rule is explicit;
 *  - partial periods compare against the same elapsed span of the prior
 *    period, only when both sides have similar coverage;
 *  - two loaded packages that overlap never double-count a day;
 *  - money stays integer cents.
 */
import { describe, expect, it } from 'vitest';
import {
  BASE_PRESETS, availablePresets, bucketize, buildWindow, chooseSource, comparisonPeriodFor, dayPoints, defaultPreset,
  earliestRecordedDay, formatDelta, granularityFor, periodFor, totalsOf,
  type CloseoutDay, type PerformanceSources, type ReportDay,
} from '@/lib/performance-series';
import { reportDaysFrom } from '@/lib/report-history';
import type { PreparedReport } from '@/lib/prepared-report';

const closeout = (date: string, over: Partial<CloseoutDay> = {}): CloseoutDay => ({
  date, productionCents: 700_00, collectionsCents: 500_00, sealedAt: `${date}T22:00:00Z`, ...over,
});
const report = (date: string, over: Partial<ReportDay> = {}): ReportDay => ({
  date, postedChargesCents: 900_00, receiptsCents: 400_00, packageStart: '2026-07-01', packageEnd: '2026-08-31', importedAt: '2026-09-01T00:00:00Z', ...over,
});
const sources = (closeouts: CloseoutDay[], reportDays: ReportDay[] = []): PerformanceSources => ({
  closeouts, closeoutsState: 'ok', reportDays, reportState: 'ok',
});

describe('periods', () => {
  it('this week is Monday through today and partial until Sunday', () => {
    const p = periodFor('this_week', '2026-09-24'); // a Thursday
    expect(p).toMatchObject({ start: '2026-09-21', end: '2026-09-24', partial: true, fullEnd: '2026-09-27' });
  });
  it('this month runs from the 1st to today and says it is partial', () => {
    const p = periodFor('this_month', '2026-09-24');
    expect(p).toMatchObject({ start: '2026-09-01', end: '2026-09-24', partial: true, fullEnd: '2026-09-30', label: 'This month' });
    expect(p.rangeLabel).toBe('Sep 1 – Sep 24, 2026');
  });
  it('last month is a whole month, never partial', () => {
    expect(periodFor('last_month', '2026-09-24')).toMatchObject({ start: '2026-08-01', end: '2026-08-31', partial: false });
    expect(periodFor('last_month', '2026-01-10')).toMatchObject({ start: '2025-12-01', end: '2025-12-31' });
  });
  it('last 3 months starts two months back and includes today', () => {
    expect(periodFor('last_3_months', '2026-09-24')).toMatchObject({ start: '2026-07-01', end: '2026-09-24', partial: true });
  });
  it('longer presets appear only when recorded history exists before the shorter window', () => {
    expect(availablePresets('2026-09-24', null)).toEqual(BASE_PRESETS);
    expect(availablePresets('2026-09-24', '2026-08-03')).toEqual(BASE_PRESETS);
    expect(availablePresets('2026-09-24', '2026-05-12')).toEqual([...BASE_PRESETS, 'last_6_months']);
    expect(availablePresets('2026-09-24', '2025-11-01')).toEqual([...BASE_PRESETS, 'last_6_months', 'last_12_months']);
  });
});

describe('comparable prior periods', () => {
  it('a partial month compares with the same days of last month, never the whole month', () => {
    const c = comparisonPeriodFor(periodFor('this_month', '2026-09-24'));
    expect(c).toMatchObject({ start: '2026-08-01', end: '2026-08-24' });
  });
  it('caps the prior span at the prior month’s length', () => {
    const c = comparisonPeriodFor(periodFor('this_month', '2026-03-31'));
    expect(c).toMatchObject({ start: '2026-02-01', end: '2026-02-28' });
  });
  it('a whole month compares with the whole month before', () => {
    expect(comparisonPeriodFor(periodFor('last_month', '2026-09-24'))).toMatchObject({ start: '2026-07-01', end: '2026-07-31' });
  });
  it('this week compares with the same weekdays last week', () => {
    expect(comparisonPeriodFor(periodFor('this_week', '2026-09-24'))).toMatchObject({ start: '2026-09-14', end: '2026-09-17' });
  });
});

describe('source precedence', () => {
  const p = periodFor('this_month', '2026-09-24');
  it('closeouts win when the period has any', () => {
    const c = chooseSource(p, sources([closeout('2026-09-03')], [report('2026-09-03', { packageStart: '2026-09-01', packageEnd: '2026-09-30' })]));
    expect(c.source).toBe('closeouts');
    expect(c.available).toEqual(['closeouts', 'report_history']);
  });
  it('report history is the fallback, and both are offered as separate views, never blended', () => {
    const s = sources([closeout('2026-08-03')], [report('2026-09-03', { packageStart: '2026-09-01', packageEnd: '2026-09-30' })]);
    const c = chooseSource(p, s);
    expect(c.source).toBe('report_history');
    expect(c.available).toEqual(['report_history']);
    const w = buildWindow({ period: p, today: '2026-09-24', sources: s })!;
    expect(w.definitions.primaryLabel).toBe('Posted charges');
    expect(w.definitions.secondaryLabel).toBe('Receipts');
    expect(w.totals.primaryCents).toBe(900_00); // only the report day, never the August closeout
  });
  it('nothing in either source → null with an honest reason', () => {
    const c = chooseSource(p, sources([closeout('2026-08-03')]));
    expect(c.source).toBeNull();
    expect(c.reason).toMatch(/Nothing recorded/);
    expect(chooseSource(p, { ...sources([]), closeoutsState: 'error' }).reason).toMatch(/could not be read/);
  });
  it('a reader’s preferred source is honored only when it has days in the period', () => {
    const s = sources([closeout('2026-09-03')], [report('2026-09-03', { packageStart: '2026-09-01', packageEnd: '2026-09-30' })]);
    expect(buildWindow({ period: p, today: '2026-09-24', sources: s, preferredSource: 'report_history' })!.source).toBe('report_history');
    expect(buildWindow({ period: p, today: '2026-09-24', sources: sources([closeout('2026-09-03')]), preferredSource: 'report_history' })!.source).toBe('closeouts');
  });
});

describe('missing versus zero', () => {
  const p = periodFor('this_week', '2026-09-24');
  it('an unrecorded day is null with status not_recorded; a recorded $0 is a zero', () => {
    const pts = dayPoints(p, 'closeouts', sources([closeout('2026-09-21', { collectionsCents: 0 }), closeout('2026-09-23', { productionCents: null })]));
    expect(pts.map(x => x.status)).toEqual(['sealed', 'not_recorded', 'sealed', 'not_recorded']);
    expect(pts[0].secondaryCents).toBe(0);
    expect(pts[1].primaryCents).toBeNull();
    expect(pts[1].secondaryCents).toBeNull();
    // Production not entered on a recorded day: null for the series, but the day is still recorded.
    expect(pts[2].primaryCents).toBeNull();
    expect(pts[2].secondaryCents).toBe(500_00);
  });
  it('totals count recorded days per series and never add a gap as zero', () => {
    const t = totalsOf(dayPoints(p, 'closeouts', sources([closeout('2026-09-21'), closeout('2026-09-23', { productionCents: null, sealedAt: null })])));
    expect(t).toMatchObject({ primaryCents: 700_00, secondaryCents: 1000_00, primaryRecordedDays: 1, secondaryRecordedDays: 2, days: 4, sealedDays: 1, unsealedDays: 1, firstRecorded: '2026-09-21', lastRecorded: '2026-09-23' });
    expect(totalsOf(dayPoints(p, 'closeouts', sources([]))).primaryCents).toBeNull();
  });
  it('inside a package range a day without entries is "not in package", outside it "not recorded"', () => {
    const pts = dayPoints(periodFor('this_month', '2026-09-04'), 'report_history', sources([], [report('2026-09-01', { packageStart: '2026-09-01', packageEnd: '2026-09-02' })]));
    expect(pts.map(x => x.status)).toEqual(['report', 'not_in_package', 'not_recorded', 'not_recorded']);
  });
  it('cumulative totals run over recorded days only and start null before the first one', () => {
    const pts = dayPoints(p, 'closeouts', sources([closeout('2026-09-22'), closeout('2026-09-24', { productionCents: 300_00 })]));
    const b = bucketize(pts, 'day', '2026-09-24', true);
    expect(b.map(x => x.cumulativePrimaryCents)).toEqual([null, 700_00, 700_00, 1000_00]);
    expect(b[3].current).toBe(true);
    expect(b[2].status).toBe('not_recorded');
  });
});

describe('date-range filtering and buckets', () => {
  it('only rows inside the period are read', () => {
    const w = buildWindow({ period: periodFor('last_month', '2026-09-24'), today: '2026-09-24', sources: sources([closeout('2026-07-31'), closeout('2026-08-01'), closeout('2026-08-31'), closeout('2026-09-01')]) })!;
    expect(w.totals.primaryRecordedDays).toBe(2);
    expect(w.points[0].date).toBe('2026-08-01');
    expect(w.points[w.points.length - 1].date).toBe('2026-08-31');
  });
  it('a quarter buckets by week with recorded-day counts, a month stays daily', () => {
    expect(granularityFor(periodFor('this_month', '2026-09-24'))).toBe('day');
    expect(granularityFor(periodFor('last_3_months', '2026-09-24'))).toBe('week');
    const w = buildWindow({ period: periodFor('last_3_months', '2026-09-24'), today: '2026-09-24', sources: sources([closeout('2026-07-01'), closeout('2026-07-02'), closeout('2026-09-23')]) })!;
    expect(w.buckets[0]).toMatchObject({ start: '2026-07-01', end: '2026-07-05', primaryCents: 1400_00, primaryRecordedDays: 2, days: 5 });
    const empty = w.buckets[1];
    expect(empty.primaryCents).toBeNull();
    expect(empty.status).toBe('not_recorded');
    expect(w.buckets[w.buckets.length - 1].current).toBe(true);
  });
});

describe('partial-period comparisons', () => {
  const today = '2026-09-10';
  const p = periodFor('this_month', today);
  const days = (from: number, to: number, month: string, cents: number) =>
    Array.from({ length: to - from + 1 }, (_, i) => closeout(`${month}-${String(from + i).padStart(2, '0')}`, { productionCents: cents, collectionsCents: cents }));
  it('compares the same elapsed days, per recorded day, and reports the signed change', () => {
    const w = buildWindow({ period: p, today, sources: sources([...days(1, 8, '2026-09', 1000_00), ...days(1, 8, '2026-08', 800_00), ...days(20, 31, '2026-08', 5000_00)]) })!;
    expect(w.comparison).toMatchObject({ start: '2026-08-01', end: '2026-08-10', comparable: true });
    expect(w.comparison.totals.secondaryCents).toBe(6400_00); // Aug 20–31 never enters the comparison
    expect(w.comparison.currentSecondaryPerDay).toBe(1000_00);
    expect(w.comparison.priorSecondaryPerDay).toBe(800_00);
    expect(w.comparison.secondaryDelta).toBeCloseTo(0.25);
    expect(formatDelta(w.comparison.secondaryDelta!)).toBe('+25%');
    expect(formatDelta(-0.084)).toBe('−8%');
  });
  it('a span with fewer office days is not a drop: the delta is per recorded day', () => {
    // Seven September days against six August days at the same daily receipts.
    const w = buildWindow({ period: p, today, sources: sources([...days(1, 7, '2026-09', 1000_00), ...days(3, 8, '2026-08', 1000_00)]) })!;
    expect(w.totals.secondaryCents).toBe(7000_00);
    expect(w.comparison.totals.secondaryCents).toBe(6000_00);
    expect(w.comparison.secondaryDelta).toBe(0);
  });
  it('withholds the comparison when the prior span is thin or coverage differs', () => {
    const thin = buildWindow({ period: p, today, sources: sources([...days(1, 8, '2026-09', 1000_00), ...days(1, 2, '2026-08', 800_00)]) })!;
    expect(thin.comparison.comparable).toBe(false);
    expect(thin.comparison.reason).toMatch(/Only 2 days recorded for Aug 1 – Aug 10/);
    expect(thin.comparison.secondaryDelta).toBeNull();
    const uneven = buildWindow({ period: p, today, sources: sources([...days(1, 10, '2026-09', 1000_00), ...days(1, 5, '2026-08', 800_00)]) })!;
    expect(uneven.comparison.comparable).toBe(false);
    expect(uneven.comparison.reason).toMatch(/Coverage differs/);
    const none = buildWindow({ period: p, today, sources: sources(days(1, 8, '2026-09', 1000_00)) })!;
    expect(none.comparison.reason).toBe('Nothing recorded for Aug 1 – Aug 10, 2026.');
  });
  it('the coverage line names the recorded days, the data-through date, and unsealed days', () => {
    const w = buildWindow({ period: p, today, sources: sources([...days(1, 3, '2026-09', 1000_00), closeout('2026-09-04', { sealedAt: null })]) })!;
    expect(w.coverageLabel).toBe('4 of 10 days recorded · through Sep 4 · 1 not sealed');
    expect(w.period.partial).toBe(true);
  });
});

describe('report history adapter', () => {
  const pkg = (id: string, start: string, end: string, importedAt: string, rows: [string, number, number][]) => ({
    id, report_start: start, report_end: end, imported_at: importedAt,
    payload: { daily_financials_by_entry_date: rows.map(([date, c, r]) => ({ date, posted_charges_cents: c, recorded_payments_cents: r, credit_adjustments_cents: 0, charge_adjustments_cents: 0 })) } as unknown as PreparedReport,
  });
  it('two overlapping packages never double-count a day: the newest import wins it', () => {
    const days = reportDaysFrom([
      pkg('old', '2026-07-01', '2026-08-31', '2026-08-15T00:00:00Z', [['2026-08-03', 100, 50], ['2026-08-04', 100, 50]]),
      pkg('new', '2026-08-01', '2026-09-30', '2026-09-20T00:00:00Z', [['2026-08-04', 999, 1], ['2026-09-02', 200, 80]]),
    ]);
    expect(days.map(d => [d.date, d.postedChargesCents])).toEqual([['2026-08-03', 100], ['2026-08-04', 999], ['2026-09-02', 200]]);
    expect(days[1].packageStart).toBe('2026-08-01');
  });
  it('drops rows outside their package range or with non-integer cents', () => {
    const days = reportDaysFrom([pkg('p', '2026-08-01', '2026-08-31', '2026-09-01T00:00:00Z', [['2026-07-31', 100, 50], ['2026-08-02', 100.5, 50], ['2026-08-03', 100, 50]])]);
    expect(days.map(d => d.date)).toEqual(['2026-08-03']);
  });
  it('the earliest recorded day spans both sources', () => {
    expect(earliestRecordedDay(sources([closeout('2026-08-03')], [report('2026-07-02')]))).toBe('2026-07-02');
    expect(earliestRecordedDay(sources([]))).toBeNull();
  });
});

describe('the opening period', () => {
  it('is this month once it has a few recorded days, else the last three months, else this month', () => {
    const today = '2026-09-03';
    expect(defaultPreset(today, sources([closeout('2026-09-01'), closeout('2026-09-02'), closeout('2026-09-03')]))).toBe('this_month');
    expect(defaultPreset(today, sources([closeout('2026-09-02'), closeout('2026-08-28')]))).toBe('last_3_months');
    expect(defaultPreset(today, sources([]))).toBe('this_month');
  });
});
