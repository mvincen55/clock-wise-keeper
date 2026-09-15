/**
 * Live fees for handbook reference tables (pure, testable).
 *
 * An uploaded handbook often carries a "Commonly used codes" table with the
 * office fees as of the day it was written. The office fee schedule is the
 * source of truth, so the reader shows the current fee for every code it can
 * resolve and keeps the handbook's printed figure visible only where it
 * differs. Nothing here is office-specific: codes come from the document,
 * fees from the schedule.
 */

/** Uppercase CDT code → fee in cents, from the active office schedule. */
export type FeeByCode = Map<string, number>;

// CDT codes (D0120), CDT codes with an office suffix (D9944p, D0140m), and
// the office's own numeric codes (4002, 9100) or short letter codes (D002).
const CODE = /\b(?:D\d{3,4}[a-z]?|\d{4})\b/gi;
const CODE_RANGE = /\b(D\d{4})[a-z]?\s*[-–—]\s*(D\d{4})[a-z]?\b/i;
const FEE_HEADER = /\b(fee|fees|price|prices|cost|charge|rate)\b/i;
const CODE_HEADER = /\bcodes?\b/i;
const MAX_RANGE = 12;

/**
 * Codes named in a cell, uppercased. "D2391 - D2394" expands to the whole
 * range, "D4341 / D4342" lists both, and an office suffix ("D9944p") is kept
 * so the schedule's own suffixed entry matches first (see feeFor).
 */
export function codesInCell(text: string): string[] {
  const codes: string[] = [];
  const add = (code: string) => {
    if (!codes.includes(code)) codes.push(code);
  };
  const range = text.match(CODE_RANGE);
  if (range) {
    const from = parseInt(range[1].slice(1), 10);
    const to = parseInt(range[2].slice(1), 10);
    if (to > from && to - from <= MAX_RANGE) {
      for (let n = from; n <= to; n++) add(`D${String(n).padStart(4, '0')}`);
    }
  }
  for (const match of text.matchAll(CODE)) add(match[0].toUpperCase());
  return codes;
}

/** The schedule's fee for a code: the exact entry, else the base CDT code behind an office suffix. */
export function feeFor(code: string, byCode: FeeByCode): number | undefined {
  const exact = byCode.get(code);
  if (typeof exact === 'number') return exact;
  const base = code.match(/^(D\d{4})[A-Z]$/);
  return base ? byCode.get(base[1]) : undefined;
}

export const feeColumnIndex = (header: string[]): number => header.findIndex(cell => FEE_HEADER.test(cell));

/** The column holding codes: a "Code" header when present, else the first column. */
export const codeColumnIndex = (header: string[]): number => {
  const index = header.findIndex(cell => CODE_HEADER.test(cell));
  return index === -1 ? 0 : index;
};

/** A table with a fee column and codes to look the fees up by. */
export function isFeeTable(rows: string[][]): boolean {
  if (rows.length < 2) return false;
  const header = rows[0];
  if (feeColumnIndex(header) === -1) return false;
  const codeColumn = codeColumnIndex(header);
  return rows.slice(1).some(row => codesInCell(row[codeColumn] ?? '').length > 0);
}

/** "$1,569" for whole dollars, "$1,569.50" otherwise. */
export function formatFee(cents: number): string {
  const dollars = cents / 100;
  return Number.isInteger(dollars)
    ? `$${dollars.toLocaleString('en-US')}`
    : `$${dollars.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * The current fee(s) for a cell's codes, or null when the schedule has none
 * of them. A range shows its low and high fee; a pair shows both, with a
 * dash for one the schedule lacks.
 */
export function liveFeeLabel(codes: string[], byCode: FeeByCode): string | null {
  const fees = codes.map(code => feeFor(code, byCode));
  const known = fees.filter((fee): fee is number => typeof fee === 'number');
  if (known.length === 0) return null;
  if (codes.length === 1 || (known.length === codes.length && new Set(known).size === 1)) return formatFee(known[0]);
  if (codes.length >= 3) return `${formatFee(Math.min(...known))} – ${formatFee(Math.max(...known))}`;
  return fees.map(fee => (typeof fee === 'number' ? formatFee(fee) : '—')).join(' / ');
}

const toCents = (whole: string, fraction: string | undefined): number =>
  parseInt(whole.replace(/,/g, ''), 10) * 100 + (fraction ? parseInt(fraction.padEnd(2, '0'), 10) : 0);

/** Dollar amounts named in a piece of text, in cents, in order; "$231-449" names two. */
export function dollarAmounts(text: string): number[] {
  const amounts: number[] = [];
  for (const match of text.matchAll(/\$\s?(\d[\d,]*)(?:\.(\d{1,2}))?(?:\s*[-–—]\s*\$?(\d[\d,]*)(?:\.(\d{1,2}))?)?/g)) {
    amounts.push(toCents(match[1], match[2]));
    if (match[3]) amounts.push(toCents(match[3], match[4]));
  }
  return amounts;
}

/** Whether the handbook's printed figure still matches the live fee label. */
export function printedFeeMatches(printed: string, live: string): boolean {
  const before = dollarAmounts(printed);
  const after = dollarAmounts(live);
  return before.length > 0 && before.length === after.length && before.every((cents, index) => cents === after[index]);
}
