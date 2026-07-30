/**
 * Which standing wording rules actually concern a given procedure.
 *
 * Standing rules (fof_ai_guidance) are global — they are taught through
 * the FOF assistant and are not attached to any code. But showing all of
 * them while editing one code is noise, and worse, implies rules apply to
 * that procedure when they don't: a rule about surgical guides has nothing
 * to say about a crown.
 *
 * So a rule is surfaced against a code only when it actually mentions that
 * procedure — by code, or by a meaningful word from its patient-friendly
 * name or description. Rules that match nothing still exist and still
 * apply; the UI says how many, rather than hiding them.
 *
 * Deliberately keyword-based, not AI: this runs on every dialog open, must
 * be instant and deterministic, and a manager needs to be able to predict
 * why a rule showed up.
 */

// Words too generic to indicate a rule is about a specific procedure.
// "tooth" and "delivery" are the important ones — nearly every dental rule
// mentions a tooth, and "delivery" appears in the lab-work rule that would
// otherwise match every code whose name contains it.
const STOPWORDS = new Set([
  'a', 'all', 'an', 'and', 'any', 'are', 'at', 'by', 'for', 'from', 'in', 'is', 'it', 'of',
  'on', 'or', 'per', 'the', 'to', 'with',
  'anterior', 'posterior', 'upper', 'lower', 'left', 'right',
  'single', 'each', 'additional', 'complete', 'partial', 'limited', 'comprehensive',
  'tooth', 'teeth', 'dental', 'visit', 'patient', 'office', 'fee', 'code',
]);

/** Strip a trailing plural 's' so "crowns" and "crown" match. */
const singular = (word: string): string =>
  word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;

/**
 * Meaningful lowercase terms identifying a procedure: its code (with and
 * without the D) plus content words from its friendly name and
 * description. Practice-management shorthand ("CrnAllCer") rarely matches
 * prose, but costs nothing to include.
 */
export function procedureTerms(
  code: string,
  friendlyName: string | null,
  description: string
): string[] {
  const terms = new Set<string>();
  const trimmedCode = code.trim().toUpperCase();
  if (/^D?\d{4}$/.test(trimmedCode)) {
    const digits = trimmedCode.replace(/^D/, '');
    terms.add(`d${digits}`);
    terms.add(digits);
  }
  for (const source of [friendlyName ?? '', description]) {
    for (const raw of source.toLowerCase().split(/[^a-z0-9]+/)) {
      if (raw.length < 4) continue;
      const word = singular(raw);
      if (STOPWORDS.has(word) || word.length < 4) continue;
      terms.add(word);
    }
  }
  return [...terms];
}

/** True when the rule text mentions the term as a word (plural tolerated). */
function mentions(ruleLower: string, term: string): boolean {
  // Escape is unnecessary — terms are alphanumeric by construction.
  return new RegExp(`\\b${term}s?\\b`).test(ruleLower);
}

/**
 * Split standing rules into those that mention this procedure and those
 * that don't. Both are in force; only the first set belongs in a
 * code-specific panel.
 */
export function partitionRulesByProcedure(
  rules: string[],
  terms: string[]
): { matching: string[]; others: string[] } {
  if (terms.length === 0) return { matching: [], others: [...rules] };
  const matching: string[] = [];
  const others: string[] = [];
  for (const rule of rules) {
    const lower = rule.toLowerCase();
    if (terms.some(term => mentions(lower, term))) matching.push(rule);
    else others.push(rule);
  }
  return { matching, others };
}
