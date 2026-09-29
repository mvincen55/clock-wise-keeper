/**
 * Goal meters — production and collections each against ONLY its own
 * configured monthly target (org_practice_settings). One shared formula
 * (metric-pace.ts) paces both.
 *
 * The basis is the office's own calendar when it is in hand: the goal is
 * spread over the month's office days (closures and open Saturdays
 * included), and "elapsed" counts the office days whose closeouts should be
 * on record — every office day before today, plus today once it is closed
 * out. When the calendar could not be read the meter falls back to calendar
 * days and says so; a "behind" on that basis is an estimate, never a verdict.
 *
 * Rules:
 *  - no target → `no_goal` with an honest line, never an invented target;
 *  - target but nothing recorded this month → `no_data` (missing data is
 *    not evidence the office is behind);
 *  - office days with no closeout make the month PARTIAL: the totals still
 *    show, the expected figure still shows, but no behind verdict is given
 *    until the records are complete — "ahead" survives (more data can only
 *    add), "behind" does not;
 *  - over the goal stays over: pct may exceed 1, remaining is 0, and the
 *    overage is reported.
 */
import type { VitalsSummary, VitalsTargets } from '@/hooks/usePracticeVitals';
import { daysInMonthOf, metricPace, paceBasisClause, paceFraction, type MetricPace, type PaceBasis } from '@/lib/metric-pace';
import { money } from '@/lib/owner-pulse';
import { formatMonthLong } from '@/lib/performance-series';

export type GoalMetric = 'production' | 'collections';

/** The one-word reading a meter gives; null while there is no goal or no data. */
export type GoalVerdict = 'reached' | 'ahead' | 'on_pace' | 'behind' | 'incomplete' | 'estimate';

export type GoalCompleteness = 'complete' | 'partial' | 'unknown';

export type GoalMeter = {
  id: GoalMetric;
  label: string;
  state: 'no_goal' | 'no_data' | 'progress';
  monthLabel: string;
  targetCents: number;
  achievedCents: number | null;
  remainingCents: number | null;
  overCents: number | null;
  /** achieved ÷ target; may exceed 1 (a legitimate over-goal result). */
  pct: number | null;
  /** target × elapsed ÷ total on the meter's basis. */
  expectedToDateCents: number | null;
  pace: MetricPace | null;
  /** "$1,200 ahead of pace" / "on pace" / null. */
  paceLabel: string | null;
  recordedDays: number;
  /** Calendar day of month and days in the month, for the caption. */
  daysElapsed: number;
  daysInMonth: number;
  /** The basis the expectation was paced on. */
  basis: PaceBasis;
  /** Office days whose closeouts should be on record by now; 0 when unknown. */
  expectedRecordedDays: number;
  /** expectedRecordedDays − recordedDays, never negative; 0 when unknown. */
  missingDays: number;
  completeness: GoalCompleteness;
  verdict: GoalVerdict | null;
  /** "Behind pace", "Partial data", "Goal reached" … */
  verdictLabel: string;
  /** One honest sentence for the meter's caption. */
  detail: string;
};

export const VERDICT_LABELS: Record<GoalVerdict, string> = {
  reached: 'Goal reached',
  ahead: 'Ahead of pace',
  on_pace: 'On pace',
  behind: 'Behind pace',
  incomplete: 'Partial data',
  estimate: 'Below calendar pace (estimate)',
};

/** The basis, explained once under the meters. */
export function paceBasisLabel(basis: PaceBasis): string {
  return basis.kind === 'office_days'
    ? 'Pace by office days: the goal spread across the office days on the office calendar (closures and open Saturdays included). A day counts as elapsed once its closeout should be on record.'
    : 'Calendar-day pace: the goal spread evenly across every day of the month. The office calendar could not be read, so this is an estimate, not a verdict.';
}

/** Kept for callers that still print the calendar-day basis. */
export const PACE_BASIS_LABEL = paceBasisLabel({ kind: 'calendar_days', elapsed: 0, total: 0 });

export type OfficeDaysInput = {
  /** Office days in the whole month. */
  total: number;
  /** Office days from the first of the month through yesterday. */
  throughYesterday: number;
  /** Office days from the first of the month through today. */
  throughToday: number;
};

