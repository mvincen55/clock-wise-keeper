/**
 * Late arrivals — the one vocabulary every surface reads.
 *
 * A late arrival is a fact the attendance engine writes (a `tardies` row:
 * scheduled start, actual start, minutes past grace). What the office does
 * with it is three separate things, and this module keeps them apart:
 *
 *  - acknowledgment: a receipt — who acknowledged it and when. It is not a
 *    gate: an unacknowledged late arrival counts exactly like an
 *    acknowledged one, and dismissing the prompt records nothing.
 *  - excuse status: unexcused unless a manager says otherwise. An employee
 *    may ask for it to be excused; the request is pending until a manager
 *    decides excused (never counts) or unexcused (counts).
 *  - the threshold: unexcused arrivals inside the office's rolling window
 *    open an attendance incident report (see `incidents.ts`). Corrected or
 *    suspect times never count.
 *
 * `countsTowardThreshold` mirrors `late_arrival_counts()` in the database,
 * which is the rule the evaluator actually applies; this copy exists so the
 * app can explain standing ("2 of 3 in the last 30 days") without a call.
 */
import { formatDate, shiftDate } from '@/lib/time-utils';

export type ExcuseState = 'unexcused' | 'pending' | 'excused';

export type LateArrivalLike = {
  minutes_late: number;
  approval_status: string;
  excuse_requested_at?: string | null;
  acknowledged_at?: string | null;
  resolved?: boolean | null;
  timezone_suspect?: boolean | null;
};

export function excuseState(t: LateArrivalLike): ExcuseState {
  if (t.approval_status === 'approved') return 'excused';
  if (t.approval_status === 'unreviewed' && t.excuse_requested_at) return 'pending';
  return 'unexcused';
}

export const EXCUSE_LABELS: Record<ExcuseState, string> = {
  unexcused: 'Unexcused',
  pending: 'Excuse requested: pending review',
  excused: 'Excused',
};

export const EXCUSE_CLASSES: Record<ExcuseState, string> = {
  unexcused: 'bg-muted text-muted-foreground',
  pending: 'bg-warning/20 text-warning',
  excused: 'bg-success/20 text-success',
};

/** Has a manager decided this one (either way)? */
export function isDecided(t: LateArrivalLike): boolean {
  return t.approval_status === 'approved' || t.approval_status === 'unapproved';
}

/** A real late arrival on the record: minutes past grace, trusted clock, not corrected away. */
export function isLiveLateArrival(t: LateArrivalLike): boolean {
  return t.minutes_late > 0 && !t.timezone_suspect && !t.resolved;
}

/** Mirrors late_arrival_counts() in the database. */
export function countsTowardThreshold(t: LateArrivalLike): boolean {
  return isLiveLateArrival(t) && t.approval_status !== 'approved' && excuseState(t) !== 'pending';
}

/**
 * Does this arrival still wait on the employee's answer? Only a live,
 * undecided, unrequested, unacknowledged one: that is the prompt condition.
 * Ignoring it changes nothing about how it counts.
 */
export function awaitsEmployeeAnswer(t: LateArrivalLike): boolean {
  return isLiveLateArrival(t) && t.approval_status === 'unreviewed' && !t.excuse_requested_at && !t.acknowledged_at;
}

/* ------------------------------ the rule ------------------------------ */

export type LateArrivalRule = {
  threshold_count: number;
  threshold_window_days: number;
  is_active: boolean;
  /**
   * The first day that counts (YYYY-MM-DD). An office that announces the
   * rule sets this to the day counting starts: late arrivals before it stay
   * on the record but never count, never open a report, and never ride
   * along on one. Null (or absent) counts everything on the record.
   */
  counts_from?: string | null;
};

/** The default every office starts with. */
export const DEFAULT_LATE_ARRIVAL_RULE: LateArrivalRule = { threshold_count: 3, threshold_window_days: 30, is_active: true, counts_from: null };

