/**
 * "What I'm noticing" — at most three observations for Owner and Manager
 * Home, each built from recorded rows with the comparison, the period, a
 * reason that claims no cause, receipts (source, calculation, coverage),
 * and one next step. Deterministic rules, not a model: this extends the
 * grounded recommendation in owner-pulse.ts rather than replacing it.
 *
 * Selection is by consequence, and never only negative: a verified goal or
 * a verified improvement is shown whenever it exists. Insufficient data is
 * itself an observation that names what is missing and where to supply it.
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
  /** What changed, in one line. */
  title: string;
  /** The actual comparison and the period it covers. */
  comparison: string;
  /** Why it deserves a look — never a cause the records do not prove. */
  why: string;
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
  const { today, role, pulse, goals, month, missed, attention, sources } = input;
  const out: HomeInsight[] = [];
  const push = (i: HomeInsight) => { if (out.length < MAX_INSIGHTS) out.push(i); };

  /* 1 — missing data is an observation, not a verdict about the office. */
  if (sources.closeouts === 'error') {
    push({
      id: 'closeouts_unreadable', tone: 'attention', title: 'Close the Day records could not be read.',
      comparison: 'No figure on this page is confirmed until they load.',
      why: 'A source that failed is not an empty office.',
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
        why: 'Every pace figure reads only recorded days; missing days make this month look worse than it is.',
        receipts: rec.receipts,
        next: { label: 'Open Close the Day', to: '/deposit-log' },
      });
    }
  }

  /* 2 — a goal reached is verified good news; it is never buried. */
  for (const g of goals) {
    if (g.state === 'progress' && g.overCents !== null && g.achievedCents !== null) {
      push({
        id: `${g.id}_goal_reached`, tone: 'good', title: `${g.label} ${g.id === 'collections' ? 'have' : 'has'} reached the ${g.monthLabel.split(' ')[0]} goal.`,
        comparison: `${money(g.achievedCents)} recorded against a ${money(g.targetCents)} goal — ${money(g.overCents)} over with ${plural(g.daysInMonth - g.daysElapsed, 'day')} left.`,
        why: 'Verified from closeouts, not projected.',
        receipts: [
          { label: 'Recorded this month', value: money(g.achievedCents), source: `deposit_logs, ${plural(g.recordedDays, 'closed-out day')}` },
          { label: 'Goal', value: money(g.targetCents), source: 'org_practice_settings' },
        ],
        next: { label: 'Open goals', to: '/goals' },
      });
    }
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

  /* 4 — behind a configured goal, by calendar-day pace. */
  for (const g of goals) {
    if (g.state === 'progress' && g.pace && g.pace.status === 'behind' && g.achievedCents !== null && g.expectedToDateCents !== null) {
      push({
        id: `${g.id}_behind`, tone: 'attention', title: `${g.label} ${g.id === 'collections' ? 'are' : 'is'} behind calendar pace for ${g.monthLabel.split(' ')[0]}.`,
        comparison: `${money(g.achievedCents)} of the ${money(g.targetCents)} goal (${pct(g.pct ?? 0)}) with ${pct(g.daysElapsed / g.daysInMonth)} of the month elapsed — ${money(Math.abs(g.pace.diff))} under the ${money(g.expectedToDateCents)} expected by now.`,
        why: 'Calendar-day pace spreads the goal over every day, so an office that front- or back-loads its schedule can sit under it without being behind. Worth a look, not a verdict.',
        receipts: [
          { label: 'Recorded this month', value: money(g.achievedCents), source: `deposit_logs, ${plural(g.recordedDays, 'closed-out day')}` },
          { label: 'Expected by now', value: money(g.expectedToDateCents), source: `${money(g.targetCents)} goal × day ${g.daysElapsed} ÷ ${g.daysInMonth} (calendar days)` },
        ],
        next: { label: 'Open Close the Day', to: '/deposit-log' },
      });
    }
  }

  /* 5 — cancellations and no-shows vs the comparable prior period. */
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
        receipts: [
          { label: 'This period', value: `${missed.totals.cancellations} cancellations · ${missed.totals.noShows} no-shows`, source: `${missed.sourceLabel}, ${missed.period.rangeLabel}` },
          { label: 'Comparable period', value: `${missed.comparison.totals.cancellations} cancellations · ${missed.comparison.totals.noShows} no-shows`, source: `${missed.sourceLabel}, ${missed.comparison.rangeLabel}` },
          { label: 'Rule', value: rising ? `≥ ${Math.round((MISSED_RATIO - 1) * 100)}% and ≥ ${MISSED_MIN_ABS} more` : `≥ ${Math.round((1 - 1 / MISSED_RATIO) * 100)}% and ≥ ${MISSED_MIN_ABS} fewer`, source: 'same elapsed days of the prior period' },
        ],
        next: { label: 'Open missed appointments', to: `/management/missed-appointments?start=${missed.period.start}&end=${missed.period.end}` },
      });
    }
  }

  /* 6 — work waiting on the manager (owners see decisions in Needs you already). */
  if (role === 'manager' && attention?.enabled && attention.needsNow > 0) {
    const oldest = attention.oldestHours !== null && attention.oldestHours >= 24 ? `the oldest ${Math.round(attention.oldestHours / 24)}d old` : null;
    const due = attention.payroll ? `${attention.payroll.label} in ${plural(attention.payroll.days, 'day')}` : null;
    push({
      id: 'work_waiting', tone: attention.payroll && attention.payroll.days <= 2 ? 'attention' : 'steady',
      title: `${plural(attention.needsNow, 'item')} need${attention.needsNow === 1 ? 's' : ''} you now${attention.waiting ? `, ${attention.waiting} more waiting on others` : ''}.`,
      comparison: [oldest, due].filter(Boolean).join(' · ') || 'All arrived within the last day.',
      why: attention.payroll ? 'Unresolved time records make the payroll period questionable until they change.' : 'Attention is in consequence order; the first row is first.',
      receipts: [
        { label: 'Needs you now', value: String(attention.needsNow), source: 'Attention (deriveAttention), open items under the admission rule' },
        ...(attention.payroll ? [{ label: 'Payroll deadline', value: attention.payroll.label, source: 'payroll_settings due days after the period' }] : []),
      ],
      next: { label: 'Open Attention', to: '/management' },
    });
  }

  /* 7 — nothing off: say the month is on pace, with the checks that passed. */
  if (out.length === 0 && pulse && pulse.thisMonth.days > 0) {
    const judged = goals.filter(g => g.state === 'progress' && g.pace);
    const receipts: Receipt[] = judged.map(g => ({
      label: `${g.label} pace`,
      value: g.pace!.status === 'ahead' ? 'Ahead' : 'On pace',
      source: `${money(g.pace!.actual)} vs ${money(g.pace!.pacedTarget)} expected by day ${g.daysElapsed} (calendar days)`,
    }));
    if (pulse.latest) receipts.push({ label: 'Closeouts', value: 'Current', source: `last closed out ${pulse.latest.date}` });
    push({
      id: 'steady', tone: judged.length ? 'good' : 'calm',
      title: judged.length ? `${goals[0].monthLabel.split(' ')[0]} is on pace for ${judged.map(g => g.label.toLowerCase()).join(' and ')}.` : 'Nothing is materially off this month.',
      comparison: judged.length
        ? judged.map(g => `${g.label} ${money(g.pace!.actual)} vs ${money(g.pace!.pacedTarget)} expected`).join(' · ')
        : `${plural(pulse.thisMonth.days, 'closed-out day')} this month; no goals are configured, so there is no pace to judge.`,
      why: 'Nothing here suggests an intervention.',
      receipts,
      next: judged.length ? { label: 'Open goals', to: '/goals' } : { label: 'Set office goals', to: '/management/office/settings#office-goals' },
    });
  }

  return out.slice(0, MAX_INSIGHTS);
}
