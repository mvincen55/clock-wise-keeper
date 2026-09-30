import type { PerformanceData } from './home-performance';
import {
  DEFINITIONS, addMonthsToStart, dayPoints, formatRange, monthEndOf,
  type Period, type SeriesSource,
} from './performance-series';
import { countOfficeDays, isOfficeDay } from './office-days';
import { shiftDate } from './time-utils';

export type DashboardPeriod = 'month' | 'year';
export type DashboardMetric = 'collections' | 'production';
export type YearResult = {
  year: number;
  start: string;
  end: string;
  cents: number | null;
  complete: boolean;
  officeDays: number | null;
  recordedDays: number;
  averageCents: number | null;
  sourceDates: boolean;
  coverage: string;
  points: { date: string; cents: number | null; complete: boolean }[];
};
export type MetricOverview = {
  metric: DashboardMetric;
  label: string;
  years: YearResult[];
  deltaCents: number | null;
  deltaFraction: number | null;
  dailyDeltaFraction: number | null;
  targetCents: number;
  targetLabel: string;
  expectedCents: number | null;
  projectedCents: number | null;
  neededPerDayCents: number | null;
  remainingDays: number | null;
};
export type DashboardPerformance = {
  kind: DashboardPeriod;
  period: Period;
  cutoff: string;
  source: SeriesSource;
  availableSources: SeriesSource[];
  metrics: MetricOverview[];
  newPatients: { value: number | null; prior: number | null; delta: number | null; complete: boolean } | null;
};

export function dateInYear(date: string, year: number): string {
  const month = date.slice(5, 7);
  const last = Number(monthEndOf(`${year}-${month}-01`).slice(8));
  return `${year}-${month}-${String(Math.min(Number(date.slice(8)), last)).padStart(2, '0')}`;
}

export function dashboardDate(date: string, monthOnly = false): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short', ...(monthOnly ? {} : { day: 'numeric' as const }), timeZone: 'UTC',
  });
}

function sourceAvailable(data: PerformanceData, start: string, end: string, source: SeriesSource): boolean {
  if (end < start) return false;
  if (source === 'closeouts') return data.sources.closeouts.some(d => d.date >= start && d.date <= end);
  if (data.access !== 'admin') return false;
  return data.sources.reportDays.some(d => d.date >= start && d.date <= end)
    || !!data.sources.reportMonths?.some(m => m.month >= start.slice(0, 7) && m.month <= end.slice(0, 7));
}

/** One source and one metric throughout. Monthly summaries replace, never add to, their daily detail. */
function readRange(data: PerformanceData, start: string, end: string, source: SeriesSource, metric: DashboardMetric) {
  const calendar = data.calendar;
  let cents: number | null = null;
  let complete = end >= start && (source === 'closeouts' ? data.sources.closeoutsState : data.sources.reportState) === 'ok';
  let recordedDays = 0;
  let sourceDates = false;
  let fullMonths = 0;
  let months = 0;
  for (let month = `${start.slice(0, 7)}-01`; month <= end && end >= start; month = addMonthsToStart(month, 1)) {
    months += 1;
    const a = month < start ? start : month;
    const b = monthEndOf(month) > end ? end : monthEndOf(month);
    const summary = source === 'report_history' && a === month && b === monthEndOf(month)
      ? data.sources.reportMonths?.find(m => m.month === month.slice(0, 7) && m.coverage === 'full_calendar_month')
      : undefined;
    if (summary) {
      cents = (cents ?? 0) + (metric === 'production' ? summary.production_cents : summary.collections_cents);
      fullMonths += 1;
      recordedDays += data.sources.reportDays.filter(d => d.date >= a && d.date <= b).length;
      continue;
    }
    const points = dayPoints({ start: a, end: b }, source, data.sources);
    const value = (p: typeof points[number]) => metric === 'production' ? p.primaryCents : p.secondaryCents;
    const recorded = points.filter(p => value(p) !== null);
    if (recorded.length) cents = (cents ?? 0) + recorded.reduce((sum, p) => sum + (value(p) ?? 0), 0);
    recordedDays += recorded.length;
    const expected = calendar ? points.filter(p => isOfficeDay(p.date, calendar)) : [];
    const sliceComplete = !!calendar && expected.every(p => value(p) !== null)
      && (source !== 'closeouts' || recorded.every(p => p.status === 'sealed'));
    complete = complete && sliceComplete;
    if (sliceComplete) fullMonths += 1;
  }
  if (source === 'report_history') {
    sourceDates = data.sources.reportDays.some(d => d.date >= start && d.date <= end && d.dateBasis === 'source_date');
  }
  const officeDays = calendar && end >= start ? countOfficeDays(start, end, calendar) : null;
  complete = complete && cents !== null;
  const coverage = cents === null ? 'Not recorded'
    : complete ? 'Records complete'
      : months > 1 ? `Partial records · ${fullMonths} of ${months} months complete`
        : !calendar ? 'Coverage unknown · office calendar unavailable' : 'Partial records';
  return { cents, complete, officeDays, recordedDays, sourceDates, coverage };
}

