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

// Office policy: codes insurance never covers regardless of their CDT
// range — bio material (D4265), soft-tissue grafts adjunct (D4268),
// surgical guides (D5982), site preservation (D7953).
const NEVER_COVERED_CODES = new Set([4265, 4268, 5982, 7953]);

export function categorizeCdtCode(code: string): FeeCategory {
  const match = /^D(\d{4})$/i.exec(code.trim());
  if (!match) return 'other';
  const n = parseInt(match[1], 10);
  if (WORKUP_CODES.has(n)) return 'workup';
  if (NEVER_COVERED_CODES.has(n)) return 'other';
  if (n < 100) return 'other';
  if (n < 2000) return 'preventive'; // diagnostic + preventive
  if (n < 2400) return 'basic'; // fillings
  if (n < 3000) return 'major'; // inlays/onlays, crowns, build-ups
  if (n < 5000) return 'basic'; // endodontics, periodontics
  if (n < 7000) return 'major'; // prosthodontics, implants, bridges
  if (n < 8000) return 'basic'; // extractions, oral surgery
  return 'other'; // ortho, adjunctive
}