export function goalMeters(input: {
  today: string;
  thisMonth: VitalsSummary;
  targets: VitalsTargets;
  /** Fraction of the month elapsed by calendar days — the fallback basis. */
  monthElapsed: number;
  /** The office calendar's count of office days; null when it could not be read. */
  officeDays?: OfficeDaysInput | null;
  /** Whether today's closeout is already on record (today then counts as elapsed). */
  todayRecorded?: boolean;
}): GoalMeter[] {
  const { today, thisMonth, targets, monthElapsed, officeDays, todayRecorded } = input;
  const daysInMonth = daysInMonthOf(today);
  const daysElapsed = Number(today.slice(8, 10));
  const monthLabel = formatMonthLong(today);

  const basis: PaceBasis = officeDays && officeDays.total > 0
    ? { kind: 'office_days', elapsed: todayRecorded ? officeDays.throughToday : officeDays.throughYesterday, total: officeDays.total }
    : { kind: 'calendar_days', elapsed: daysElapsed, total: daysInMonth };
  const elapsedFraction = basis.kind === 'office_days' ? paceFraction(basis) : monthElapsed;

  const build = (
    id: GoalMetric,
    label: string,
    targetCents: number,
    achieved: number,
    recordedDays: number,
  ): GoalMeter => {
    const expectedRecordedDays = basis.kind === 'office_days' ? basis.elapsed : 0;
    const missingDays = basis.kind === 'office_days' ? Math.max(0, expectedRecordedDays - recordedDays) : 0;
    const completeness: GoalCompleteness = basis.kind !== 'office_days' ? 'unknown' : missingDays > 0 ? 'partial' : 'complete';
    const base = {
      id, label, monthLabel, targetCents, recordedDays, daysElapsed, daysInMonth, basis, expectedRecordedDays, missingDays, completeness,
      achievedCents: null as number | null, remainingCents: null as number | null, overCents: null as number | null,
      pct: null as number | null, expectedToDateCents: null as number | null, pace: null as MetricPace | null, paceLabel: null as string | null,
      verdict: null as GoalVerdict | null, verdictLabel: '',
    };
    if (targetCents <= 0) {
      return {
        ...base,
        state: 'no_goal',
        achievedCents: recordedDays > 0 ? achieved : null,
        detail: recordedDays > 0
          ? `No ${label.toLowerCase()} goal is set — ${money(achieved)} recorded so far this month.`
          : `No ${label.toLowerCase()} goal is set.`,
      };
    }
    if (recordedDays === 0) {
      return {
        ...base,
        state: 'no_data',
        expectedToDateCents: Math.round(targetCents * elapsedFraction),
        detail: `Goal ${money(targetCents)} · nothing recorded yet this month, so there is no pace to read.`,
      };
    }
    const pace = metricPace({ actual: achieved, target: targetCents, monthElapsed: elapsedFraction, recordedDays });
    const over = Math.max(0, achieved - targetCents);
    const paceLabel = pace
      ? pace.status === 'on_pace'
        ? 'on pace'
        : `${money(Math.abs(pace.diff))} ${pace.status === 'ahead' ? 'ahead of' : 'behind'} pace`
      : null;
    const pct = achieved / targetCents;

    let verdict: GoalVerdict;
    if (over > 0) verdict = 'reached';
    else if (!pace) verdict = 'incomplete';
    else if (pace.status === 'behind') verdict = completeness === 'partial' ? 'incomplete' : completeness === 'unknown' ? 'estimate' : 'behind';
    else verdict = pace.status;

    const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
    let detail: string;
    if (over > 0) {
      detail = `Goal reached — ${money(over)} over the ${money(targetCents)} goal with ${plural(daysInMonth - daysElapsed, 'day')} left.`;
    } else if (verdict === 'incomplete') {
      detail = `${Math.round(pct * 100)}% of the ${money(targetCents)} goal · ${plural(missingDays, 'office day')} not recorded, so pace is not judged until the records are complete.`;
    } else if (verdict === 'estimate') {
      detail = `${Math.round(pct * 100)}% of the ${money(targetCents)} goal · below calendar pace by ${money(Math.abs(pace!.diff))} with ${paceBasisClause(basis)} — an estimate, since the office calendar could not be read.`;
    } else {
      detail = `${Math.round(pct * 100)}% of the ${money(targetCents)} goal · ${paceLabel} by ${paceBasisClause(basis)}.`;
    }
    return {
      ...base,
      state: 'progress',
      achievedCents: achieved,
      remainingCents: Math.max(0, targetCents - achieved),
      overCents: over > 0 ? over : null,
      pct,
      expectedToDateCents: pace?.pacedTarget ?? Math.round(targetCents * elapsedFraction),
      pace,
      paceLabel,
      verdict,
      verdictLabel: VERDICT_LABELS[verdict],
      detail,
    };
  };

  return [
    build('production', 'Production', targets.productionCents, thisMonth.productionCents, thisMonth.productionRecordedDays ?? thisMonth.days),
    build('collections', 'Collections', targets.collectionsCents, thisMonth.collectedCents, thisMonth.days),
  ];
}
