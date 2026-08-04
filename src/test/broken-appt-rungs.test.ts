import { describe, it, expect } from 'vitest';
import { computeRung } from '@/lib/broken-appts/engine';

// Rule 1: the ladder is driven by the letter codes already on the ledger
// (within the rolling window) — not by counting events — and the highest
// applicable rung wins. The 0001-then-no-show precedence case is the one
// staff historically miscount: it must land on Rung 3 (letter 0004), never
// Rung 2. The transition rule rides along for free: pre-policy breaks have
// no letter codes, so they never inflate the rung — they only set the
// entry point.

const clean = { hasPrePolicyPriors: false } as const;

describe('computeRung', () => {
  it('clean first late cancellation → Rung 1, letter 0001', () => {
    expect(computeRung({ todayType: 'LC', highestLetterCode: null, ...clean })).toEqual({
      rung: 1,
      letterCode: '0001',
    });
  });

  it('clean first no-show → Rung 2, letter 0003', () => {
    expect(computeRung({ todayType: 'NS', highestLetterCode: null, ...clean })).toEqual({
      rung: 2,
      letterCode: '0003',
    });
  });

  it('pre-policy priors + first LC → Rung 2, letter 0002 (no courtesy credit)', () => {
    expect(
      computeRung({ todayType: 'LC', highestLetterCode: null, hasPrePolicyPriors: true })
    ).toEqual({ rung: 2, letterCode: '0002' });
  });

  it('pre-policy priors + first NS → Rung 2, letter 0003', () => {
    expect(
      computeRung({ todayType: 'NS', highestLetterCode: null, hasPrePolicyPriors: true })
    ).toEqual({ rung: 2, letterCode: '0003' });
  });

  it('0001 then NS → Rung 3 / 0004 (the precedence case — never Rung 2)', () => {
    expect(computeRung({ todayType: 'NS', highestLetterCode: '0001', ...clean })).toEqual({
      rung: 3,
      letterCode: '0004',
    });
  });

  it('0001 or 0002 on the ledger → Rung 3 / 0004 for either type', () => {
    expect(computeRung({ todayType: 'LC', highestLetterCode: '0001', ...clean }).rung).toBe(3);
    expect(computeRung({ todayType: 'LC', highestLetterCode: '0002', ...clean }).rung).toBe(3);
    expect(computeRung({ todayType: 'NS', highestLetterCode: '0002', ...clean }).rung).toBe(3);
  });

  it('0003 then NS → Rung 4 / 0005 (double no-show)', () => {
    expect(computeRung({ todayType: 'NS', highestLetterCode: '0003', ...clean })).toEqual({
      rung: 4,
      letterCode: '0005',
    });
  });

  it('0003 then LC → Rung 3 / 0004', () => {
    expect(computeRung({ todayType: 'LC', highestLetterCode: '0003', ...clean })).toEqual({
      rung: 3,
      letterCode: '0004',
    });
  });

  it('priors + 0002 then NS → Rung 3 (pre-policy events never trigger the double-no-show shortcut)', () => {
    expect(
      computeRung({ todayType: 'NS', highestLetterCode: '0002', hasPrePolicyPriors: true })
    ).toEqual({ rung: 3, letterCode: '0004' });
  });

  it('0004 on the ledger → Rung 4 / 0005 for either type', () => {
    expect(computeRung({ todayType: 'LC', highestLetterCode: '0004', ...clean })).toEqual({
      rung: 4,
      letterCode: '0005',
    });
    expect(computeRung({ todayType: 'NS', highestLetterCode: '0004', ...clean })).toEqual({
      rung: 4,
      letterCode: '0005',
    });
  });

  it('0005 on the ledger → Rung 5 always, both event types, no letter ever', () => {
    // Management ruling: 0005 is TERMINAL. Once it has ever appeared —
    // including for patients later returned to regular scheduling — every
    // subsequent broken appointment routes to Rung 5 / OM, with no letter.
    expect(computeRung({ todayType: 'LC', highestLetterCode: '0005', ...clean })).toEqual({
      rung: 5,
      letterCode: null,
    });
    expect(computeRung({ todayType: 'NS', highestLetterCode: '0005', ...clean })).toEqual({
      rung: 5,
      letterCode: null,
    });
    expect(
      computeRung({ todayType: 'NS', highestLetterCode: '0005', hasPrePolicyPriors: true })
    ).toEqual({ rung: 5, letterCode: null });
  });
});
