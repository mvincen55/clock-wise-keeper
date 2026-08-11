/**
 * Money handling for the Account Balance Explainer.
 *
 * Every amount is integer cents — never floating-point dollars. Ledger cells
 * arrive from OCR, so parsing accepts Dentrix's negative conventions
 * ("-119.00", "(119.00)", "119.00-") plus common OCR noise, and refuses to
 * guess when a cell is not clearly an amount.
 */
import type { Cents } from './types';

const CURRENCY_FORMAT = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

/** "$1,234.56" / "-$119.00". */
export function formatCents(cents: Cents): string {
  // Normalize -0 so we never print "-$0.00".
  return CURRENCY_FORMAT.format((cents === 0 ? 0 : cents) / 100);
}

/** Always-signed form for adjustment lines: "-$75.00", "+$395.00". */
export function formatSignedCents(cents: Cents): string {
  if (cents > 0) return `+${CURRENCY_FORMAT.format(cents / 100)}`;
  return formatCents(cents);
}

export interface ParsedAmount {
  cents: Cents;
  /** True when the source text was ambiguous enough to want human eyes. */
  uncertain: boolean;
}

/**
 * Parse one ledger money cell into signed integer cents.
 *
 * Returns null for blank cells and for text that is not an amount — a null
 * is surfaced as "Please verify", never silently treated as zero.
 */
export function parseLedgerAmount(raw: string): ParsedAmount | null {
  if (!raw) return null;
  let text = raw.trim();
  if (text === '' || text === '-' || text === '—') return null;

  // Reject cells that are mostly words, not numbers — "Payment" must never
  // become an amount no matter how it is de-noised.
  const numericChars = (text.match(/[\d.,()$\-−\s]/g) ?? []).length;
  if (numericChars / text.length < 0.6) return null;

  // OCR glyph noise inside otherwise-numeric cells: letter O reads as zero.
  let uncertain = false;
  if (/[Oo]/.test(text)) {
    uncertain = true;
    text = text.replace(/[Oo]/g, '0');
  }

  // Sign conventions: leading minus, trailing minus, parentheses.
  let negative = false;
  if (/^\(.*\)$/.test(text)) {
    negative = true;
    text = text.slice(1, -1);
  }
  if (text.startsWith('-') || text.startsWith('−')) {
    negative = true;
    text = text.slice(1);
  }
  if (text.endsWith('-') || text.endsWith('−')) {
    negative = true;
    text = text.slice(0, -1);
  }

  text = text.replace(/[$,\s]/g, '');
  if (text === '') return null;
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;

  const [whole, frac = ''] = text.split('.');
  if (frac.length === 1) uncertain = true; // ".5" endings are usually a misread
  const cents = parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, '0') || '0', 10);
  return { cents: negative ? -cents : cents, uncertain };
}

/** Parse a staff-typed amount ("−119", "-119.00", "395") into signed cents. */
export function parseSignedInput(input: string): Cents | null {
  const parsed = parseLedgerAmount(input);
  return parsed ? parsed.cents : null;
}

/**
 * "MM/DD/YYYY" (Dentrix) or "MM/DD/YY" → ISO yyyy-mm-dd, else null.
 *
 * Tolerant of ledger-cell OCR noise: row markers ("*", "·") and stray
 * punctuation around the date are ignored, and common digit-glyph confusions
 * inside a date-shaped token (O→0, l/I→1) are repaired. Only the date shape
 * itself is trusted — text without a valid month/day never parses.
 */
export function parseLedgerDate(raw: string): string | null {
  if (!raw) return null;
  const deNoised = raw.replace(/\s+/g, '').replace(/[Oo]/g, '0').replace(/[lI]/g, '1');
  const m = deNoised.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?!\d)/);
  if (!m) return null;
  if (m[3].length === 3) return null; // "203" is a truncated year, not a date
  const month = parseInt(m[1], 10);
  const day = parseInt(m[2], 10);
  let year = parseInt(m[3], 10);
  if (m[3].length === 2) year += year >= 70 ? 1900 : 2000;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** ISO yyyy-mm-dd → "February 12, 2026" (patient-facing). */
export function formatDateLong(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${MONTHS[parseInt(m[2], 10) - 1]} ${parseInt(m[3], 10)}, ${m[1]}`;
}

/** ISO yyyy-mm-dd → "2/12/2026" (staff tables). */
export function formatDateShort(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return iso;
  return `${parseInt(m[2], 10)}/${parseInt(m[3], 10)}/${m[1]}`;
}
