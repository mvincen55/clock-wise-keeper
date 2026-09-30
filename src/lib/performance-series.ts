/**
 * Production and collections over time — the one selector behind the Home
 * performance chart, the period strip, and the observations.
 *
 * Pure functions of recorded rows. Two sources exist and they are never
 * blended into one total (docs/home-performance-redesign.md §2):
 *
 *   closeouts       deposit_logs — production entered at Close the Day and
 *                   receipts by deposit date (the office day);
 *   report_history  practice_report_imports — posted charges and receipts by
 *                   POSTING date from a loaded package.
 *
 * A day with no row is "not recorded" and stays null: it is never summed as
 * zero, never drawn as a bar, and never connected through. A closeout with
 * $0 collected is a real zero and renders as one. All money is integer cents.
 */
import { daysBetween, mondayOf, shiftDate } from '@/lib/time-utils';
import { daysInMonthOf } from '@/lib/metric-pace';
import { countOfficeDays, isOfficeDay, type OfficeDayCalendar } from '@/lib/office-days';

/* ------------------------------- periods ------------------------------- */

export type PeriodPreset =
  | 'this_week'
  | 'this_month'
  | 'year_to_date'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'last_12_months';

export type Period = {
  preset: PeriodPreset;
  /** Inclusive YYYY-MM-DD bounds. */
  start: string;
  end: string;
  /** "This month" */
  label: string;
  /** "Sep 1 – Sep 24, 2026" */
  rangeLabel: string;
  /** True while the period is still running; `fullEnd` is its natural end. */
  partial: boolean;
  fullEnd: string;
};

export const PRESET_LABELS: Record<PeriodPreset, string> = {
  this_week: 'This week',
  this_month: 'This month',
  year_to_date: 'Year to date',
  last_month: 'Last month',
  last_3_months: 'Last 3 months',
  last_6_months: 'Last 6 months',
  last_12_months: 'Last 12 months',
};

/** The presets every office gets; longer history is offered only when it exists. */
export const BASE_PRESETS: PeriodPreset[] = ['this_week', 'this_month', 'last_month', 'last_3_months'];

export function monthStartOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function monthEndOf(date: string): string {
  return `${date.slice(0, 7)}-${String(daysInMonthOf(date)).padStart(2, '0')}`;
}

/** First day of the month `offset` months from the month containing `date`. */
export function addMonthsToStart(date: string, offset: number): string {
  const [y, m] = date.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + offset, 1, 12));
  return d.toISOString().slice(0, 10);
}

