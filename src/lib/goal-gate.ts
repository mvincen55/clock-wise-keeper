/**
 * The S+M gate — the one hard rule on goals.
 *
 * A goal can be saved (created OR edited) only when it is Specific and
 * Measurable: a non-empty polished title and a non-empty measurable target.
 * When Pathfinder returns a SMART read, `specific` and `measurable` must both
 * be present. Achievable / Relevant / Time-bound stay advisory forever — they
 * are coaching, never a blocker.
 *
 * Pure and dependency-free so the create card, the edit dialog and the tests
 * all judge a goal the same way.
 */

export type SmartFlags = {
  specific?: boolean;
  measurable?: boolean;
  achievable?: boolean;
  relevant?: boolean;
  time_bound?: boolean;
};

export type GoalGateInput = {
  title: string;
  target: string;
  /** Optional SMART read from Pathfinder; absent means "not judged yet". */
  smart?: SmartFlags | null;
};

export type GoalGateResult = {
  ok: boolean;
  /** Plain hints keyed by the chip they belong under. */
  hints: { specific?: string; measurable?: string };
};

const HINT_SPECIFIC = 'make it specific — say what you will actually do';
const HINT_MEASURABLE = 'make it measurable — add a number or count';

/** Turn Pathfinder's free-text SMART read into flags (text present = met). */
export function flagsFromSmartText(
  smart: Record<string, string | undefined | null> | null | undefined
): SmartFlags | null {
  if (!smart) return null;
  const has = (k: string) => !!(smart[k] ?? '').trim();
  return {
    specific: has('specific'),
    measurable: has('measurable'),
    achievable: has('achievable'),
    relevant: has('relevant'),
    time_bound: has('time_bound'),
  };
}

export function evaluateGoalGate({ title, target, smart }: GoalGateInput): GoalGateResult {
  const hints: GoalGateResult['hints'] = {};

  if (!title.trim()) hints.specific = HINT_SPECIFIC;
  else if (smart && smart.specific === false) hints.specific = HINT_SPECIFIC;

  if (!target.trim()) hints.measurable = HINT_MEASURABLE;
  else if (smart && smart.measurable === false) hints.measurable = HINT_MEASURABLE;

  return { ok: !hints.specific && !hints.measurable, hints };
}

/** Convenience for disabling a Save button. */
export function canSaveGoal(input: GoalGateInput): boolean {
  return evaluateGoalGate(input).ok;
}
