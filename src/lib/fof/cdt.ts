import type { FeeCategory } from './insurance';

/**
 * Auto-categorize a procedure code into the standard dental coverage
 * buckets by its CDT range. The mapping is effectively universal across
 * carriers; individual codes can always be recategorized by hand.
 *
 * Only D-prefixed codes are real CDT — bare numbers and lettered codes
 * are custom office codes, which are never insurance-covered ('other').
 */
export function categorizeCdtCode(code: string): FeeCategory {
  const match = /^D(\d{4})$/i.exec(code.trim());
  if (!match) return 'other';
  const n = parseInt(match[1], 10);
  if (n < 100) return 'other';
  if (n < 2000) return 'preventive'; // diagnostic + preventive
  if (n < 2400) return 'basic'; // fillings
  if (n < 3000) return 'major'; // inlays/onlays, crowns, build-ups
  if (n < 5000) return 'basic'; // endodontics, periodontics
  if (n < 7000) return 'major'; // prosthodontics, implants, bridges
  if (n < 8000) return 'basic'; // extractions, oral surgery
  return 'other'; // ortho, adjunctive
}
