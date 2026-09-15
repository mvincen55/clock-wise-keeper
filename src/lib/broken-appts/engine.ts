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
  /** Prior late cancellations under this policy, within the history window. */
  priorLC: number;
  /** Prior no-shows under this policy, within the history window. */
  priorNS: number;
  /**
   * Broken appointments before the policy's effective date, within the
   * history window (Governing Rule 5). They never count toward the ladder,
   * but a patient with any skips Rung 1: the first break under the policy
   * is handled at Rung 2 with no courtesy credit (letter 0003 for a no-show,
   * 0002 for a late cancellation).
   */
  prePolicyBreaks?: number;
  /**
   * 0005 has ever appeared on the patient's ledger (VIP-only / Office
   * Manager process). Terminal by management ruling: a return to regular
   * scheduling never resets it — every subsequent break is Rung 5, both
   * event types, and no letter is ever sent.
   */
  onVip: boolean;
}

export function computeRung({ todayType, priorLC, priorNS, prePolicyBreaks = 0, onVip }: RungInput): Rung {
  if (onVip) return 5;
  const total = priorLC + priorNS + 1;
  if (total >= 3) return 4;
  if (total === 2) {
    // Second break under the policy: a repeat no-show jumps to Rung 4;
    // every other combination — including LC-then-NS — is Rung 3 (letter 0004).
    if (todayType === 'NS' && priorNS >= 1) return 4;
    return 3;
  }
  // First break under the policy: a no-show, or any break by a patient
  // with pre-policy history, starts at Rung 2.
  if (todayType === 'NS' || prePolicyBreaks > 0) return 2;
  return 1;
}
