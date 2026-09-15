import { describe, it, expect } from 'vitest';
import { computeRung } from '@/lib/broken-appts/engine';

// Rule 1: breaks count cumulatively within the rolling history window and
// the highest applicable rung wins. The LC→NS precedence case is the one
// staff historically miscount — it must land on Rung 3 (letter 0004), not
// Rung 2.

describe('computeRung', () => {
  it('first late cancellation → Rung 1', () => {
    expect(computeRung({ todayType: 'LC', priorLC: 0, priorNS: 0, onVip: false })).toBe(1);
  });

  it('first no-show → Rung 2', () => {
    expect(computeRung({ todayType: 'NS', priorLC: 0, priorNS: 0, onVip: false })).toBe(2);
  });

  it('LC then NS → Rung 3 (the 0004 precedence case, never Rung 2)', () => {
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

  it('pre-policy history skips Rung 1: a first late cancel lands on Rung 2 (letter 0002)', () => {
    // Governing Rule 5: breaks before the effective date never count toward
    // the ladder, but any at all means no courtesy credit — Rung 2 for
    // either event type, then the normal progression.
    expect(computeRung({ todayType: 'LC', priorLC: 0, priorNS: 0, prePolicyBreaks: 1, onVip: false })).toBe(2);
    expect(computeRung({ todayType: 'NS', priorLC: 0, priorNS: 0, prePolicyBreaks: 2, onVip: false })).toBe(2);
    expect(computeRung({ todayType: 'LC', priorLC: 1, priorNS: 0, prePolicyBreaks: 3, onVip: false })).toBe(3);
    expect(computeRung({ todayType: 'NS', priorLC: 0, priorNS: 1, prePolicyBreaks: 3, onVip: false })).toBe(4);
    // Without pre-policy history the first late cancel is still Rung 1.
    expect(computeRung({ todayType: 'LC', priorLC: 0, priorNS: 0, prePolicyBreaks: 0, onVip: false })).toBe(1);
  });

  it('0005 on the ledger → Rung 5 always, both event types, regardless of history', () => {
    // Management ruling: 0005 is TERMINAL. Once it has ever appeared —
    // including for patients later returned to regular scheduling — every
    // subsequent broken appointment routes to Rung 5 / OM, with no letter.
    expect(computeRung({ todayType: 'LC', priorLC: 0, priorNS: 0, onVip: true })).toBe(5);
    expect(computeRung({ todayType: 'NS', priorLC: 0, priorNS: 0, onVip: true })).toBe(5);
    expect(computeRung({ todayType: 'LC', priorLC: 5, priorNS: 5, onVip: true })).toBe(5);
    expect(computeRung({ todayType: 'NS', priorLC: 5, priorNS: 5, onVip: true })).toBe(5);
  });
});
