import type { Cents } from './types';

const CURRENCY_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/**
 * Parse a user-typed dollar amount ("$1,234.56", "1234", "1234.5") into
 * integer cents. Returns null for empty/invalid input (including more than
 * two decimal places, negatives, or stray characters).
 */
export function parseCurrencyInput(input: string): Cents | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
}

export function formatCents(cents: Cents): string {
  return CURRENCY_FORMAT.format(cents / 100);
}

export function percentOfCents(cents: Cents, percent: number): Cents {
  return Math.round((cents * percent) / 100);
}

/**
 * Split a total into n installments that always sum exactly to the total.
 * Remainder cents go to the LAST installments, matching the office's
 * existing sheets: $11,819.00 / 3 → 3,939.66 / 3,939.67 / 3,939.67.
 */
export function splitCents(total: Cents, parts: number): Cents[] {
  if (parts <= 0) return [];
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return Array.from({ length: parts }, (_, i) =>
    i >= parts - remainder ? base + 1 : base
  );
}
