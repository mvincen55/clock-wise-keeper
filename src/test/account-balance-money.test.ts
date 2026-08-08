/** Cents parsing for the Account Balance Explainer — integers only, signed. */
import { describe, it, expect } from 'vitest';
import {
  formatCents,
  formatSignedCents,
  parseLedgerAmount,
  parseLedgerDate,
  parseSignedInput,
  formatDateLong,
} from '@/lib/account-balance/money';

describe('parseLedgerAmount', () => {
  it('parses plain and formatted dollar amounts into cents', () => {
    expect(parseLedgerAmount('395.00')?.cents).toBe(39500);
    expect(parseLedgerAmount('$1,234.56')?.cents).toBe(123456);
    expect(parseLedgerAmount('67')?.cents).toBe(6700);
    expect(parseLedgerAmount('0.00')?.cents).toBe(0);
  });

  it('parses Dentrix negative conventions without flipping signs', () => {
    expect(parseLedgerAmount('-119.00')?.cents).toBe(-11900);
    expect(parseLedgerAmount('(119.00)')?.cents).toBe(-11900);
    expect(parseLedgerAmount('119.00-')?.cents).toBe(-11900);
    expect(parseLedgerAmount('-385.55')?.cents).toBe(-38555);
  });

  it('returns null for blanks and non-amounts instead of guessing', () => {
    expect(parseLedgerAmount('')).toBeNull();
    expect(parseLedgerAmount('—')).toBeNull();
    expect(parseLedgerAmount('Payment')).toBeNull();
    expect(parseLedgerAmount('VISA')).toBeNull();
  });

  it('flags OCR-noisy values as uncertain rather than fixing them silently', () => {
    const parsed = parseLedgerAmount('1O9.00'); // letter O misread
    expect(parsed?.cents).toBe(10900);
    expect(parsed?.uncertain).toBe(true);
  });

  it('never uses floating point: cents stay exact', () => {
    expect(parseLedgerAmount('318.55')?.cents).toBe(31855);
    expect(parseLedgerAmount('97.70')?.cents).toBe(9770);
    expect(parseLedgerAmount('21.30')?.cents).toBe(2130);
    expect(31855 - 38555 + 6700).toBe(0);
  });
});

describe('parseSignedInput', () => {
  it('accepts staff-typed signed values', () => {
    expect(parseSignedInput('-75')).toBe(-7500);
    expect(parseSignedInput('75.00')).toBe(7500);
    expect(parseSignedInput('abc')).toBeNull();
  });
});

describe('formatting', () => {
  it('formats cents as currency, without a negative zero', () => {
    expect(formatCents(63900)).toBe('$639.00');
    expect(formatCents(-11900)).toBe('-$119.00');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(-0)).toBe('$0.00');
  });

  it('formats signed amounts for adjustment lines', () => {
    expect(formatSignedCents(7500)).toBe('+$75.00');
    expect(formatSignedCents(-7500)).toBe('-$75.00');
  });
});

describe('parseLedgerDate', () => {
  it('parses Dentrix dates to ISO', () => {
    expect(parseLedgerDate('06/10/2026')).toBe('2026-06-10');
    expect(parseLedgerDate('2/3/26')).toBe('2026-02-03');
    expect(parseLedgerDate('13/40/2026')).toBeNull();
    expect(parseLedgerDate('Resin')).toBeNull();
  });

  it('renders long patient-facing dates', () => {
    expect(formatDateLong('2026-02-12')).toBe('February 12, 2026');
  });
});
