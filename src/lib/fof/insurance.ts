/**
 * Plan-aware insurance estimation for the itemized FOF builder.
 *
 * HIPAA boundary: FofLine and PatientBenefits describe patient-specific
 * data that exists ONLY in browser memory (see types.ts). Plan rules and
 * fee schedules are de-identified configuration.
 *
 * Model (standard dental benefits math, always an estimate):
 * - Each line has the office fee and, when a plan is selected, the plan's
 *   allowed fee for that code (fallback: office fee).
 * - In-network write-off per line = office fee − allowed (never negative);
 *   only when the plan applies write-offs.
 * - Remaining deductible is consumed first by covered lines (optionally
 *   waived for preventive), then the plan pays category % of the rest,
 *   capped by the patient's remaining annual max.
 * - Patient portion = total − write-offs − insurance payment.
 */
import type { Cents } from './types';
import { percentOfCents } from './money';

export type FeeCategory = 'preventive' | 'basic' | 'major' | 'other';

export interface FofLine {
  code: string;
  description: string;
  category: FeeCategory;
  officeFeeCents: Cents;
  /** Plan allowed fee; null = no schedule entry, falls back to office fee. */
  allowedCents: Cents | null;
  /**
   * Alternate-benefit basis (downgrade): when set, the insurance payment
   * is computed from THIS fee (e.g. the amalgam allowed fee for a
   * posterior composite) while the patient's charge and any write-off
   * stay based on the actual procedure.
   */
  benefitBasisCents?: Cents | null;
  /**
   * Table-of-allowance plans (e.g. some Delta Dental fee-schedule plans):
   * the plan pays THIS set amount for the code — category percentages
   * don't apply — and the patient owes the difference up to the allowed
   * fee. 0 = the plan doesn't cover this code; null/undefined = the plan
   * is a normal percentage plan for this line.
   */
  fixedPayCents?: Cents | null;
  /**
   * Treatment spans two benefit years: true on lines whose visit falls in
   * the NEW benefit year. When any line carries this flag, the renewal
   * benefits switch in exactly at the first flagged line (calendar-driven)
   * instead of when the current year's max happens to run out.
   */
  inRenewalYear?: boolean;
  /**
   * Staff wrote the insurance payment for this line: use it verbatim
   * (no deductible/percentage math), still bounded by the remaining max
   * so the rest of the estimate stays consistent.
   */
  insurancePaysOverrideCents?: Cents | null;
}

export interface PlanRules {
  preventivePct: number;
  basicPct: number;
  majorPct: number;
  deductibleWaivedPreventive: boolean;
  writeoffApplies: boolean;
  /**
   * Some carriers (Altus, certain Delta Dental plans) stop honoring the
   * negotiated fee once the annual max is exhausted: remaining lines
   * revert to the office fee with no write-off or insurance payment.
   */
  officeFeesAfterMax?: boolean;
  /**
   * Some plans don't count preventive care toward the annual max:
   * preventive payments neither draw down nor are capped by the
   * remaining max, and hygiene stays covered after the max is spent.
   */
  preventiveExemptFromMax?: boolean;
}

/** Patient-specific remaining benefits, entered at form time. Memory only. */
export interface PatientBenefits {
  remainingDeductibleCents: Cents;
  remainingAnnualMaxCents: Cents;
  /**
   * When treatment spans two benefit years the plan renews mid-treatment:
   * once this year's max is exhausted, a fresh annual max becomes
   * available and the deductible re-applies.
   */
  renewal?: { annualMaxCents: Cents; deductibleCents: Cents } | null;
}

export interface LineEstimate {
  officeFeeCents: Cents;
  allowedCents: Cents;
  writeOffCents: Cents;
  deductibleAppliedCents: Cents;
  insurancePaysCents: Cents;
}

export interface InsuranceEstimate {
  totalCents: Cents;
  writeOffCents: Cents;
  insurancePaysCents: Cents;
  deductibleUsedCents: Cents;
  /**
   * True when this treatment plan exhausts the patient's annual max
   * (including any second benefit year) — used to warn the patient that
   * later visits will be out of pocket until benefits renew.
   */
  maxedOut: boolean;
  /** What's left of the (current) annual max after this treatment. */
  remainingMaxCents: Cents;
  perLine: LineEstimate[];
}

export function categoryPct(category: FeeCategory, plan: PlanRules): number {
  switch (category) {
    case 'preventive':
      return plan.preventivePct;
    case 'basic':
      return plan.basicPct;
    case 'major':
      return plan.majorPct;
    default:
      return 0;
  }
}

export function sumOfficeFees(lines: FofLine[]): Cents {
  return lines.reduce((sum, line) => sum + line.officeFeeCents, 0);
}

/**
 * Estimate insurance payment and write-offs across the lines, in order.
 * Without a plan, returns totals with zero insurance/write-off.
 */