/** The rule's counting start, or null when it counts everything. */
export function countsFrom(rule: Pick<LateArrivalRule, 'counts_from'>): string | null {
  return rule.counts_from && /^\d{4}-\d{2}-\d{2}$/.test(rule.counts_from) ? rule.counts_from : null;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "3 unexcused late arrivals within a rolling 30-day period" */
export function ruleClause(rule: LateArrivalRule): string {
  return `${plural(rule.threshold_count, 'unexcused late arrival')} within a rolling ${rule.threshold_window_days}-day period`;
}

/** One sentence for a settings card, a report, or a notification. */
export function ruleSentence(rule: LateArrivalRule): string {
  if (!rule.is_active) return 'The late-arrival rule is off: late arrivals are recorded but never open a report.';
  const from = countsFrom(rule);
  return `${ruleClause(rule)} open an attendance incident report automatically.${from ? ` Counting starts ${formatDate(from)}.` : ''}`;
}

/** The fine print, the same for employees and managers. */
export function ruleExplanation(rule: LateArrivalRule): string[] {
  return [
    `A late arrival is a clock-in after the scheduled start plus the office grace period; the schedule and grace period are unchanged by this rule.`,
    `Acknowledging a late arrival is a receipt, not an excuse. An acknowledged and an unacknowledged late arrival count the same.`,
    `An approved excuse never counts. A pending excuse request does not count until it is decided; a declined request counts from the decision.`,
    `A corrected or suspect clock-in never counts.`,
    `The window rolls: any ${rule.threshold_window_days} consecutive days holding ${rule.threshold_count} qualifying late arrivals meet the rule.`,
    `Meeting the rule opens one report listing the dates. While it is open, later late arrivals attach to it; after it closes, a new report needs a fresh set inside the window.`,
    `The report documents the threshold crossing. It closes only after a meeting with the team member and both signatures.`,
    ...(countsFrom(rule)
      ? [`Late arrivals before ${formatDate(countsFrom(rule)!)} stay on the record but do not count toward the rule: counting starts that day.`]
      : []),
  ];
}

/** First day of the rolling window that ends on `endDate` (inclusive). */
export function windowStart(endDate: string, windowDays: number): string {
  return shiftDate(endDate, -(Math.max(1, windowDays) - 1));
}

/**
 * First day that counts as of `today`: the rolling window's start, cut at
 * the rule's counting start when that is later. What every reading of
 * "the last N days" has to use once an office has announced its rule.
 */
export function countingStart(rule: LateArrivalRule, today: string): string {
  const start = windowStart(today, rule.threshold_window_days);
  const from = countsFrom(rule);
  return from && from > start ? from : start;
}

export type Standing = {
  /** Qualifying late arrivals in the window ending today. */
  counting: number;
  /** Pending excuse requests in the window (separate; not counted). */
  pending: number;
  /** How many more would meet the rule; 0 when already met. */
  remaining: number;
  windowStart: string;
  windowEnd: string;
  /** Set when the counting start cut the window short: the day counting began. */
  since: string | null;
};

/**
 * Where a person stands against the rule as of `today`, from their late
 * arrivals. Display only: the database decides when a report opens, and it
 * also excludes arrivals already attached to a report, which this does not
 * see — so this reads as "in the last N days", never as a verdict.
 */
export function standingToday(
  arrivals: (LateArrivalLike & { entry_date: string })[],
  rule: LateArrivalRule,
  today: string,
): Standing {
  const rolling = windowStart(today, rule.threshold_window_days);
  const start = countingStart(rule, today);
  const inWindow = arrivals.filter(a => a.entry_date >= start && a.entry_date <= today);
  const counting = inWindow.filter(countsTowardThreshold).length;
  const pending = inWindow.filter(a => isLiveLateArrival(a) && excuseState(a) === 'pending').length;
  return {
    counting, pending, remaining: Math.max(0, rule.threshold_count - counting),
    windowStart: start, windowEnd: today, since: start > rolling ? start : null,
  };
}

/** "2 of 3 unexcused late arrivals in the last 30 days", or "since Oct 7, 2026" once the counting start cuts the window. */
export function standingSentence(s: Standing, rule: LateArrivalRule): string {
  const span = s.since ? `since ${formatDate(s.since)}` : `in the last ${rule.threshold_window_days} days`;
  const base = `${s.counting} of ${rule.threshold_count} unexcused late arrival${rule.threshold_count === 1 ? '' : 's'} ${span}`;
  return s.pending > 0 ? `${base} · ${plural(s.pending, 'excuse request')} pending` : base;
}
