/**
 * Cancellations and no-shows over time — the supporting operational visual
 * on Home. Two sources, one precedence rule, categories kept apart:
 *
 *   postings   missed_appointment_events — one Dentrix 9100 (no-show) or 9101
 *              (late cancellation) posting per row, department doctor /
 *              hygiene / other (shown as UNASSIGNED, never folded in);
 *   closeouts  deposit_logs counters, only on days where the closeout says
 *              they were recorded.
 *
 * Postings win when any fall in the period; otherwise closeouts; otherwise
 * "not recorded". The two are never summed.
 */
import { daysBetween, mondayOf, shiftDate } from '@/lib/time-utils';
import {
  COMPARE_COVERAGE_TOLERANCE, COMPARE_MIN_DAYS, comparisonPeriodFor, formatRange, type Period,
} from '@/lib/performance-series';

export type MissedSource = 'postings' | 'closeouts';

export type MissedEventLite = {
  business_date: string;
  code: '9100' | '9101' | string;
  department: 'doctor' | 'hygiene' | 'other' | string;
};

export type CloseoutMissedDay = {
  date: string;
  /** False = the closeout did not record schedule counts that day. */
  recorded: boolean;
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
};

export type MissedTotals = {
  cancellations: number;
  noShows: number;
  doctor: number;
  hygiene: number;
  unassigned: number;
  total: number;
};

export type MissedBucket = MissedTotals & {
  key: string;
  label: string;
  start: string;
  end: string;
  /** Days in the bucket with any record from the chosen source. */
  recordedDays: number;
  days: number;
  /** False when nothing in the bucket was recorded — the counts are not zeros. */
  recorded: boolean;
  current: boolean;
};

export type MissedGranularity = 'day' | 'week' | 'month';

export type MissedComparison = {
  start: string;
  end: string;
  rangeLabel: string;
  totals: MissedTotals;
  recordedDays: number;
  comparable: boolean;
  reason: string | null;
};

export type MissedSeries = {
  source: MissedSource;
  period: Period;
  granularity: MissedGranularity;
  buckets: MissedBucket[];
  totals: MissedTotals;
  recordedDays: number;
  days: number;
  comparison: MissedComparison;
  definition: string;
  sourceLabel: string;
};

const EMPTY: MissedTotals = { cancellations: 0, noShows: 0, doctor: 0, hygiene: 0, unassigned: 0, total: 0 };

export const MISSED_DEFINITIONS: Record<MissedSource, { label: string; definition: string }> = {
  postings: {
    label: 'Dentrix postings',
    definition: 'One row per 9100 (no-show) or 9101 (late cancellation) posting, by business date. Unassigned postings have no department yet.',
  },
  closeouts: {
    label: 'Close the Day counts',
    definition: 'Hygiene and doctor cancellations and no-shows entered at Close the Day, on days where they were recorded.',
  },
};

const inRange = (date: string, r: { start: string; end: string }) => date >= r.start && date <= r.end;

function add(t: MissedTotals, kind: 'cancellation' | 'no_show', dept: 'doctor' | 'hygiene' | 'unassigned', n = 1): void {
  if (kind === 'cancellation') t.cancellations += n; else t.noShows += n;
  t[dept] += n;
  t.total += n;
}

function tally(range: { start: string; end: string }, source: MissedSource, events: MissedEventLite[], closeouts: CloseoutMissedDay[]): { totals: MissedTotals; recordedDates: Set<string> } {
  const totals: MissedTotals = { ...EMPTY };
  const recordedDates = new Set<string>();
  if (source === 'postings') {
    for (const e of events) {
      if (!inRange(e.business_date, range)) continue;
      recordedDates.add(e.business_date);
      const dept = e.department === 'doctor' ? 'doctor' : e.department === 'hygiene' ? 'hygiene' : 'unassigned';
      add(totals, e.code === '9100' ? 'no_show' : 'cancellation', dept);
    }
  } else {
    for (const d of closeouts) {
      if (!d.recorded || !inRange(d.date, range)) continue;
      recordedDates.add(d.date);
      add(totals, 'cancellation', 'hygiene', d.hygieneCancellations);
      add(totals, 'no_show', 'hygiene', d.hygieneNoShows);
      add(totals, 'cancellation', 'doctor', d.doctorCancellations);
      add(totals, 'no_show', 'doctor', d.doctorNoShows);
    }
  }
  return { totals, recordedDates };
}

