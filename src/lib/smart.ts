/**
 * The S+M hard gate.
 *
 * A goal only saves when it is at least Specific and Measurable. A, R and T
 * stay as coaching (SmartChips) — they are judgment calls. S and M are not:
 * without them nobody can tell at month end whether the goal was met.
 */

export const SMART_MIN_TITLE_WORDS = 4;
export const SMART_MIN_TITLE_CHARS = 12;

export type SmartGateResult = {
  /** Title reads as a concrete, non-vague commitment. */
  specific: boolean;
  /** A target exists and contains a countable quantity. */
  measurable: boolean;
  /** Both S and M pass — the only condition that allows a save. */
  ok: boolean;
  /** Plain-language reasons, in the order they should be shown. */
  reasons: string[];
};

/** Words that describe a mood, not a commitment. */
const VAGUE = [
  'better',
  'improve',
  'improvement',
  'more',
  'less',
  'good',
  'great',
  'nice',
  'try',
  'harder',
  'faster',
  'stuff',
  'things',
];

const NUMBER_WORDS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'daily',
  'weekly',
  'every day',
  'each day',
  'each week',
];

const words = (value: string) => value.trim().split(/\s+/).filter(Boolean);

/** A target is measurable when it carries a count, a percent, or a rate. */
export function hasQuantity(target: string): boolean {
  const t = target.toLowerCase().trim();
  if (!t) return false;
  if (/\d/.test(t)) return true;
  return NUMBER_WORDS.some(w => new RegExp(`\\b${w}\\b`).test(t));
}

/** A title is specific when it is more than a couple of vague words. */
export function isSpecific(title: string): boolean {
  const t = title.trim();
  if (t.length < SMART_MIN_TITLE_CHARS) return false;
  const parts = words(t);
  if (parts.length < SMART_MIN_TITLE_WORDS) return false;
  const meaningful = parts.filter(w => !VAGUE.includes(w.toLowerCase().replace(/[^a-z]/g, '')));
  return meaningful.length >= SMART_MIN_TITLE_WORDS - 1;
}

export function evaluateSmartGate(input: { title: string; target: string }): SmartGateResult {
  const specific = isSpecific(input.title ?? '');
  const measurable = hasQuantity(input.target ?? '');
  const reasons: string[] = [];
  if (!specific) {
    reasons.push('Say what you will actually do — a few concrete words, not just "do better".');
  }
  if (!measurable) {
    reasons.push('Add a number you can count at month end (e.g. "4 feedback asks").');
  }
  return { specific, measurable, ok: specific && measurable, reasons };
}
