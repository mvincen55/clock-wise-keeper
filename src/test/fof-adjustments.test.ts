import { describe, expect, it } from 'vitest';
import { allocateAcrossLines } from '@/lib/fof/adjustments';

describe('form-level discounts spread across lines', () => {
  it('splits in proportion to each line, in whole cents that sum exactly', () => {
    expect(allocateAcrossLines(10000, [50000, 30000, 20000])).toEqual([5000, 3000, 2000]);
    const parts = allocateAcrossLines(10000, [33333, 33333, 33334]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(10000);
    expect(parts).toEqual([3333, 3333, 3334]);
  });
  it('gives nothing to lines that cost the patient nothing', () => {
    expect(allocateAcrossLines(900, [0, 300, 600])).toEqual([0, 300, 600]);
    expect(allocateAcrossLines(900, [0, 0])).toEqual([0, 0]);
  });
  it('handles a credit that raises the portion, and nothing to spread', () => {
    expect(allocateAcrossLines(-500, [100, 100])).toEqual([-250, -250]);
    expect(allocateAcrossLines(0, [100, 100])).toEqual([0, 0]);
  });
});
