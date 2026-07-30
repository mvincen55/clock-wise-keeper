import type { SmartRead } from '@/components/goals/SmartChips';

/**
 * The hard gate on saving a goal: it must be Specific and Measurable.
 * A, R and T stay advisory — coaching, never a blocker.
 *
 * Concretely: a non-empty title AND a non-empty measurable target. When
 * Pathfinder has returned a SMART read-out, its specific + measurable lines
 * must read as satisfied rather than as a nudge.
 */
export type SmartGate = {
  specificOk: boolean;
  measurableOk: boolean;
  passes: boolean;
  /** Plain hint for the failing element, or null when both pass. */
  hint: string | null;
};

/** Nudges come back as "add a number…" style prompts rather than a read-out. */
const NUDGE = /\b(add|needs?|missing|try|include|no measure|make it|unclear|vague)\b/i;

function readingSatisfied(line: string | undefined): boolean {
  const value = (line ?? '').trim();
  if (!value) return false;
  return !NUDGE.test(value);
}

export function evaluateSmartGate(input: {
  title: string;
  target: string;
  smart?: SmartRead | null;
}): SmartGate {
  const title = input.title.trim();
  const target = input.target.trim();

  let specificOk = title.length >= 12;
  let measurableOk = target.length > 0;

  if (input.smart) {
    specificOk = specificOk && readingSatisfied(input.smart.specific);
    measurableOk = measurableOk && readingSatisfied(input.smart.measurable);
  }

  const hint = !specificOk
    ? 'make it specific — say what you will actually do'
    : !measurableOk
      ? 'make it measurable — add a number or count'
      : null;

  return { specificOk, measurableOk, passes: specificOk && measurableOk, hint };
}
