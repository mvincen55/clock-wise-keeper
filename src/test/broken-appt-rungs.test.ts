import { describe, it, expect } from 'vitest';
import { computeRung } from '@/lib/broken-appts/engine';

// Rule 1: breaks count cumulatively within the rolling history window and
// the highest applicable rung wins. The LC→NS precedence case is the one
// staff historically miscount — it must land on Rung 3 (letter 9106), not
// Rung 2.

describe('computeRung', () => {
  it('first late cancellation → Rung 1', () => {
    expect(computeRung({ todayType: 'LC', priorLC: 0, priorNS: 0, onVip: false })).toBe(1);
  });

  it('first no-show → Rung 2', () => {
    expect(computeRung({ todayType: 'NS', priorLC: 0, priorNS: 0, onVip: false })).toBe(2);
  });

  it('LC then NS → Rung 3 (the 9106 precedence case, never Rung 2)', () => {
    expect(computeRung({ todayType: 'NS', priorLC: 1, priorNS: 0, onVip: false })).toBe(3);
  });

  it('NS then LC → Rung 3', () => {
    expect(computeRung({ todayType: 'LC', priorLC: 0, priorNS: 1, onVip: false })).toBe(3);
  });

  it('LC then LC → Rung 3', () => {
    expect(computeRung({ todayType: 'LC', priorLC: 1, priorNS: 0, onVip: false })).toBe(3);
  });

  it('NS, NS → Rung 4 (repeat no-show jumps the ladder)', () => {
    expect(computeRung({ todayType: 'NS', priorLC: 0, priorNS: 1, onVip: false })).toBe(4);
  });

  it('LC, LC, then anything → Rung 4', () => {
    expect(computeRung({ todayType: 'LC', priorLC: 2, priorNS: 0, onVip: false })).toBe(4);
    expect(computeRung({ todayType: 'NS', priorLC: 2, priorNS: 0, onVip: false })).toBe(4);
  });

  it('anything while on VIP → Rung 5, regardless of history', () => {
    expect(computeRung({ todayType: 'LC', priorLC: 0, priorNS: 0, onVip: true })).toBe(5);
    expect(computeRung({ todayType: 'NS', priorLC: 5, priorNS: 5, onVip: true })).toBe(5);
  });
});
