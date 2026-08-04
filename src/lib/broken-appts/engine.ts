import type { BrokenApptType, Rung } from './types';

/**
 * The rung engine — which step of the broken-appointment policy today's
 * event lands on. Broken appointments (late cancels + no-shows) count
 * cumulatively within the org's rolling history window; when more than
 * one rung could apply, the highest wins (Rule 1).
 */

export interface RungInput {
  /** What happened today (a late arrival the provider couldn't seat is NS). */
  todayType: BrokenApptType;
  /** Prior late cancellations within the history window. */
  priorLC: number;
  /** Prior no-shows within the history window. */
  priorNS: number;
  /**
   * 0005 has ever appeared on the patient's ledger (VIP-only / Office
   * Manager process). Terminal by management ruling: a return to regular
   * scheduling never resets it — every subsequent break is Rung 5, both
   * event types, and no letter is ever sent.
   */
  onVip: boolean;
}

export function computeRung({ todayType, priorLC, priorNS, onVip }: RungInput): Rung {
  if (onVip) return 5;
  const total = priorLC + priorNS + 1;
  if (total >= 3) return 4;
  if (total === 2) {
    // Second-ever break: a repeat no-show jumps to Rung 4; every other
    // combination — including LC-then-NS — is Rung 3 (letter 9106).
    if (todayType === 'NS' && priorNS >= 1) return 4;
    return 3;
  }
  return todayType === 'NS' ? 2 : 1;
}
