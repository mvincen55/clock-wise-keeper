/**
 * Goal meters — production and collections each against ONLY its own
 * configured monthly target (org_practice_settings). One shared formula
 * (metric-pace.ts) paces both by calendar days elapsed, and every meter says
 * so: Purple Envelope does not verify the office's working-day calendar, so
 * no working-day pace, no projection, and no "per remaining day" figure is
 * derived here.
 *
 * Rules:
 *  - no target → `no_goal` with an honest line, never an invented target;
 *  - target but nothing recorded this month → `no_data` (missing data is
 *    not evidence the office is behind);
 *  - over the goal stays over: pct may exceed 1, remaining is 0, and the
 *    overage is reported.
 */
import type { VitalsSummary, VitalsTargets } from '@/hooks/usePracticeVitals';
import { daysInMonthOf, metricPace, type MetricPace } from '@/lib/metric-pace';
import { money } from '@/lib/owner-pulse';
import { formatMonthLong } from '@/lib/performance-series';

export type GoalMetric = 'production' | 'collections';

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
  /** target × calendar days elapsed ÷ days in month. */
  expectedToDateCents: number | null;
  pace: MetricPace | null;
  /** "$1,200 ahead of calendar pace" / "on calendar pace" / null. */
  paceLabel: string | null;
  recordedDays: number;
  daysElapsed: number;
  daysInMonth: number;
  /** One honest sentence for the meter's caption. */
  detail: string;
};

export const PACE_BASIS_LABEL = 'Calendar-day pace: the goal spread evenly across every day of the month, not the office’s working days.';

export function goalMeters(input: {
  today: string;
  thisMonth: VitalsSummary;
  targets: VitalsTargets;
  monthElapsed: number;
}): GoalMeter[] {
  const { today, thisMonth, targets, monthElapsed } = input;
  const daysInMonth = daysInMonthOf(today);
  const daysElapsed = Number(today.slice(8, 10));
  const monthLabel = formatMonthLong(today);

  const build = (
    id: GoalMetric,
    label: string,
    targetCents: number,
    achieved: number,
    recordedDays: number,
  ): GoalMeter => {
    const base = {
      id, label, monthLabel, targetCents, recordedDays, daysElapsed, daysInMonth,
      achievedCents: null as number | null, remainingCents: null as number | null, overCents: null as number | null,
      pct: null as number | null, expectedToDateCents: null as number | null, pace: null as MetricPace | null, paceLabel: null as string | null,
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
        expectedToDateCents: Math.round(targetCents * monthElapsed),
        detail: `Goal ${money(targetCents)} · nothing recorded yet this month, so there is no pace to read.`,
      };
    }
    const pace = metricPace({ actual: achieved, target: targetCents, monthElapsed, recordedDays });
    const over = Math.max(0, achieved - targetCents);
    const paceLabel = pace
      ? pace.status === 'on_pace'
        ? 'on calendar pace'
        : `${money(Math.abs(pace.diff))} ${pace.status === 'ahead' ? 'ahead of' : 'behind'} calendar pace`
      : null;
    const pct = achieved / targetCents;
    const detail =
      over > 0
        ? `Goal reached — ${money(over)} over the ${money(targetCents)} goal with ${daysInMonth - daysElapsed} day${daysInMonth - daysElapsed === 1 ? '' : 's'} left.`
        : `${Math.round(pct * 100)}% of the ${money(targetCents)} goal · ${paceLabel} with day ${daysElapsed} of ${daysInMonth}.`;
    return {
      ...base,
      state: 'progress',
      achievedCents: achieved,
      remainingCents: Math.max(0, targetCents - achieved),
      overCents: over > 0 ? over : null,
      pct,
      expectedToDateCents: pace?.pacedTarget ?? Math.round(targetCents * monthElapsed),
      pace,
      paceLabel,
      detail,
    };
  };

  return [
    build('production', 'Production', targets.productionCents, thisMonth.productionCents, thisMonth.productionRecordedDays ?? thisMonth.days),
    build('collections', 'Collections', targets.collectionsCents, thisMonth.collectedCents, thisMonth.days),
  ];
}
