// Shared deterministic pace math for the office scoreboard.
//
// One formula, three metrics: production, collections, and new patients seen
// are each paced ONLY against their own monthly target. This module is the
// single home of that math so Owner, Manager, and Team dashboards can never
// drift apart. Pure functions of recorded data — no AI, no invented targets.
//
// Data-honesty rules enforced here:
//  - no target (or nothing recorded) → null, never a fake "0% of goal";
//  - a pace verdict always carries the numbers it was computed from;
//  - prior-month actuals are comparisons, never relabeled as targets.

export type PaceStatus = 'ahead' | 'on_pace' | 'behind';

export type MetricPace = {
  /** Month-to-date actual (cents for money metrics, count for patients). */
  actual: number;
  /** The FULL configured monthly target. */
  target: number;
  /** target × monthElapsed — what "on pace" looks like right now. */
  pacedTarget: number;
  /** actual − pacedTarget; positive = ahead. */
  diff: number;
  /** Fraction of the full monthly target reached so far. */
  pctOfTarget: number;
  status: PaceStatus;
};

/** Within ±2% of the full monthly goal counts as "on pace". */
const ON_PACE_BAND = 0.02;

/**
 * Month-to-date actual vs its OWN monthly target, paced by month elapsed.
 *
 * Null when no target is configured or no days are recorded this month —
 * "no goal configured" and "nothing entered yet" are stated, not scored.
 *
 * Callers must pass the matching target: production vs the production goal,
 * collections vs the collections goal, patients seen vs the new-patient goal.
 * Cross-wiring targets is a correctness bug, not a styling choice.
 *
 * `onPaceBand` overrides the ±2% tolerance in absolute units — count metrics
 * pass ±1 patient so a 12-patient goal is not judged to a quarter-patient.
 */
export function metricPace(args: {
  actual: number;
  target: number;
  /** Fraction of the month elapsed, 0–1. */
  monthElapsed: number;
  /** Closed-out days backing `actual`. 0 = nothing recorded, no verdict. */
  recordedDays: number;
  onPaceBand?: number;
}): MetricPace | null {
  const { actual, target, monthElapsed, recordedDays } = args;
  if (target <= 0 || recordedDays <= 0) return null;
  const pacedTarget = Math.round(target * monthElapsed);
  const diff = actual - pacedTarget;
  const band = args.onPaceBand ?? target * ON_PACE_BAND;
  const status: PaceStatus =
    Math.abs(diff) <= band ? 'on_pace' : diff > 0 ? 'ahead' : 'behind';
  return {
    actual,
    target,
    pacedTarget,
    diff,
    pctOfTarget: actual / target,
    status,
  };
}

/**
 * Approximate weekly pace for a monthly count goal:
 * monthly target ÷ (days in month ÷ 7), rounded up to a whole unit.
 *
 * Calendar pacing on purpose — Purple Envelope does not know the office's
 * future working days, so this is labeled an approximation wherever shown.
 */
export function weeklyPaceForMonth(monthlyTarget: number, daysInMonth: number): number | null {
  if (monthlyTarget <= 0 || daysInMonth <= 0) return null;
  return Math.ceil(monthlyTarget / (daysInMonth / 7));
}

/** Calendar days in the month containing a YYYY-MM-DD date. */
export function daysInMonthOf(date: string): number {
  const [y, m] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
