import type { Cents, FofTemplate } from './types';
import { percentOfCents } from './money';

/**
 * Office discount policy for the FOF (per the "Courtesy Credits" chart):
 *
 * - Contract (in-network) insurance and financing templates opt out
 *   entirely (seniorDiscountApplies=false, membershipDiscountPercent=0);
 *   exceptions are manager-approved via the manual Office Discount field.
 * - Standard (Self-Pay / Out-of-Network): under 65 with treatment $1,000+
 *   earns 5% by prepay-in-full; under $1,000 gets no discount. Patients
 *   65+ earn 10% by prepay at $1,000+, and get the 10% senior discount
 *   automatically under $1,000 (due at time of service anyway).
 * - Membership (Illumitrac): members always get the membership % (10%)
 *   automatically. Members 65+ can add a 5% prepay-in-full extra (off the
 *   same pre-discount base), and under $1,000 get the combined 15%
 *   automatically. Under 65 the 10% stands alone — no prepay extra.
 *
 * The patient's 65+ status is entered at form time and lives only in
 * browser memory.
 */

export const SENIOR_RULES = {
  portionThresholdCents: 100_000 as Cents, // $1,000
  standardPct: 10, // 65+ rate (automatic under the threshold, prepay above)
  under65PrepayPct: 5,
  membershipExtraPct: 5,
};

export interface FofDiscountDecision {
  /** Unconditional discount row printed under the Total; null = none. */
  autoDiscount: { label: string; cents: Cents } | null;
  /** Percent applied inside the Prepay in Full box (0 = no prepay discount). */
  prepayDiscountPercent: number;
  prepayDiscountLabel: string;
  /**
   * What the prepay percent is taken of: the remaining patient portion
   * (default), or the pre-discount total — the Illumitrac senior +5% comes
   * off the same base as the membership 10% so the pair equals a true 15%.
   */
  prepayDiscountBase: 'portion' | 'preDiscountTotal';
}

type TemplateRules = Pick<
  FofTemplate,
  'discountPercent' | 'discountLabel' | 'membershipDiscountPercent' | 'seniorDiscountApplies'
>;

export function computeFofDiscounts(
  template: TemplateRules,
  isSenior: boolean,
  portionBeforeDiscountCents: Cents
): FofDiscountDecision {
  const portion = Math.max(0, portionBeforeDiscountCents);
  const underThreshold = portion > 0 && portion < SENIOR_RULES.portionThresholdCents;
  const seniorEligible = isSenior && template.seniorDiscountApplies;
  const membershipPct = template.membershipDiscountPercent;

  if (membershipPct > 0) {
    if (seniorEligible && underThreshold) {
      const pct = membershipPct + SENIOR_RULES.membershipExtraPct;
      return {
        autoDiscount: {
          label: `Membership + Senior Discount (${pct}%)`,
          cents: percentOfCents(portion, pct),
        },
        prepayDiscountPercent: 0,
        prepayDiscountLabel: '',
        prepayDiscountBase: 'portion',
      };
    }
    // The +5% prepay extra is a 65+ courtesy only; under 65 the
    // membership 10% stands alone.
    return {
      autoDiscount: {
        label: `Membership Discount (${membershipPct}%)`,
        cents: percentOfCents(portion, membershipPct),
      },
      prepayDiscountPercent: seniorEligible ? SENIOR_RULES.membershipExtraPct : 0,
      prepayDiscountLabel: seniorEligible
        ? `Prepay Discount (${SENIOR_RULES.membershipExtraPct}%)`
        : '',
      prepayDiscountBase: 'preDiscountTotal',
    };
  }

  if (template.seniorDiscountApplies) {
    if (seniorEligible && underThreshold) {
      return {
        autoDiscount: {
          label: `Senior Discount (${SENIOR_RULES.standardPct}%)`,
          cents: percentOfCents(portion, SENIOR_RULES.standardPct),
        },
        prepayDiscountPercent: 0,
        prepayDiscountLabel: '',
        prepayDiscountBase: 'portion',
      };
    }
    // Under 65 with treatment under $1,000: no courtesy discount at all.
    if (!isSenior && underThreshold) {
      return {
        autoDiscount: null,
        prepayDiscountPercent: 0,
        prepayDiscountLabel: '',
        prepayDiscountBase: 'portion',
      };
    }
    const pct = isSenior ? SENIOR_RULES.standardPct : SENIOR_RULES.under65PrepayPct;
    return {
      autoDiscount: null,
      prepayDiscountPercent: pct,
      prepayDiscountLabel: `Prepay Discount (${pct}%)`,
      prepayDiscountBase: 'portion',
    };
  }

  return {
    autoDiscount: null,
    prepayDiscountPercent: template.discountPercent,
    prepayDiscountLabel: template.discountLabel,
    prepayDiscountBase: 'portion',
  };
}
