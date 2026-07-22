import type { Cents, FofTemplate } from './types';
import { percentOfCents } from './money';

/**
 * Office discount policy for the FOF:
 *
 * - Standard (Self-Pay / Out-of-Network): the template's prepay discount
 *   (10%) applies only via the Prepay in Full agreement — EXCEPT patients
 *   65+ with a patient portion under $1,000, who get 10% automatically
 *   with no prepay requirement (and nothing extra for prepaying).
 * - Membership (Illumitrac): members always get the membership % (10%)
 *   automatically. Members 65+ get +5% — automatic when the portion is
 *   under $1,000, prepay-in-full-only at $1,000 and above.
 * - In-network insurance and financing templates opt out entirely
 *   (seniorDiscountApplies=false, membershipDiscountPercent=0).
 *
 * The patient's 65+ status is entered at form time and lives only in
 * browser memory.
 */

export const SENIOR_RULES = {
  portionThresholdCents: 100_000 as Cents, // $1,000
  standardPct: 10,
  membershipExtraPct: 5,
};

export interface FofDiscountDecision {
  /** Unconditional discount row printed under the Total; null = none. */
  autoDiscount: { label: string; cents: Cents } | null;
  /** Percent applied inside the Prepay in Full box (0 = no prepay discount). */
  prepayDiscountPercent: number;
  prepayDiscountLabel: string;
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
      };
    }
    const autoDiscount = {
      label: `Membership Discount (${membershipPct}%)`,
      cents: percentOfCents(portion, membershipPct),
    };
    if (seniorEligible) {
      return {
        autoDiscount,
        prepayDiscountPercent: SENIOR_RULES.membershipExtraPct,
        prepayDiscountLabel: `Senior Prepay Discount (${SENIOR_RULES.membershipExtraPct}%)`,
      };
    }
    return { autoDiscount, prepayDiscountPercent: 0, prepayDiscountLabel: '' };
  }

  if (seniorEligible && underThreshold) {
    return {
      autoDiscount: {
        label: `Senior Discount (${SENIOR_RULES.standardPct}%)`,
        cents: percentOfCents(portion, SENIOR_RULES.standardPct),
      },
      prepayDiscountPercent: 0,
      prepayDiscountLabel: '',
    };
  }

  return {
    autoDiscount: null,
    prepayDiscountPercent: template.discountPercent,
    prepayDiscountLabel: template.discountLabel,
  };
}
