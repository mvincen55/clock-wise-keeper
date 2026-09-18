/**
 * Surgery that prepares a tooth for its restoration. On the same tooth as a
 * crown, bridge retainer, or post and core, it is one course of treatment
 * with three appointments (surgery, refined prep, delivery) rather than a
 * separate phase, and the payment schedule collects at each of them.
 */
const RESTORATION_SURGERY = new Set(['D4249', 'D4210', 'D4211', 'D4212']);

export function isRestorationSurgery(code: string): boolean {
  return RESTORATION_SURGERY.has(code.trim().toUpperCase());
}

/** Crowns, inlays/onlays, posts and cores, bridges and implant restorations. */
export function isRestorationProcedure(code: string): boolean {
  const match = /^D(\d{4})$/i.exec(code.trim());
  if (!match) return false;
  const n = Number(match[1]);
  return (n >= 2500 && n < 3000) || (n >= 6055 && n < 6800);
}

/** Tooth tokens on a line, normalized for comparison ("#11", "11", "3-14"). */
export function toothTokens(tooth: string | undefined): string[] {
  return (tooth ?? '').toUpperCase().replace(/#/g, '').split(/[\s,;/]+/).filter(Boolean);
}
