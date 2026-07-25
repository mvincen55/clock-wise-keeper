import { describe, it, expect } from 'vitest';
import {
  parseCurrencyInput,
  formatCents,
  percentOfCents,
  splitCents,
} from '@/lib/fof/money';

describe('splitCents', () => {
  it('matches the office sheet golden case: $11,819.00 / 3', () => {
    expect(splitCents(1_181_900, 3)).toEqual([393_966, 393_967, 393_967]);
  });

  it('splits exact divisions evenly', () => {
    expect(splitCents(300, 3)).toEqual([100, 100, 100]);
  });

  it('puts a single remainder cent on the last installment', () => {
    expect(splitCents(100, 3)).toEqual([33, 33, 34]);
  });

  it('handles n=1 and zero totals', () => {
    expect(splitCents(12_345, 1)).toEqual([12_345]);
    expect(splitCents(0, 3)).toEqual([0, 0, 0]);
  });

  it('returns empty for non-positive part counts', () => {
    expect(splitCents(100, 0)).toEqual([]);
  });

  it('always sums back to the total', () => {
    const totals = [1, 7, 99, 101, 1_181_900, 999_999_99, 123_456_789];
    for (const total of totals) {
      for (let n = 1; n <= 6; n++) {
        const parts = splitCents(total, n);
        expect(parts).toHaveLength(n);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });
});

describe('percentOfCents', () => {
  it('computes the standard 10% office discount', () => {
    expect(percentOfCents(157_300, 10)).toBe(15_730);
    expect(percentOfCents(1_181_900, 10)).toBe(118_190);
  });

  it('rounds half up on fractional cents', () => {
    expect(percentOfCents(5, 10)).toBe(1); // 0.5¢ → 1¢
    expect(percentOfCents(4, 10)).toBe(0);
  });

  it('returns 0 for a 0% discount', () => {
    expect(percentOfCents(1_642_500, 0)).toBe(0);
  });
});

describe('parseCurrencyInput', () => {
  it('parses formatted currency strings', () => {
    expect(parseCurrencyInput('$1,234.56')).toBe(123_456);
    expect(parseCurrencyInput('$11,819.00')).toBe(1_181_900);
  });

  it('parses bare numbers and single decimals', () => {
    expect(parseCurrencyInput('1234')).toBe(123_400);
    expect(parseCurrencyInput('1234.5')).toBe(123_450);
    expect(parseCurrencyInput('0.07')).toBe(7);
  });

  it('rejects invalid input', () => {
    expect(parseCurrencyInput('')).toBeNull();
    expect(parseCurrencyInput('1.999')).toBeNull();
    expect(parseCurrencyInput('-5')).toBeNull();
    expect(parseCurrencyInput('abc')).toBeNull();
    expect(parseCurrencyInput('12.34.56')).toBeNull();
  });
});

describe('formatCents', () => {
  it('formats with dollar sign, commas, and two decimals', () => {
    expect(formatCents(1_181_900)).toBe('$11,819.00');
    expect(formatCents(393_966)).toBe('$3,939.66');
    expect(formatCents(0)).toBe('$0.00');
    expect(formatCents(7)).toBe('$0.07');
  });
});
