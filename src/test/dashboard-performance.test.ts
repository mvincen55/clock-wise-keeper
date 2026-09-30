import { describe, expect, it } from 'vitest';
import { buildDashboardPerformance, dateInYear } from '@/lib/dashboard-performance';
import type { PerformanceData } from '@/lib/home-performance';
import type { CloseoutDay, ReportDay } from '@/lib/performance-series';
import { ownerFixture } from '@/components/dashboard/fixtures';

const calendar = { closedDates: new Set<string>(), openDates: new Set<string>(), openWeekdays: new Set([0, 1, 2, 3, 4, 5, 6]) };
const closeout = (date: string, cents = 10000, sealed = true): CloseoutDay => ({ date, collectionsCents: cents, productionCents: cents * 2, sealedAt: sealed ? `${date}T22:00:00Z` : null });
const report = (date: string, cents = 90000): ReportDay => ({ date, postedChargesCents: cents * 2, receiptsCents: cents, packageStart: date, packageEnd: date, importedAt: `${date}T22:00:00Z`, dateBasis: 'entry_date' });
const data = (over: Partial<PerformanceData> = {}): PerformanceData => ({
  ...ownerFixture.performance!, today: '2026-03-03', calendar,
  sources: { closeouts: [closeout('2026-03-01'), closeout('2026-03-02'), closeout('2025-03-01', 5000), closeout('2025-03-02', 5000)], closeoutsState: 'ok', reportDays: [], reportMonths: [], reportState: 'ok' },
  targets: { collectionsCents: 310000, productionCents: 620000, newPatientsSeen: 40 }, newPatients: [], ...over,
});
const metric = (d: PerformanceData, kind: 'month' | 'year' = 'month') => buildDashboardPerformance(d, kind).metrics[0];

describe('same-period year comparisons', () => {
  it('compares the same completed dates, shows office-day averages and the real target', () => {
    const model = buildDashboardPerformance(data(), 'month');
    const m = model.metrics[0];
    expect(model.period).toMatchObject({ start: '2026-03-01', end: '2026-03-02', fullEnd: '2026-03-31' });
    expect(m.years.map(y => y.cents)).toEqual([20000, 10000, null]);
    expect(m.deltaFraction).toBe(1);
    expect(m.years[0].averageCents).toBe(10000);
    expect(m.expectedCents).toBe(20000);
    expect(m.projectedCents).toBe(310000);
    expect(m.neededPerDayCents).toBe(10000);
    expect(m.goalPoints).toEqual([{ date: '2026-03-01', cents: 10000 }, { date: '2026-03-02', cents: 20000 }]);
  });
  it('includes today only after its closeout is sealed', () => {
    const d = data(); d.sources.closeouts.push(closeout(d.today, 30000, false));
    expect(metric(d).years[0].cents).toBe(20000);
    d.sources.closeouts.at(-1)!.sealedAt = '2026-03-03T22:00:00Z';
    expect(metric(d).years[0].cents).toBe(50000);
  });
  it('does not turn missing history into a zero or a growth percentage', () => {
    const d = data(); d.sources.closeouts = d.sources.closeouts.filter(row => row.date.startsWith('2026'));
    expect(metric(d)).toMatchObject({ deltaCents: null, deltaFraction: null });
    expect(metric(d).years[1]).toMatchObject({ cents: null, averageCents: null, complete: false });
  });
  it('withholds growth and projections when even one office day is missing', () => {
    const d = data(); d.sources.closeouts = d.sources.closeouts.filter(row => row.date !== '2026-03-01');
    const m = metric(d);
    expect(m.years[0]).toMatchObject({ cents: 10000, complete: false, averageCents: null });
    expect(m).toMatchObject({ deltaFraction: null, deltaCents: null, projectedCents: null, neededPerDayCents: null });
    expect(m.years[0].points[0].cents).toBeNull();
  });
  it('an unsealed earlier record is partial, not a completed day for forecasting', () => {
    const d = data(); d.sources.closeouts[0].sealedAt = null;
    expect(metric(d).projectedCents).toBeNull();
    expect(metric(d).years[0].complete).toBe(false);
  });
  it('a failed source with cached rows cannot claim complete coverage', () => {
    const d = data(); d.sources.closeoutsState = 'error';
    expect(metric(d).deltaFraction).toBeNull();
    expect(metric(d).projectedCents).toBeNull();
  });
  it('uses closures in the denominator and does not count them as missing days', () => {
    const d = data(); d.calendar = { ...calendar, closedDates: new Set(['2026-03-01']) }; d.sources.closeouts = d.sources.closeouts.filter(r => r.date !== '2026-03-01');
    expect(metric(d).years[0]).toMatchObject({ complete: true, officeDays: 1, averageCents: 10000 });
  });
  it('withholds pace if the office calendar could not be read', () => {
    expect(metric(data({ calendar: null }))).toMatchObject({ expectedCents: null, projectedCents: null, deltaFraction: null });
  });
  it('preserves a true zero and uses an absolute delta when last year was zero', () => {
    const d = data(); d.sources.closeouts.filter(r => r.date.startsWith('2025')).forEach(r => { r.collectionsCents = 0; });
    expect(metric(d)).toMatchObject({ deltaCents: 20000, deltaFraction: null });
    expect(metric(d).years[1].cents).toBe(0);
  });
  it('clamps leap day and has no completed-month data before the first closeout', () => {
    expect(dateInYear('2024-02-29', 2025)).toBe('2025-02-28');
    expect(dateInYear('2024-02-29', 2024)).toBe('2024-02-29');
    const first = data({ today: '2026-03-01' }); first.sources.closeouts = [];
    expect(metric(first).years.every(y => y.cents === null && y.points.length === 0)).toBe(true);
    expect(metric(data({ today: '2026-01-01' }), 'year').years.every(y => y.cents === null)).toBe(true);
  });
  it('labels the annualized target and never invents an annual goal or missing YTD months', () => {
    const m = metric(data(), 'year');
    expect(m.targetCents).toBe(310000 * 12);
    expect(m.targetLabel).toBe('Annualized monthly target');
    expect(m.years[0].points.map(p => p.cents)).toEqual([null, null, 20000]);
    expect(m.projectedCents).toBeNull();
    expect(m.goalPoints.map(p => p.cents)).toEqual([310000, 310000, 20000]);
  });
});