function fmtDay(date: string, withYear = false): string {
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

/** "Sep 1 – Sep 24, 2026" (one day reads as a single date). */
export function formatRange(start: string, end: string): string {
  if (start === end) return fmtDay(start, true);
  return `${fmtDay(start)} – ${fmtDay(end, true)}`;
}

/** "September 2026" */
export function formatMonthLong(date: string): string {
  return new Date(`${date.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function periodFor(preset: PeriodPreset, today: string): Period {
  const build = (start: string, end: string, fullEnd: string): Period => ({
    preset,
    start,
    end,
    label: PRESET_LABELS[preset],
    rangeLabel: formatRange(start, end),
    partial: end < fullEnd,
    fullEnd,
  });
  switch (preset) {
    case 'this_week': {
      const start = mondayOf(today);
      return build(start, today, shiftDate(start, 6));
    }
    case 'this_month':
      return build(monthStartOf(today), today, monthEndOf(today));
    case 'year_to_date':
      return build(`${today.slice(0, 4)}-01-01`, today, `${today.slice(0, 4)}-12-31`);
    case 'last_month': {
      const start = addMonthsToStart(today, -1);
      return build(start, monthEndOf(start), monthEndOf(start));
    }
    case 'last_3_months':
      return build(addMonthsToStart(today, -2), today, monthEndOf(today));
    case 'last_6_months':
      return build(addMonthsToStart(today, -5), today, monthEndOf(today));
    case 'last_12_months':
      return build(addMonthsToStart(today, -11), today, monthEndOf(today));
  }
}

/**
 * The presets to offer: the four everyone gets, plus six and twelve months
 * only when a recorded day exists before the shorter window — a longer
 * preset must never open onto an empty chart.
 */
export function availablePresets(today: string, earliestRecorded: string | null): PeriodPreset[] {
  const presets = [...BASE_PRESETS];
  if (!earliestRecorded) return presets;
  if (earliestRecorded < periodFor('last_3_months', today).start) presets.push('last_6_months');
  if (earliestRecorded < periodFor('last_6_months', today).start) presets.push('last_12_months');
  return presets;
}

/**
 * The comparable slice of the prior period: the same elapsed span, so a
 * partial month is compared with the same days of last month, never with
 * a whole month.
 */
export function comparisonPeriodFor(period: Period): { start: string; end: string; rangeLabel: string } {
  const elapsed = daysBetween(period.start, period.end);
  let start: string;
  let end: string;
  switch (period.preset) {
    case 'year_to_date': {
      const priorYear = Number(period.start.slice(0, 4)) - 1;
      start = `${priorYear}-01-01`;
      const month = `${priorYear}-${period.end.slice(5, 7)}-01`;
      end = `${priorYear}-${period.end.slice(5, 7)}-${String(Math.min(Number(period.end.slice(8)), Number(monthEndOf(month).slice(8)))).padStart(2, '0')}`;
      break;
    }
    case 'this_week':
      start = shiftDate(period.start, -7);
      end = shiftDate(start, elapsed);
      break;
    case 'this_month': {
      start = addMonthsToStart(period.start, -1);
      end = shiftDate(start, elapsed);
      const last = monthEndOf(start);
      if (end > last) end = last;
      break;
    }
    case 'last_month': {
      start = addMonthsToStart(period.start, -1);
      end = monthEndOf(start);
      break;
    }
    case 'last_3_months':
      start = addMonthsToStart(period.start, -3);
      end = shiftDate(start, elapsed);
      break;
    case 'last_6_months':
      start = addMonthsToStart(period.start, -6);
      end = shiftDate(start, elapsed);
      break;
    case 'last_12_months':
      start = addMonthsToStart(period.start, -12);
      end = shiftDate(start, elapsed);
      break;
  }
  if (end >= period.start) end = shiftDate(period.start, -1);
  return { start, end, rangeLabel: formatRange(start, end) };
}

/* ------------------------------- sources ------------------------------- */

export type SeriesSource = 'closeouts' | 'report_history';

export type SourceState = 'ok' | 'loading' | 'error' | 'unauthorized' | 'not_loaded';

/** One office day from deposit_logs, reduced to what the series needs. */
export type CloseoutDay = {
  date: string;
  /** Null = production was not entered in that closeout. */
  productionCents: number | null;
  /** Receipts by tender; a real 0 is a recorded zero. */
  collectionsCents: number;
  sealedAt: string | null;
};

/** One posting day from a loaded report package (see report-history.ts). */
export type ReportDay = {
  date: string;
  postedChargesCents: number;
  receiptsCents: number;
  packageStart: string;
  packageEnd: string;
  importedAt: string;
  dateBasis?: 'entry_date' | 'source_date';
};

/**
 * One month's summary row from a loaded package. A `full` month is the
 * package's own authoritative total for that month: when the daily rows
 * under it are thin, the month total is still complete.
 */
/**
 * A whole-month total from a loaded report package, as report-history's
 * `reportMonthsFrom` selects it (newest import wins a month; explicit
 * comparison rows keep their approved source). Structural, so that richer
 * row fits without a copy.
 */
export type ReportMonth = {
  /** YYYY-MM */
  month: string;
  coverage: 'full_calendar_month' | 'partial';
  production_cents: number;
  collections_cents: number;
};

export type PerformanceSources = {
  closeouts: CloseoutDay[];
  closeoutsState: SourceState;
  reportDays: ReportDay[];
  reportState: SourceState;
  /** Monthly summaries from the loaded packages (newest import wins a month). */
  reportMonths?: ReportMonth[];
};

export type Completeness = 'complete' | 'partial' | 'unknown';

export type SourceChoice = {
  source: SeriesSource | null;
  /** Every source with at least one day in the period, in precedence order. */
  available: SeriesSource[];
  reason: string;
};

const inPeriod = (date: string, p: { start: string; end: string }) => date >= p.start && date <= p.end;

/**
 * The precedence rule, in one place: closeouts when the period has any;
 * otherwise report history when a package covers any day of it; otherwise
 * nothing. Both never feed one total.
 */
export function chooseSource(period: { start: string; end: string }, sources: PerformanceSources): SourceChoice {
  const available: SeriesSource[] = [];
  if (sources.closeouts.some(d => inPeriod(d.date, period))) available.push('closeouts');
  if (sources.reportDays.some(d => inPeriod(d.date, period))) available.push('report_history');
  if (available[0] === 'closeouts') {
    return { source: 'closeouts', available, reason: 'Close the Day closeouts exist for this period.' };
  }
  if (available[0] === 'report_history') {
    return { source: 'report_history', available, reason: 'No closeouts in this period; a loaded report package covers it.' };
  }
  const reason =
    sources.closeoutsState === 'loading' || sources.reportState === 'loading'
      ? 'Still reading.'
      : sources.closeoutsState === 'error'
        ? 'Closeouts could not be read.'
        : 'Nothing recorded for this period in Close the Day or report history.';
  return { source: null, available, reason };
}

/* -------------------------------- points ------------------------------- */

export type DayStatus =
  | 'sealed'          // closeout sealed
  | 'saved'           // closeout saved, not sealed
  | 'report'          // a posting day in a loaded package
  | 'not_in_package'  // inside a package's range with no entries for the day
  | 'not_recorded';   // nothing anywhere

export type DayPoint = {
  date: string;
  /** Series A: production (closeouts) or posted charges (report history). */
  primaryCents: number | null;
  /** Series B: collections (closeouts) or receipts (report history). */
  secondaryCents: number | null;
  status: DayStatus;
  source: SeriesSource | null;
};

export type SeriesDefinitions = {
  primaryLabel: string;
  secondaryLabel: string;
  primaryDefinition: string;
  secondaryDefinition: string;
  dateBasis: string;
  sourceLabel: string;
};

export const DEFINITIONS: Record<SeriesSource, SeriesDefinitions> = {
  closeouts: {
    primaryLabel: 'Production',
    secondaryLabel: 'Collections',
    primaryDefinition: 'Production entered at Close the Day for the office day.',
    secondaryDefinition:
      'Receipts recorded at Close the Day by deposit date. Receipts can pay older balances, so production minus collections is not unpaid treatment.',
    dateBasis: 'office day (deposit date)',
    sourceLabel: 'Close the Day',
  },
  report_history: {
    primaryLabel: 'Posted charges',
    secondaryLabel: 'Receipts',
    primaryDefinition: 'Charges by posting date from the loaded report package.',
    secondaryDefinition:
      'Receipts by posting date from the loaded report package. Receipts can pay older balances; this is not a collection rate on the period’s charges.',
    dateBasis: 'posting date (report package)',
    sourceLabel: 'Report history',
  },
};

/** Every calendar day of the period, from the chosen source only. */
export function dayPoints(period: { start: string; end: string }, source: SeriesSource, sources: PerformanceSources): DayPoint[] {
  const days = daysBetween(period.start, period.end) + 1;
  const points: DayPoint[] = [];
  if (source === 'closeouts') {
    const byDate = new Map(sources.closeouts.map(d => [d.date, d]));
    for (let i = 0; i < days; i += 1) {
      const date = shiftDate(period.start, i);
      const row = byDate.get(date);
      points.push(
        row
          ? {
              date,
              primaryCents: row.productionCents,
              secondaryCents: row.collectionsCents,
              status: row.sealedAt ? 'sealed' : 'saved',
              source: 'closeouts',
            }
          : { date, primaryCents: null, secondaryCents: null, status: 'not_recorded', source: null },
      );
    }
    return points;
  }
  const byDate = new Map(sources.reportDays.map(d => [d.date, d]));
  const ranges = sources.reportDays.map(d => ({ start: d.packageStart, end: d.packageEnd }));
  for (let i = 0; i < days; i += 1) {
    const date = shiftDate(period.start, i);
    const row = byDate.get(date);
    if (row) {
      points.push({ date, primaryCents: row.postedChargesCents, secondaryCents: row.receiptsCents, status: 'report', source: 'report_history' });
    } else if (ranges.some(r => inPeriod(date, r))) {
      points.push({ date, primaryCents: null, secondaryCents: null, status: 'not_in_package', source: null });
    } else {
      points.push({ date, primaryCents: null, secondaryCents: null, status: 'not_recorded', source: null });
    }
  }
  return points;
}

/* ------------------------------- buckets ------------------------------- */

export type Granularity = 'day' | 'week';

export type Bucket = {
  key: string;
  label: string;
  start: string;
  end: string;
  primaryCents: number | null;
  secondaryCents: number | null;
  /** Running totals over recorded days through this bucket; null before the first recorded day. */
  cumulativePrimaryCents: number | null;
  cumulativeSecondaryCents: number | null;
  primaryRecordedDays: number;
  secondaryRecordedDays: number;
  days: number;
  /** Status of a single day; for a week, the dominant recording status. */
  status: DayStatus;
  /** True for the bucket that contains today in a partial period. */
  current: boolean;
};

/** Daily bars for a month or less; weekly totals beyond that, so bars stay readable on a phone. */
export const DAILY_MAX_DAYS = 45;
export function granularityFor(period: { start: string; end: string }): Granularity {
  return daysBetween(period.start, period.end) + 1 > DAILY_MAX_DAYS ? 'week' : 'day';
}

/** A period reads as thin below this many recorded days. */
export const THIN_PERIOD_DAYS = 3;

/**
 * The preset Home opens on: this month once it has a few recorded days;
 * before that, the last three months, so the first days of a month do not
 * open onto a chart with one bar. Never a period with nothing in it when a
 * shorter one has something.
 */
export function defaultPreset(today: string, sources: PerformanceSources): PeriodPreset {
  const recordedIn = (p: { start: string; end: string }) =>
    sources.closeouts.filter(d => inPeriod(d.date, p)).length + sources.reportDays.filter(d => inPeriod(d.date, p)).length;
  if (recordedIn(periodFor('this_month', today)) >= THIN_PERIOD_DAYS) return 'this_month';
  if (recordedIn(periodFor('last_3_months', today)) > 0) return 'last_3_months';
  return 'this_month';
}

function weekLabel(start: string, end: string): string {
  return start === end ? fmtDay(start) : `${fmtDay(start)}–${fmtDay(end)}`;
}

function dominantStatus(points: DayPoint[]): DayStatus {
  const recorded = points.filter(p => p.primaryCents !== null || p.secondaryCents !== null);
  if (recorded.length === 0) return points.some(p => p.status === 'not_in_package') ? 'not_in_package' : 'not_recorded';
  if (recorded.every(p => p.status === 'sealed')) return 'sealed';
  if (recorded.some(p => p.status === 'report')) return 'report';
  return 'saved';
}

export function bucketize(points: DayPoint[], granularity: Granularity, today: string, partial: boolean): Bucket[] {
  const groups: DayPoint[][] = [];
  if (granularity === 'day') {
    for (const p of points) groups.push([p]);
  } else {
    let current: DayPoint[] = [];
    let currentKey = '';
    for (const p of points) {
      const key = mondayOf(p.date);
      if (key !== currentKey && current.length) {
        groups.push(current);
        current = [];
      }
      currentKey = key;
      current.push(p);
    }
    if (current.length) groups.push(current);
  }
  let cumA: number | null = null;
  let cumB: number | null = null;
  return groups.map(g => {
    const start = g[0].date;
    const end = g[g.length - 1].date;
    const a = g.filter(p => p.primaryCents !== null);
    const b = g.filter(p => p.secondaryCents !== null);
    const primary = a.length ? a.reduce((s, p) => s + (p.primaryCents as number), 0) : null;
    const secondary = b.length ? b.reduce((s, p) => s + (p.secondaryCents as number), 0) : null;
    if (primary !== null) cumA = (cumA ?? 0) + primary;
    if (secondary !== null) cumB = (cumB ?? 0) + secondary;
    return {
      key: start,
      label: granularity === 'day' ? fmtDay(start) : weekLabel(start, end),
      start,
      end,
      primaryCents: primary,
      secondaryCents: secondary,
      cumulativePrimaryCents: cumA,
      cumulativeSecondaryCents: cumB,
      primaryRecordedDays: a.length,
      secondaryRecordedDays: b.length,
      days: g.length,
      status: dominantStatus(g),
      current: partial && today >= start && today <= end,
    };
  });
}

/* -------------------------------- totals ------------------------------- */

export type WindowTotals = {
  primaryCents: number | null;
  secondaryCents: number | null;
  primaryRecordedDays: number;
  secondaryRecordedDays: number;
  /**
   * Recorded days that fall on office days through the cutoff — the count
   * completeness is judged on. A closeout on a day the office calendar does
   * not list (an unmarked Saturday, a listed closure) is real and stays in
   * the totals, but never stands in for a missing office day. Null without
   * a calendar.
   */
  primaryRecordedOfficeDays: number | null;
  secondaryRecordedOfficeDays: number | null;
  /** Recorded days outside the office calendar, named so the calendar gap is visible. */
  offCalendarDays: number;
  /** Calendar days in the period. */
  days: number;
  /**
   * Office days whose records should be on hand by the cutoff — every office
   * day before today plus today once it is recorded. Null when the office
   * calendar is not available, so completeness cannot be judged.
   */
  expectedDays: number | null;
  /** The last day the totals can cover: yesterday, or today once recorded. */
  cutoff: string;
  completeness: Completeness;
  /**
   * True when the period's total comes from a package's complete monthly
   * summary rather than a sum of daily rows: the total is complete even if
   * the daily detail underneath is thin.
   */
  authoritative: boolean;
  firstRecorded: string | null;
  lastRecorded: string | null;
  sealedDays: number;
  unsealedDays: number;
};

export function totalsOf(points: DayPoint[]): WindowTotals {
  const a = points.filter(p => p.primaryCents !== null);
  const b = points.filter(p => p.secondaryCents !== null);
  const recorded = points.filter(p => p.primaryCents !== null || p.secondaryCents !== null);
  return {
    primaryCents: a.length ? a.reduce((s, p) => s + (p.primaryCents as number), 0) : null,
    secondaryCents: b.length ? b.reduce((s, p) => s + (p.secondaryCents as number), 0) : null,
    primaryRecordedDays: a.length,
    secondaryRecordedDays: b.length,
    primaryRecordedOfficeDays: null,
    secondaryRecordedOfficeDays: null,
    offCalendarDays: 0,
    days: points.length,
    expectedDays: null,
    cutoff: points.length ? points[points.length - 1].date : '',
    completeness: 'unknown',
    authoritative: false,
    firstRecorded: recorded[0]?.date ?? null,
    lastRecorded: recorded.length ? recorded[recorded.length - 1].date : null,
    sealedDays: points.filter(p => p.status === 'sealed').length,
    unsealedDays: points.filter(p => p.status === 'saved').length,
  };
}

/**
 * The day a period's records can run through: yesterday while today is in
 * progress, today once today's closeout is on record. Never past the period.
 */
export function cutoffFor(period: { start: string; end: string }, today: string, todayRecorded: boolean): string {
  const last = period.end < today ? period.end : today;
  if (last === today && !todayRecorded) return shiftDate(today, -1);
  return last;
}

/**
 * Completeness against the office calendar: the office days through the
 * cutoff that should have a record, compared with the days that do. A
 * source with no calendar stays `unknown` — it is never called complete.
 */
export function withCoverage(
  totals: WindowTotals,
  period: { start: string; end: string },
  args: { today: string; calendar: OfficeDayCalendar | null | undefined; source: SeriesSource; points: DayPoint[] },
): WindowTotals {
  const todayRecorded = totals.lastRecorded === args.today;
  const cutoff = cutoffFor(period, args.today, todayRecorded);
  if (!args.calendar) return { ...totals, cutoff };
  const calendar = args.calendar;
  const expectedDays = countOfficeDays(period.start, cutoff, calendar);
  const onOfficeDay = (pt: DayPoint) => pt.date <= cutoff && isOfficeDay(pt.date, calendar);
  const primaryRecordedOfficeDays = args.points.filter(pt => pt.primaryCents !== null && onOfficeDay(pt)).length;
  const secondaryRecordedOfficeDays = args.points.filter(pt => pt.secondaryCents !== null && onOfficeDay(pt)).length;
  const offCalendarDays = args.points.filter(pt => (pt.primaryCents !== null || pt.secondaryCents !== null) && !isOfficeDay(pt.date, calendar)).length;
  const recordedOfficeDays = Math.max(primaryRecordedOfficeDays, secondaryRecordedOfficeDays);
  const completeness: Completeness = recordedOfficeDays >= expectedDays ? 'complete' : 'partial';
  return { ...totals, cutoff, expectedDays, completeness, primaryRecordedOfficeDays, secondaryRecordedOfficeDays, offCalendarDays };
}

/** Whole calendar months inside a period, as YYYY-MM keys; empty unless the period is month-aligned. */
export function wholeMonthsOf(period: { start: string; end: string }): string[] {
  if (period.start !== monthStartOf(period.start) || period.end !== monthEndOf(period.end)) return [];
  const months: string[] = [];
  for (let cursor = period.start; cursor <= period.end; cursor = addMonthsToStart(cursor, 1)) months.push(cursor.slice(0, 7));
  return months;
}

/**
 * A package's complete monthly summaries for a month-aligned period. When
 * every month has a `full` row the period total is those rows, authoritative
 * and complete, whatever the daily detail holds. Otherwise null.
 */
export function authoritativeTotals(period: { start: string; end: string }, months: ReportMonth[] | undefined): { primaryCents: number; secondaryCents: number } | null {
  const keys = wholeMonthsOf(period);
  if (keys.length === 0 || !months?.length) return null;
  const byMonth = new Map<string, ReportMonth>();
  for (const m of months) if (!byMonth.has(m.month)) byMonth.set(m.month, m); // already one row per month, first wins
  const rows = keys.map(k => byMonth.get(k));
  if (rows.some(r => !r || r.coverage !== 'full_calendar_month')) return null;
  return {
    primaryCents: rows.reduce((s, r) => s + (r as ReportMonth).production_cents, 0),
    secondaryCents: rows.reduce((s, r) => s + (r as ReportMonth).collections_cents, 0),
  };
}

/* ------------------------------ comparison ----------------------------- */

export type Comparison = {
  start: string;
  end: string;
  rangeLabel: string;
  totals: WindowTotals;
  /** True only when both sides recorded enough days with similar coverage. */
  comparable: boolean;
  reason: string | null;
  /**
   * The change per RECORDED day: (current ÷ its recorded days − prior ÷ its
   * recorded days) ÷ the prior average. Two spans of the same calendar
   * length rarely hold the same number of office days, so totals alone
   * would report a change that is only the calendar. Null when not
   * comparable or the prior average is 0.
   */
  primaryDelta: number | null;
  secondaryDelta: number | null;
  /** The per-recorded-day averages behind the deltas, in cents. */
  currentPrimaryPerDay: number | null;
  currentSecondaryPerDay: number | null;
  priorPrimaryPerDay: number | null;
  priorSecondaryPerDay: number | null;
};

/** Average cents per recorded day, or null when nothing was recorded. */
export function perRecordedDay(cents: number | null, days: number): number | null {
  return cents === null || days <= 0 ? null : Math.round(cents / days);
}

/** A comparison needs this many recorded days on each side. */
export const COMPARE_MIN_DAYS: Record<'week' | 'longer', number> = { week: 3, longer: 5 };
/** …and recorded-day counts within this relative tolerance of each other. */
export const COMPARE_COVERAGE_TOLERANCE = 0.3;

export function compare(period: Period, source: SeriesSource, sources: PerformanceSources, current: WindowTotals): Comparison {
  const prior = comparisonPeriodFor(period);
  const totals = totalsOf(dayPoints(prior, source, sources));
  const min = period.preset === 'this_week' ? COMPARE_MIN_DAYS.week : COMPARE_MIN_DAYS.longer;
  const curDays = Math.max(current.primaryRecordedDays, current.secondaryRecordedDays);
  const priorDays = Math.max(totals.primaryRecordedDays, totals.secondaryRecordedDays);
  let comparable = true;
  let reason: string | null = null;
  if (priorDays < min) {
    comparable = false;
    reason = priorDays === 0 ? `Nothing recorded for ${prior.rangeLabel}.` : `Only ${priorDays} day${priorDays === 1 ? '' : 's'} recorded for ${prior.rangeLabel}.`;
  } else if (curDays < min) {
    comparable = false;
    reason = `Only ${curDays} day${curDays === 1 ? '' : 's'} recorded so far in this period.`;
  } else if (Math.abs(curDays - priorDays) / Math.max(curDays, priorDays) > COMPARE_COVERAGE_TOLERANCE) {
    comparable = false;
    reason = `Coverage differs: ${curDays} days recorded now vs ${priorDays} in ${prior.rangeLabel}.`;
  }
  const curA = perRecordedDay(current.primaryCents, current.primaryRecordedDays);
  const curB = perRecordedDay(current.secondaryCents, current.secondaryRecordedDays);
  const prevA = perRecordedDay(totals.primaryCents, totals.primaryRecordedDays);
  const prevB = perRecordedDay(totals.secondaryCents, totals.secondaryRecordedDays);
  const delta = (cur: number | null, prev: number | null) =>
    comparable && cur !== null && prev !== null && prev > 0 ? (cur - prev) / prev : null;
  return {
    ...prior,
    totals,
    comparable,
    reason,
    primaryDelta: delta(curA, prevA),
    secondaryDelta: delta(curB, prevB),
    currentPrimaryPerDay: curA,
    currentSecondaryPerDay: curB,
    priorPrimaryPerDay: prevA,
    priorSecondaryPerDay: prevB,
  };
}

/* -------------------------------- window ------------------------------- */

export type PerformanceWindow = {
  period: Period;
  source: SeriesSource;
  choice: SourceChoice;
  definitions: SeriesDefinitions;
  granularity: Granularity;
  points: DayPoint[];
  buckets: Bucket[];
  totals: WindowTotals;
  comparison: Comparison;
  /** "18 of 24 days recorded · through Sep 23" */
  coverageLabel: string;
};

/**
 * "18 of 20 office days recorded · through Sep 23 · 1 not sealed", or the
 * calendar-day count when the office calendar is unavailable, or "complete
 * month · report package summary" when the package's own total stands.
 */
export function coverageLabel(totals: WindowTotals, source: SeriesSource, sourceDates = false): string {
  if (totals.authoritative) {
    return `Complete month · report package summary${totals.lastRecorded ? ` · through ${fmtDay(totals.lastRecorded)}` : ''}`;
  }
  const recorded = Math.max(totals.primaryRecordedDays, totals.secondaryRecordedDays);
  const parts: string[] = [];
  const reportUnit = sourceDates ? 'source date' : 'posting day';
  if (totals.expectedDays !== null) {
    const unit = source === 'closeouts' ? 'office day' : reportUnit;
    const onCalendar = Math.max(totals.primaryRecordedOfficeDays ?? 0, totals.secondaryRecordedOfficeDays ?? 0);
    parts.push(`${onCalendar} of ${totals.expectedDays} ${unit}${totals.expectedDays === 1 ? '' : 's'} recorded`);
  } else {
    const unit = source === 'closeouts' ? 'day' : reportUnit;
    parts.push(`${recorded} of ${totals.days} ${unit}s recorded`);
  }
  if (totals.lastRecorded) parts.push(`through ${fmtDay(totals.lastRecorded)}`);
  if (totals.offCalendarDays > 0) parts.push(`${totals.offCalendarDays} recorded outside the office calendar`);
  if (source === 'closeouts' && totals.unsealedDays > 0) parts.push(`${totals.unsealedDays} not sealed`);
  return parts.join(' · ');
}

/** "Partial data · 2 office days not recorded" or null when nothing is missing or unknown. */
export function partialLabel(totals: WindowTotals, source: SeriesSource): string | null {
  if (totals.completeness !== 'partial' || totals.expectedDays === null) return null;
  const recorded = Math.max(totals.primaryRecordedOfficeDays ?? totals.primaryRecordedDays, totals.secondaryRecordedOfficeDays ?? totals.secondaryRecordedDays);
  const missing = totals.expectedDays - recorded;
  const unit = source === 'closeouts' ? 'office day' : 'posting day';
  return `Partial data · ${missing} ${unit}${missing === 1 ? '' : 's'} not recorded`;
}

/**
 * The whole view for one period and one source. Returns null when no source
 * has a day in the period — the caller renders the reason from chooseSource.
 */
export function buildWindow(args: {
  period: Period;
  today: string;
  sources: PerformanceSources;
  /** A source the reader chose; falls back to precedence when it has no days. */
  preferredSource?: SeriesSource | null;
  /** The office calendar, for office-day coverage; omitted or null = unknown. */
  calendar?: OfficeDayCalendar | null;
}): PerformanceWindow | null {
  const { period, today, sources } = args;
  const choice = chooseSource(period, sources);
  const source =
    args.preferredSource && choice.available.includes(args.preferredSource) ? args.preferredSource : choice.source;
  if (!source) return null;
  const granularity = granularityFor(period);
  const points = dayPoints(period, source, sources);
  let totals = withCoverage(totalsOf(points), period, { today, calendar: args.calendar, source, points });
  if (source === 'report_history') {
    const summary = authoritativeTotals(period, sources.reportMonths);
    if (summary) totals = { ...totals, ...summary, authoritative: true, completeness: 'complete' };
  }
  // Some packages carry the date printed on the source rather than an entry
  // date; the labels say so instead of calling those posting days.
  const sourceDates = source === 'report_history' && sources.reportDays.some(d => d.date >= period.start && d.date <= period.end && d.dateBasis === 'source_date');
  return {
    period,
    source,
    choice,
    definitions: sourceDates ? {
      ...DEFINITIONS.report_history,
      primaryLabel: 'Charges',
      primaryDefinition: 'Charges by the date printed on the source. Entry date versus procedure date is unconfirmed for some reports.',
      secondaryDefinition: 'Receipts by the date printed on the source. Receipts can pay older balances.',
      dateBasis: 'date printed on source',
    } : DEFINITIONS[source],
    granularity,
    points,
    buckets: bucketize(points, granularity, today, period.partial),
    totals,
    comparison: compare(period, source, sources, totals),
    coverageLabel: coverageLabel(totals, source, sourceDates),
  };
}

/** Earliest recorded day across both sources, for the preset list. */
export function earliestRecordedDay(sources: PerformanceSources): string | null {
  const dates = [...sources.closeouts.map(d => d.date), ...sources.reportDays.map(d => d.date)].sort();
  return dates[0] ?? null;
}

/** Signed percent for a delta fraction: "+12%", "−8%". */
export function formatDelta(delta: number): string {
  const pct = Math.round(Math.abs(delta) * 100);
  return `${delta < 0 ? '−' : '+'}${pct}%`;
}