function readYear(data: PerformanceData, start: string, end: string, source: SeriesSource, metric: DashboardMetric, kind: DashboardPeriod, year: number, empty: boolean): YearResult {
  const a = dateInYear(start, year), b = dateInYear(end, year);
  if (empty) return { year, start: a, end: a, cents: null, complete: false, officeDays: 0, recordedDays: 0, averageCents: null, sourceDates: false, coverage: 'No completed days yet', points: [] };
  const result = readRange(data, a, b, source, metric);
  const points: YearResult['points'] = [];
  if (kind === 'year') {
    for (let month = a; month <= b; month = addMonthsToStart(month, 1)) {
      const last = monthEndOf(month) > b ? b : monthEndOf(month);
      const slice = readRange(data, month, last, source, metric);
      points.push({ date: last, cents: slice.cents, complete: slice.complete });
    }
  } else {
    let running = 0, hasValue = false, broken = false;
    for (const point of dayPoints({ start: a, end: b }, source, data.sources)) {
      const value = metric === 'production' ? point.primaryCents : point.secondaryCents;
      if (value !== null) { running += value; hasValue = true; }
      const closed = !!data.calendar && !isOfficeDay(point.date, data.calendar);
      if (value === null && !closed) broken = true;
      points.push({ date: point.date, cents: value !== null || (closed && hasValue) ? running : null, complete: !broken && (source !== 'closeouts' || point.status === 'sealed' || closed) });
    }
    // A full-month summary is one known endpoint, never fabricated daily history.
    if (source === 'report_history' && a.endsWith('-01') && b === monthEndOf(b)) {
      const summary = data.sources.reportMonths?.find(m => m.month === a.slice(0, 7) && m.coverage === 'full_calendar_month');
      if (summary && result.complete && points.length) {
        const dailyTotal = points.at(-1)?.cents;
        if (dailyTotal !== result.cents || points.some(p => !p.complete)) points.forEach((p, i) => { p.cents = i === points.length - 1 ? result.cents : null; p.complete = i === points.length - 1; });
      }
    }
  }
  return { year, start: a, end: b, ...result, averageCents: result.complete && result.officeDays && result.cents !== null ? Math.round(result.cents / result.officeDays) : null, points };
}

