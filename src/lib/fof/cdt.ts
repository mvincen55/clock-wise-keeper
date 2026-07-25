import type { FeeCategory } from './insurance';

/**
 * Auto-categorize a procedure code into the standard dental coverage
 * buckets by its CDT range. The mapping is effectively universal across
 * carriers; individual codes can always be recategorized by hand.
 *
 * Only D-prefixed codes are real CDT — bare numbers and lettered codes
 * are custom office codes, which are never insurance-covered ('other').
 */
// Diagnostic work-up codes (CT scan, diagnostic models): no coverage,
// billed at their visit rather than prepaid.
const WORKUP_CODES = new Set([367, 470]);

/**
 * Shipped default for the org-scoped never-covered list (fof_code_rules,
 * kind 'never_covered'): codes insurance never covers regardless of CDT
 * range — bio material (D4265), soft-tissue grafts adjunct (D4268),
 * surgical guides (D5982), site preservation (D7953).
 */
export const SHIPPED_NEVER_COVERED_CODES: ReadonlySet<string> = new Set([
  'D4265', 'D4268', 'D5982', 'D7953',
]);

/**
 * Shipped default for kind 'no_prepay': fees billed AT their visit with
 * no half-ahead prepay in the schedule (the surgical guide).
 */
export const SHIPPED_NO_PREPAY_CODES: ReadonlySet<string> = new Set(['D5982']);

/**
 * Shipped default for kind 'membership_included': procedures the
 * in-house membership plan includes at no charge — cleanings
 * (adult/child/perio), exams, emergency exam, needed X-rays (CBCT
 * excluded), fluoride and sealants (child plan).
 */
export const SHIPPED_MEMBERSHIP_INCLUDED_CODES: ReadonlySet<string> = new Set([
  'D0120', 'D0140', 'D0150', // exams + emergency exam
  'D0210', 'D0220', 'D0230', 'D0272', 'D0274', 'D0330', // X-rays (no CBCT)
  'D1110', 'D1120', 'D4910', // cleanings incl. perio maintenance
  'D1206', 'D1208', 'D1351', // fluoride + sealant (child plan)
]);

export function categorizeCdtCode(
  code: string,
  neverCovered: ReadonlySet<string> = SHIPPED_NEVER_COVERED_CODES
): FeeCategory {
  const match = /^D(\d{4})$/i.exec(code.trim());
  if (!match) return 'other';
  const normalized = `D${match[1]}`;
  const n = parseInt(match[1], 10);
  if (WORKUP_CODES.has(n)) return 'workup';
  if (neverCovered.has(normalized)) return 'other';
  if (n < 100) return 'other';
  if (n < 2000) return 'preventive'; // diagnostic + preventive
  if (n < 2400) return 'basic'; // fillings
  if (n < 3000) return 'major'; // inlays/onlays, crowns, build-ups
  if (n < 5000) return 'basic'; // endodontics, periodontics
  if (n < 7000) return 'major'; // prosthodontics, implants, bridges
  if (n < 8000) return 'basic'; // extractions, oral surgery
  return 'other'; // ortho, adjunctive
}
