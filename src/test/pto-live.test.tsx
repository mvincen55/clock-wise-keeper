import { describe, it, expect } from 'vitest';
import { getTierForDate } from '@/hooks/usePtoEngine';

describe('PTO employment tenure', () => {
  it('uses calendar anniversaries exactly', () => {
    expect(getTierForDate('2022-12-23', '2026-09-14').rate).toBe(.0769);
    expect(getTierForDate('2022-12-23', '2023-12-22').rate).toBe(.0576);
    expect(getTierForDate('2022-12-23', '2023-12-23').rate).toBe(.0769);
    expect(getTierForDate('2022-12-23', '2027-12-23').rate).toBe(.0962);
    expect(getTierForDate('2022-12-23', '2033-12-23').rate).toBe(.1009);
  });
});
