import type { Cents, FofTemplate } from './types';
import { percentOfCents } from './money';

/**
 * Discount policy for the FOF (the "Courtesy Credits" chart), expressed
 * as named org-scoped rules (Phase 2b). Templates REFERENCE rules —
 * senior/membership applicability flags — while the rule rows own the
 * values, so turning a program off or changing a rate touches one row,
 * not every template.
 *
 * - Contract (in-network) insurance and financing templates opt out
 *   entirely (seniorDiscountApplies=false, membershipDiscountPercent=0);
 *   exceptions are manager-approved via the manual Office Discount field.
 * - Standard (Self-Pay / Out-of-Network): under 65 with treatment at the
 *   senior threshold or more earns the courtesy prepay % by
 *   prepay-in-full; under the threshold gets no discount. Patients 65+
 *   earn the senior % by prepay at the threshold or more, and get it
 *   automatically under the threshold (due at time of service anyway).
 * - Membership: members always get the membership % automatically.
 *   Members 65+ can add the membership extra % by prepay-in-full (off
 *   the same pre-discount base), and under the threshold get the
 *   combined % automatically. Under 65 the membership % stands alone.
 *
 * The patient's 65+ status is entered at form time and lives only in
 * browser memory.
 */

export interface FofDiscountRules {
  /** 65+ program: automatic under the threshold, prepay-earned above. */
  senior: { enabled: boolean; percent: number; thresholdCents: Cents };
  /** Under-65 prepay-in-full courtesy credit. */
  courtesy: { enabled: boolean; percent: number };
  /**
   * In-house membership: percent applies automatically on membership
   * templates; extraPercent is the 65+ prepay-in-full add-on taken off
   * the same pre-discount base so the pair reads as one true rate.
   */
  membership: { enabled: boolean; percent: number; extraPercent: number };
}

/** Shipped defaults — the original office's proven program values. */
export const DEFAULT_DISCOUNT_RULES: FofDiscountRules = {
  senior: { enabled: true, percent: 10, thresholdCents: 100_000 as Cents },
  courtesy: { enabled: true, percent: 5 },
  membership: { enabled: true, percent: 10, extraPercent: 5 },
};

export interface FofDiscountDecision {
  /** Unconditional discount row printed under the Total; null = none. */
  autoDiscount: { label: string; cents: Cents } | null;
  /** Percent applied inside the Prepay in Full box (0 = no prepay discount). */
  prepayDiscountPercent: number;
  prepayDiscountLabel: string;
  /**
   * What the prepay percent is taken of: the remaining patient portion
   * (default), or the pre-discount total — the membership senior extra
   * comes off the same base as the membership % so the pair equals one
   * true combined rate.
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
  portionBeforeDiscountCents: Cents,
  rules: FofDiscountRules = DEFAULT_DISCOUNT_RULES
): FofDiscountDecision {
  const portion = Math.max(0, portionBeforeDiscountCents);
  const underThreshold = portion > 0 && portion < rules.senior.thresholdCents;
  const seniorEligible = isSenior && template.seniorDiscountApplies && rules.senior.enabled;
  // The template opts in (membershipDiscountPercent > 0); the rule row
  // owns the actual rate.
  const membershipPct =
    template.membershipDiscountPercent > 0 && rules.membership.enabled
      ? rules.membership.percent
      : 0;
  const courtesyPct = rules.courtesy.enabled ? rules.courtesy.percent : 0;

  if (membershipPct > 0) {
    if (seniorEligible && underThreshold) {
      const pct = membershipPct + rules.membership.extraPercent;
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
    // The prepay extra is a 65+ courtesy only; under 65 the membership
    // percent stands alone.
    return {
      autoDiscount: {
        label: `Membership Discount (${membershipPct}%)`,
        cents: percentOfCents(portion, membershipPct),
      },
      prepayDiscountPercent: seniorEligible ? rules.membership.extraPercent : 0,
      prepayDiscountLabel: seniorEligible
        ? `Prepay Discount (${rules.membership.extraPercent}%)`
        : '',
      prepayDiscountBase: 'preDiscountTotal',
    };
  }

  if (template.seniorDiscountApplies) {
    if (seniorEligible && underThreshold) {
      return {
        autoDiscount: {
          label: `Senior Discount (${rules.senior.percent}%)`,
          cents: percentOfCents(portion, rules.senior.percent),
        },
        prepayDiscountPercent: 0,
        prepayDiscountLabel: '',
        prepayDiscountBase: 'portion',
      };
    }
    // Not senior-eligible with treatment under the threshold: no
    // courtesy discount at all.
    if (!seniorEligible && underThreshold) {
      return {
        autoDiscount: null,
        prepayDiscountPercent: 0,
        prepayDiscountLabel: '',
        prepayDiscountBase: 'portion',
      };
    }
    const pct = seniorEligible ? rules.senior.percent : courtesyPct;
    return {
      autoDiscount: null,
      prepayDiscountPercent: pct,
      prepayDiscountLabel: pct > 0 ? `Prepay Discount (${pct}%)` : '',
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