export function chooseMissedSource(period: { start: string; end: string }, events: MissedEventLite[], closeouts: CloseoutMissedDay[]): MissedSource | null {
  if (events.some(e => inRange(e.business_date, period))) return 'postings';
  if (closeouts.some(d => d.recorded && inRange(d.date, period))) return 'closeouts';
  return null;
}

export function missedGranularityFor(period: { start: string; end: string }): MissedGranularity {
  const days = daysBetween(period.start, period.end) + 1;
  if (days <= 14) return 'day';
  if (days <= 120) return 'week';
  return 'month';
}

function fmtDay(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function bucketKey(date: string, g: MissedGranularity): string {
  if (g === 'day') return date;
  if (g === 'week') return mondayOf(date);
  return `${date.slice(0, 7)}-01`;
}

/**
 * The series for one period. Null when neither source has anything in it —
 * the caller says "not recorded" and links to the import.
 */
export function missedSeries(args: {
  period: Period;
  today: string;
  events: MissedEventLite[];
  closeouts: CloseoutMissedDay[];
}): MissedSeries | null {
  const { period, today, events, closeouts } = args;
  const source = chooseMissedSource(period, events, closeouts);
  if (!source) return null;
  const granularity = missedGranularityFor(period);

  // Bucket boundaries over every calendar day of the period.
  const groups = new Map<string, { start: string; end: string }>();
  const totalDays = daysBetween(period.start, period.end) + 1;
  for (let i = 0; i < totalDays; i += 1) {
    const date = shiftDate(period.start, i);
    const key = bucketKey(date, granularity);
    const g = groups.get(key);
    if (g) g.end = date; else groups.set(key, { start: date, end: date });
  }

  const buckets: MissedBucket[] = [...groups.entries()].map(([key, range]) => {
    const { totals, recordedDates } = tally(range, source, events, closeouts);
    const days = daysBetween(range.start, range.end) + 1;
    const label =
      granularity === 'day'
        ? fmtDay(range.start)
        : granularity === 'week'
          ? `${fmtDay(range.start)}–${fmtDay(range.end)}`
          : new Date(`${range.start}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });
    return {
      key,
      label,
      ...range,
      ...totals,
      recordedDays: recordedDates.size,
      days,
      recorded: recordedDates.size > 0,
      current: period.partial && today >= range.start && today <= range.end,
    };
  });

  const whole = tally(period, source, events, closeouts);
  const prior = comparisonPeriodFor(period);
  const priorTally = tally(prior, source, events, closeouts);
  const min = period.preset === 'this_week' ? COMPARE_MIN_DAYS.week : COMPARE_MIN_DAYS.longer;
  // Postings only exist on days something was missed, so coverage for that
  // source is judged on calendar days, not recorded days.
  const curDays = source === 'postings' ? totalDays : whole.recordedDates.size;
  const priorDays = source === 'postings' ? daysBetween(prior.start, prior.end) + 1 : priorTally.recordedDates.size;
  let comparable = true;
  let reason: string | null = null;
  if (source === 'closeouts' && priorDays < min) {
    comparable = false;
    reason = priorDays === 0 ? `No schedule counts recorded for ${prior.rangeLabel}.` : `Only ${priorDays} day${priorDays === 1 ? '' : 's'} recorded for ${prior.rangeLabel}.`;
  } else if (source === 'closeouts' && curDays < min) {
    comparable = false;
    reason = `Only ${curDays} day${curDays === 1 ? '' : 's'} recorded so far in this period.`;
  } else if (source === 'closeouts' && Math.abs(curDays - priorDays) / Math.max(curDays, priorDays) > COMPARE_COVERAGE_TOLERANCE) {
    comparable = false;
    reason = `Coverage differs: ${curDays} days recorded now vs ${priorDays} in ${prior.rangeLabel}.`;
  } else if (source === 'postings' && priorTally.totals.total === 0 && !events.some(e => e.business_date < period.start)) {
    comparable = false;
    reason = `No postings recorded before ${formatRange(period.start, period.end)}.`;
  }

  return {
    source,
    period,
    granularity,
    buckets,
    totals: whole.totals,
    recordedDays: whole.recordedDates.size,
    days: totalDays,
    comparison: {
      ...prior,
      totals: priorTally.totals,
      recordedDays: priorTally.recordedDates.size,
      comparable,
      reason,
    },
    definition: MISSED_DEFINITIONS[source].definition,
    sourceLabel: MISSED_DEFINITIONS[source].label,
  };
}
