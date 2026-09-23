/**
 * Spread a form-level amount (an office discount, a patient credit, a
 * membership or senior discount) across procedure lines in proportion to
 * what each line costs the patient, in whole cents that always sum exactly
 * to the amount. Largest-remainder rounding; zero-weight lines get nothing.
 */
export function allocateAcrossLines(totalCents: number, weights: number[]): number[] {
  if (!Number.isSafeInteger(totalCents) || totalCents === 0) return weights.map(() => 0);
  const safe = weights.map(w => (Number.isFinite(w) && w > 0 ? w : 0));
  const sum = safe.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const sign = totalCents < 0 ? -1 : 1;
  const magnitude = Math.abs(totalCents);
  const exact = safe.map(w => (magnitude * w) / sum);
  const floors = exact.map(Math.floor);
  let remaining = magnitude - floors.reduce((a, b) => a + b, 0);
  const order = exact.map((value, i) => ({ i, fraction: value - floors[i] })).sort((a, b) => b.fraction - a.fraction || a.i - b.i);
  for (const { i } of order) { if (remaining <= 0) break; if (safe[i] > 0) { floors[i] += 1; remaining -= 1; } }
  return floors.map(cents => sign * cents);
}
