/**
 * "Worth a look" — at most three observations for Owner and Manager Home,
 * each with what was observed, what it means in practice, and one next
 * step. Deterministic rules over recorded rows, never a model.
 *
 * One number, one home: the goal meters already carry every pace verdict
 * and the Needs you queue already carries every open item, so neither is
 * repeated here. What remains is what only a comparison over the recorded
 * days can show — a period-over-period move, a rising or falling missed
 * count, or a data gap that would make every other figure misleading.
 *
 * Selection is by consequence, and never only negative: a verified
 * improvement is shown whenever it exists. Insufficient data is itself an
 * observation that names what is missing and where to supply it.
 */
import type { OwnerPulseInput, Receipt } from '@/lib/owner-pulse';
import { money, ownerRecommendation } from '@/lib/owner-pulse';
import type { GoalMeter } from '@/lib/goal-progress';
import { formatDelta, type PerformanceWindow, type SourceState } from '@/lib/performance-series';
import type { MissedSeries } from '@/lib/missed-trend';

export type InsightTone = 'attention' | 'good' | 'steady' | 'calm';

export type HomeInsight = {
  id: string;
  tone: InsightTone;
  /** What was observed, in one line. */
  title: string;
  /** The actual comparison and the period it covers. */
  comparison: string;
  /** What it means in practice — never a cause the records do not prove. */
  why: string;
  /** Observed from records, or an estimate that depends on an assumption. */
  basis: 'observed' | 'estimate';
  receipts: Receipt[];
  next: { label: string; to: string };
};

export type AttentionSummary = {
  enabled: boolean;
  needsNow: number;
  waiting: number;
  /** Age of the oldest item that needs the manager now, in hours. */
  oldestHours: number | null;
  payroll: { label: string; days: number } | null;
  degraded: boolean;
};

export type HomeInsightsInput = {
  today: string;
  role: 'owner' | 'manager';
  pulse: OwnerPulseInput | null;
  goals: GoalMeter[];
  /** This month, from closeouts, with its comparison to the same days last month. */
  month: PerformanceWindow | null;
  missed: MissedSeries | null;
  attention: AttentionSummary | null;
  sources: { closeouts: SourceState; reports: SourceState; reportDays: number };
};

export const MAX_INSIGHTS = 3;
/** A period-over-period move smaller than this is not called a change. */
const CHANGE_THRESHOLD = 0.1;
/** Missed appointments: a quarter more (and at least three more) reads as rising. */
const MISSED_RATIO = 1.25;
const MISSED_MIN_ABS = 3;