describe('report history remains one consistent source', () => {
  it('starts with imported history when it can show more years and has a current total', () => {
    const d = data(); d.sources.closeouts = [closeout('2026-03-01'), closeout('2026-03-02')];
    d.sources.reportDays = ['2026-03-01', '2026-03-02', '2025-03-01', '2025-03-02', '2024-03-01', '2024-03-02'].map(date => report(date));
    expect(buildDashboardPerformance(d, 'month').source).toBe('report_history');
    expect(buildDashboardPerformance(d, 'month', 'closeouts').source).toBe('closeouts');
  });
  it('keeps current closeouts when monthly imports cannot answer the partial month', () => {
    const d = data(); d.sources.reportMonths = ['2026-03', '2025-03', '2024-03'].map(month => ({ month, coverage: 'full_calendar_month', production_cents: 200000, collections_cents: 100000 }));
    expect(buildDashboardPerformance(d, 'month').source).toBe('closeouts');
  });
  it('does not silently mix report receipts into closeout collections', () => {
    const d = data(); d.sources.reportDays = [report('2026-03-01'), report('2026-03-02')];
    expect(metric(d).years[0].cents).toBe(20000);
    const imported = buildDashboardPerformance(d, 'month', 'report_history').metrics[0];
    expect(imported.label).toBe('Receipts'); expect(imported.years[0].cents).toBe(180000);
    expect(imported.years[1].cents).toBeNull();
  });
  it('monthly summaries replace daily detail, without inventing daily points', () => {
    const d = data({ today: '2026-01-31' }); d.sources.closeouts = [closeout(d.today)];
    d.sources.reportDays = [report('2026-01-01', 5000)];
    d.sources.reportMonths = [{ month: '2026-01', coverage: 'full_calendar_month', production_cents: 200000, collections_cents: 100000 }];
    const m = buildDashboardPerformance(d, 'month', 'report_history').metrics[0];
    expect(m.years[0].cents).toBe(100000);
    expect(m.years[0].complete).toBe(true);
    expect(m.years[0].points.filter(p => p.cents !== null)).toEqual([{ date: '2026-01-31', cents: 100000, complete: true }]);
    expect(buildDashboardPerformance(d, 'year', 'report_history').metrics[0].years[0].points[0].cents).toBe(100000);
  });
  it('never prorates a full-month import into an unfinished month', () => {
    const d = data(); d.sources.reportMonths = [{ month: '2026-03', coverage: 'full_calendar_month', production_cents: 200000, collections_cents: 100000 }];
    expect(buildDashboardPerformance(d, 'month', 'report_history').metrics[0].years[0].cents).toBeNull();
  });
  it('does not treat a partial-month import as complete', () => {
    const d = data({ today: '2026-01-31' }); d.sources.closeouts = [closeout(d.today)];
    d.sources.reportMonths = [{ month: '2026-01', coverage: 'partial', production_cents: 200000, collections_cents: 100000 }];
    expect(buildDashboardPerformance(d, 'month', 'report_history').metrics[0].years[0].complete).toBe(false);
  });
  it('unconfirmed source dates never produce a growth claim', () => {
    const d = data(); d.sources.reportDays = ['2026-03-01', '2026-03-02', '2025-03-01', '2025-03-02'].map(date => ({ ...report(date), dateBasis: 'source_date' }));
    expect(buildDashboardPerformance(d, 'month', 'report_history').metrics[0].deltaFraction).toBeNull();
  });
  it('members cannot select report history and hidden metrics are omitted', () => {
    const d = data({ access: 'member', visibility: { collections: true, production: false, newPatients: false } }); d.sources.reportDays = [report('2026-03-01')];
    const model = buildDashboardPerformance(d, 'month', 'report_history');
    expect(model.availableSources).toEqual(['closeouts']); expect(model.source).toBe('closeouts');
    expect(model.metrics.map(m => m.metric)).toEqual(['collections']); expect(model.newPatients).toBeNull();
  });
  it('new patient comparison counts seen patients and requires both periods to be complete', () => {
    const d = data(); d.newPatients = ['2026-03-01', '2026-03-02', '2025-03-01', '2025-03-02'].map(date => ({ date, seen: date.startsWith('2026') ? 3 : 1, scheduled: 999 }));
    d.newPatients.push({ date: '2024-03-01', seen: 5, scheduled: 999 });
    expect(buildDashboardPerformance(d, 'month').newPatients).toMatchObject({ value: 6, prior: 2, delta: 4, older: 5, priorComplete: true, olderComplete: false });
    d.newPatients.pop();
    d.newPatients.pop(); expect(buildDashboardPerformance(d, 'month').newPatients?.delta).toBeNull();
  });
});