export function estimateInsurance(
  lines: FofLine[],
  plan: PlanRules | null,
  benefits: PatientBenefits
): InsuranceEstimate {
  const totalCents = sumOfficeFees(lines);
  if (!plan) {
    return {
      totalCents,
      writeOffCents: 0,
      insurancePaysCents: 0,
      deductibleUsedCents: 0,
      maxedOut: false,
      remainingMaxCents: Math.max(0, benefits.remainingAnnualMaxCents),
      perLine: lines.map(line => ({
        officeFeeCents: line.officeFeeCents,
        allowedCents: line.allowedCents ?? line.officeFeeCents,
        writeOffCents: 0,
        deductibleAppliedCents: 0,
        insurancePaysCents: 0,
      })),
    };
  }

  let remainingDeductible = Math.max(0, benefits.remainingDeductibleCents);
  let remainingMax = Math.max(0, benefits.remainingAnnualMaxCents);
  let renewal = benefits.renewal ?? null;
  const perLine: LineEstimate[] = [];
  // When any line is marked as falling in the new benefit year, the
  // renewal is calendar-driven: it switches in at that line, and year-1
  // lines can NOT borrow from next year's max early.
  const boundaryDriven = lines.some(l => l.inRenewalYear);

  for (const line of lines) {
    // Benefit-year renewal: the next year's max opens up and its
    // deductible re-applies — at the first new-year visit when a visit
    // boundary is known, otherwise once this year's max is gone.
    if (renewal && (boundaryDriven ? line.inRenewalYear : remainingMax <= 0)) {
      remainingMax = Math.max(0, renewal.annualMaxCents);
      remainingDeductible = Math.max(0, renewal.deductibleCents);
      renewal = null;
    }
    const allowed = line.allowedCents ?? line.officeFeeCents;
    const pct = categoryPct(line.category, plan);
    const exemptFromMax = !!plan.preventiveExemptFromMax && line.category === 'preventive';
    // Once the max is gone, plans with officeFeesAfterMax stop covering
    // remaining lines entirely — office fee applies, no write-off.
    // Max-exempt preventive lines are unaffected by an exhausted max.
    const revertedToOfficeFee = !!plan.officeFeesAfterMax && remainingMax <= 0 && !exemptFromMax;
    const fixedPay = line.fixedPayCents ?? null;
    const covered = (fixedPay !== null ? fixedPay > 0 : pct > 0) && !revertedToOfficeFee;
    const writeOff =
      plan.writeoffApplies && covered ? Math.max(0, line.officeFeeCents - allowed) : 0;

    let deductibleApplied = 0;
    let insurancePays = 0;
    const payOverride = line.insurancePaysOverrideCents ?? null;

    if (payOverride !== null) {
      insurancePays = Math.max(0, payOverride);
      if (!exemptFromMax) {
        insurancePays = Math.min(insurancePays, remainingMax);
        remainingMax -= insurancePays;
      }
    } else if (covered) {
      // Downgraded lines pay benefits from the alternate (e.g. amalgam)
      // fee even though the patient is charged for the actual procedure.
      const benefitBasis = Math.min(line.benefitBasisCents ?? allowed, allowed);
      const deductibleWaived = line.category === 'preventive' && plan.deductibleWaivedPreventive;
      if (!deductibleWaived && remainingDeductible > 0) {
        deductibleApplied = Math.min(remainingDeductible, benefitBasis);
        remainingDeductible -= deductibleApplied;
      }
      // Table-of-allowance plans pay their set amount (never more than
      // the allowed fee); percentage plans pay category % of the basis.
      insurancePays =
        fixedPay !== null
          ? Math.max(0, Math.min(fixedPay, benefitBasis) - deductibleApplied)
          : percentOfCents(benefitBasis - deductibleApplied, pct);
      if (!exemptFromMax) {
        insurancePays = Math.min(insurancePays, remainingMax);
        remainingMax -= insurancePays;
      }
    }

    perLine.push({
      officeFeeCents: line.officeFeeCents,
      // Uncovered lines (and lines reverted after the max) fall back to
      // the office fee — the negotiated allowed fee doesn't apply.
      allowedCents: covered ? allowed : line.officeFeeCents,
      writeOffCents: writeOff,
      deductibleAppliedCents: deductibleApplied,
      insurancePaysCents: insurancePays,
    });
  }

  return {
    totalCents,
    writeOffCents: perLine.reduce((sum, l) => sum + l.writeOffCents, 0),
    insurancePaysCents: perLine.reduce((sum, l) => sum + l.insurancePaysCents, 0),
    deductibleUsedCents: perLine.reduce((sum, l) => sum + l.deductibleAppliedCents, 0),
    // Maxed only once every benefit year in play is spent — an untouched
    // renewal year means benefits are still available.
    maxedOut: remainingMax <= 0 && !renewal,
    remainingMaxCents: remainingMax,
    perLine,
  };
}