const pct = (f: number) => `${Math.round(f * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function buildHomeInsights(input: HomeInsightsInput): HomeInsight[] {
  const { goals, pulse, month, missed, sources } = input;
  const out: HomeInsight[] = [];
  const push = (i: HomeInsight) => { if (out.length < MAX_INSIGHTS) out.push(i); };

  /* 1 — missing data is an observation, not a verdict about the office. */
  if (sources.closeouts === 'error') {
    push({
      id: 'closeouts_unreadable', tone: 'attention', title: 'Close the Day records could not be read.',
      comparison: 'No figure on this page is confirmed until they load.',
      why: 'A source that failed is not an empty office. Refresh, then read the month.',
      basis: 'observed',
      receipts: [{ label: 'deposit_logs', value: 'error', source: 'usePracticeVitals query state' }],
      next: { label: 'Open Close the Day', to: '/deposit-log' },
    });
  } else if (pulse && pulse.latest === null && pulse.thisMonth.days === 0 && pulse.prevMonth === null) {
    push({
      id: 'no_closeouts', tone: 'calm',
      title: sources.reportDays > 0 ? 'Report history is loaded, but no day has been closed out yet.' : 'No office days have been closed out yet.',
      comparison: sources.reportDays > 0
        ? `${plural(sources.reportDays, 'posting day')} of report history exist; production and collections pace read from Close the Day.`
        : 'Production, collections, and new patients read from Close the Day.',
      why: 'Without closeouts there is no month pace to judge — this is a data gap, not a result.',
      basis: 'observed',
      receipts: [
        { label: 'Closeouts on record', value: '0', source: 'deposit_logs, last 12 months' },
        ...(sources.reportDays > 0 ? [{ label: 'Report history', value: plural(sources.reportDays, 'posting day'), source: 'practice_report_imports' }] : []),
      ],
      next: { label: 'Close out a day', to: '/deposit-log' },
    });
  } else if (pulse) {
    const rec = ownerRecommendation(pulse, []);
    if (rec.id === 'closeout_gap') {
      push({
        id: 'closeout_gap', tone: 'attention', title: 'The deposit log has gone quiet.',
        comparison: rec.receipts.map(r => `${r.label}: ${r.value}`).join(' · '),
        why: 'Every pace figure reads only recorded days; the missing days make this month look worse than it is. Enter them before reading the month as a result.',
        basis: 'observed',
        receipts: rec.receipts,
        next: { label: 'Open Close the Day', to: '/deposit-log' },
      });
    }
  }

  /* 2 — the month's records are incomplete: say it once, with the fix. The meters mark it; this names the count. */
  const partial = goals.find(g => g.state === 'progress' && g.completeness === 'partial' && g.missingDays > 0);
  if (partial && !out.some(i => i.id === 'closeout_gap')) {
    push({
      id: 'records_incomplete', tone: 'attention', title: `${plural(partial.missingDays, 'office day')} this month ${partial.missingDays === 1 ? 'has' : 'have'} no closeout.`,
      comparison: `${partial.recordedOfficeDays} of ${partial.expectedRecordedDays} office days through the cutoff are recorded (${partial.monthLabel}).`,
      why: 'Totals are real but incomplete, so no behind-pace verdict is given until the missing days are entered.',
      basis: 'observed',
      receipts: [
        { label: 'Recorded', value: `${plural(partial.recordedOfficeDays, 'office day')}${partial.recordedDays > partial.recordedOfficeDays ? ` · ${partial.recordedDays - partial.recordedOfficeDays} more outside the office calendar` : ''}`, source: 'deposit_logs, this month' },
        { label: 'Expected by now', value: plural(partial.expectedRecordedDays, 'office day'), source: 'office calendar: closures, open Saturdays, weekly pattern' },
      ],
      next: { label: 'Complete the records', to: '/deposit-log' },
    });
  }

  /* 3 — collections vs the same days last month (same source, similar coverage). */
  if (month && month.source === 'closeouts') {
    const c = month.comparison;
    const cur = month.totals.secondaryCents;
    const prev = c.totals.secondaryCents;
    const curPerDay = c.currentSecondaryPerDay;
    const prevPerDay = c.priorSecondaryPerDay;
    if (c.comparable && c.secondaryDelta !== null && cur !== null && prev !== null && curPerDay !== null && prevPerDay !== null && Math.abs(c.secondaryDelta) >= CHANGE_THRESHOLD) {
      const down = c.secondaryDelta < 0;
      const curDays = month.totals.secondaryRecordedDays;
      const prevDays = c.totals.secondaryRecordedDays;
      push({
        id: down ? 'collections_down' : 'collections_up',
        tone: down ? 'attention' : 'good',
        title: `Collections per recorded day are ${pct(Math.abs(c.secondaryDelta))} ${down ? 'below' : 'above'} the same days last month.`,
        comparison: `${money(curPerDay)} a day over ${plural(curDays, 'closed-out day')} (${month.period.rangeLabel}) vs ${money(prevPerDay)} a day over ${plural(prevDays, 'closed-out day')} (${c.rangeLabel}) — ${formatDelta(c.secondaryDelta)}.`,
        why: down
          ? 'Receipts move with insurance timing and posting, so a drop this size is worth checking before reading it as performance.'
          : 'A rise this size is worth knowing about; the receipts are recorded, the reason is not.',
        basis: 'observed',
        receipts: [
          { label: 'This period', value: `${money(cur)} · ${money(curPerDay)}/day`, source: `deposit_logs · ${plural(curDays, 'closed-out day')}, receipts by deposit date` },
          { label: 'Same days last month', value: `${money(prev)} · ${money(prevPerDay)}/day`, source: `deposit_logs · ${plural(prevDays, 'closed-out day')}` },
          { label: 'Calculation', value: formatDelta(c.secondaryDelta), source: '(this period per day − prior per day) ÷ prior per day; per recorded day so a calendar with fewer office days does not read as a drop' },
        ],
        next: sources.reports === 'ok' && sources.reportDays > 0
          ? { label: 'Open report history', to: '/report-history' }
          : { label: 'Open Close the Day', to: '/deposit-log' },
      });
    }
  }

  /* 4 — cancellations and no-shows vs the comparable prior period. */
  if (missed && missed.comparison.comparable) {
    const cur = missed.totals.total;
    const prev = missed.comparison.totals.total;
    const rising = prev > 0 && cur >= prev * MISSED_RATIO && cur - prev >= MISSED_MIN_ABS;
    const falling = prev > 0 && cur <= prev / MISSED_RATIO && prev - cur >= MISSED_MIN_ABS;
    if (rising || falling) {
      const breakdown = `${missed.totals.doctor} doctor · ${missed.totals.hygiene} hygiene${missed.totals.unassigned ? ` · ${missed.totals.unassigned} unassigned` : ''}`;
      push({
        id: rising ? 'missed_rising' : 'missed_falling',
        tone: rising ? 'attention' : 'good',
        title: rising ? 'Cancellations and no-shows are up on the comparable period.' : 'Cancellations and no-shows are down on the comparable period.',
        comparison: `${cur} for ${missed.period.rangeLabel} vs ${prev} for ${missed.comparison.rangeLabel} (${breakdown}).`,
        why: rising
          ? 'The counts are recorded; the reason is not — confirmations, the reminder cadence, and the schedule mix are the places to look.'
          : 'Recorded, not inferred. Whatever changed is worth keeping.',
        basis: 'observed',
        receipts: [
          { label: 'This period', value: `${missed.totals.cancellations} cancellations · ${missed.totals.noShows} no-shows`, source: `${missed.sourceLabel}, ${missed.period.rangeLabel}` },
          { label: 'Comparable period', value: `${missed.comparison.totals.cancellations} cancellations · ${missed.comparison.totals.noShows} no-shows`, source: `${missed.sourceLabel}, ${missed.comparison.rangeLabel}` },
          { label: 'Rule', value: rising ? `≥ ${Math.round((MISSED_RATIO - 1) * 100)}% and ≥ ${MISSED_MIN_ABS} more` : `≥ ${Math.round((1 - 1 / MISSED_RATIO) * 100)}% and ≥ ${MISSED_MIN_ABS} fewer`, source: 'same elapsed days of the prior period' },
        ],
        next: { label: 'Open missed appointments', to: `/management/missed-appointments?start=${missed.period.start}&end=${missed.period.end}` },
      });
    }
  }

  /* 5 — a metric paced on calendar days is an estimate; say so once rather than under every figure. */
  const estimate = goals.find(g => g.state === 'progress' && g.basis.kind === 'calendar_days');
  if (estimate && out.length < MAX_INSIGHTS) {
    push({
      id: 'calendar_estimate', tone: 'calm', title: 'Pace is a calendar-day estimate this month.',
      comparison: 'The office calendar could not be read, so the goal is spread over every day of the month instead of the office days.',
      why: 'An office closed on weekends reads behind at the start of every week on this basis. Treat the pace marker as approximate.',
      basis: 'estimate',
      receipts: [{ label: 'Basis', value: `day ${estimate.daysElapsed} of ${estimate.daysInMonth}`, source: 'calendar days' }],
      next: { label: 'Open the office calendar', to: '/office-calendar' },
    });
  }

  return out.slice(0, MAX_INSIGHTS);
}
