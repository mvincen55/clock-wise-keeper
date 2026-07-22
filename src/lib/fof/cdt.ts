import type { FeeCategory } from './insurance';

/**
 * Auto-categorize a procedure code into the standard dental coverage
 * buckets by its CDT range. The mapping is effectively universal across
 * carriers; individual codes can always be recategorized by hand.
 *
 * Accepts "D2740" or bare "2740" (practice systems often drop the D).
 * Codes that aren't 4-digit CDT (custom office codes, letter suffixes)
 * come back as 'other'.
 */
export function categorizeCdtCode(code: string): FeeCategory {
  const match = /^D?(\d{4})$/i.exec(code.trim());
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
