import type { BaLetterCode, BrokenApptType, Rung } from './types';

/**
 * The rung engine — which step of the broken-appointment policy today's
 * event lands on, and which letter it produces. The ladder is driven by
 * the letter codes already on the ledger within the history window, not by
 * counting events; when more than one rung could apply, the highest wins
 * (Rule 1). Pre-policy broken appointments have no letter codes, so they
 * never inflate the rung — they only set the entry point (the transition
 * rule): the first post-policy break is handled at Rung 2 with no courtesy
 * credit.
 *
 * 0005 is TERMINAL (management ruling, final): once it has ever appeared
 * on the ledger — including for patients later returned to regular
 * scheduling — every subsequent broken appointment routes to Rung 5 / the
 * Office Manager, both event types, and no letter is ever sent.
 */

export interface RungInput {
  /** What happened today (a late arrival the provider couldn't seat is NS). */
  todayType: BrokenApptType;
  /** Highest letter code on the ledger within the window (null = none). */
  highestLetterCode: BaLetterCode | null;
  /** Any broken appointments before policy_effective_date, within the window. */
  hasPrePolicyPriors: boolean;
}

export interface RungResult {
  rung: Rung;
  /** The letter today's event produces (null — Rung 5 sends no letter, ever). */
  letterCode: BaLetterCode | null;
}

export function computeRung({
  todayType,
  highestLetterCode,
  hasPrePolicyPriors,
}: RungInput): RungResult {
  switch (highestLetterCode) {
    case '0005':
      // Terminal — the Office Manager owns every break from here on.
      return { rung: 5, letterCode: null };
    case '0004':
      return { rung: 4, letterCode: '0005' };
    case '0003':
      // The double no-show shortcut — only a ledgered 0003 triggers it.
      return todayType === 'NS' ? { rung: 4, letterCode: '0005' } : { rung: 3, letterCode: '0004' };
    case '0001':
    case '0002':
      return { rung: 3, letterCode: '0004' };
    case null:
      if (todayType === 'NS') return { rung: 2, letterCode: '0003' };
      // First-ever late cancel: pre-policy priors skip the courtesy rung.
      return hasPrePolicyPriors
        ? { rung: 2, letterCode: '0002' }
        : { rung: 1, letterCode: '0001' };
  }
}