export function buildDashboardPerformance(data: PerformanceData, kind: DashboardPeriod, preferred?: SeriesSource | null): DashboardPerformance {
  const year = Number(data.today.slice(0, 4));
  const start = kind === 'year' ? `${year}-01-01` : `${data.today.slice(0, 7)}-01`;
  const fullEnd = kind === 'year' ? `${year}-12-31` : monthEndOf(data.today);
  // A saved draft today cannot make an incomplete day look like a finished one.
  const sealedToday = data.sources.closeouts.some(d => d.date === data.today && !!d.sealedAt);
  const cutoff = sealedToday ? data.today : shiftDate(data.today, -1);
  const availableSources = (['closeouts', 'report_history'] as const).filter(s => sourceAvailable(data, start, cutoff, s));
  // Start with the source that can actually show more years, provided it
  // also has a current-period value. The source remains explicit and is
  // never blended; a partial monthly import cannot win with an empty total.
  const score = (source: SeriesSource) => {
    const values = [year, year - 1, year - 2].map(y => readRange(data, dateInYear(start, y), dateInYear(cutoff, y), source, data.visibility.collections ? 'collections' : 'production'));
    return values[0].cents === null ? -1 : values.filter(v => v.cents !== null).length;
  };
  const best = availableSources.reduce<SeriesSource | null>((best, candidate) => best === null || score(candidate) > score(best) ? candidate : best, null);
  const source = preferred && availableSources.includes(preferred) ? preferred : best ?? 'closeouts';
  const period: Period = { preset: kind === 'month' ? 'this_month' : 'year_to_date', start, end: cutoff, fullEnd, partial: cutoff < fullEnd, label: kind === 'month' ? 'This month' : 'Year to date', rangeLabel: cutoff >= start ? formatRange(start, cutoff) : 'No completed days yet' };
  const visible = (['collections', 'production'] as const).filter(m => data.visibility[m]);
  const metrics = visible.map((metric): MetricOverview => {
    const years = [year, year - 1, year - 2].map(y => readYear(data, start, cutoff, source, metric, kind, y, cutoff < start));
    const [current, prior] = years;
    const comparable = current.complete && prior.complete && !current.sourceDates && !prior.sourceDates;
    const deltaCents = comparable && current.cents !== null && prior.cents !== null ? current.cents - prior.cents : null;
    const targetCents = data.targets[metric === 'production' ? 'productionCents' : 'collectionsCents'] * (kind === 'year' ? 12 : 1);
    const allDays = data.calendar ? countOfficeDays(start, fullEnd, data.calendar) : null;
    const remainingDays = allDays !== null && current.officeDays !== null ? Math.max(0, allDays - current.officeDays) : null;
    const canProject = current.complete && !current.sourceDates && current.cents !== null && !!current.officeDays && !!allDays && targetCents > 0;
    return {
      metric, label: metric === 'collections' ? DEFINITIONS[source].secondaryLabel : DEFINITIONS[source].primaryLabel,
      years, deltaCents,
      deltaFraction: deltaCents !== null && prior.cents !== null && prior.cents > 0 ? deltaCents / prior.cents : null,
      dailyDeltaFraction: comparable && current.averageCents !== null && prior.averageCents !== null && prior.averageCents > 0 ? (current.averageCents - prior.averageCents) / prior.averageCents : null,
      targetCents, targetLabel: kind === 'year' ? 'Annualized monthly target' : 'Monthly goal',
      expectedCents: canProject ? Math.round(targetCents * current.officeDays! / allDays!) : null,
      projectedCents: canProject ? Math.round(current.cents! / current.officeDays! * allDays!) : null,
      neededPerDayCents: canProject && remainingDays ? Math.ceil(Math.max(0, targetCents - current.cents!) / remainingDays) : null,
      remainingDays,
    };
  });
  let newPatients: DashboardPerformance['newPatients'] = null;
  if (data.visibility.newPatients) {
    const read = (y: number) => {
      const a = dateInYear(start, y), b = dateInYear(cutoff, y);
      const rows = cutoff < start ? [] : data.newPatients.filter(d => d.date >= a && d.date <= b && d.seen !== null);
      const expected = cutoff >= start && data.calendar ? countOfficeDays(a, b, data.calendar) : null;
      const covered = data.calendar ? new Set(rows.filter(d => isOfficeDay(d.date, data.calendar!)).map(d => d.date)).size : 0;
      return { value: rows.length ? rows.reduce((s, d) => s + d.seen!, 0) : null, complete: data.sources.closeoutsState === 'ok' && rows.length > 0 && expected !== null && covered >= expected };
    };
    const now = read(year), prior = read(year - 1);
    newPatients = { value: now.value, prior: prior.value, complete: now.complete, delta: now.complete && prior.complete && now.value !== null && prior.value !== null ? now.value - prior.value : null };
  }
  return { kind, period, cutoff, source, availableSources, metrics, newPatients };
}
