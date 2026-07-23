// Small money helpers for office pages (deposit log etc.). Kept separate
// from the FOF's money module so office features and the FOF can evolve
// independently.

const CURRENCY_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatCents(cents: number): string {
  return CURRENCY_FORMAT.format(cents / 100);
}

/** "$1,234.56" / "1234" / "1234.5" → integer cents; null for invalid. */
export function parseCurrencyInput(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '');
  if (!cleaned) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ''] = cleaned.split('.');
  return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
}
