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
}

/** Patient-specific remaining benefits, entered at form time. Memory only. */
export interface PatientBenefits {
  remainingDeductibleCents: Cents;
  remainingAnnualMaxCents: Cents;
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
  const perLine: LineEstimate[] = [];

  for (const line of lines) {
    const allowed = line.allowedCents ?? line.officeFeeCents;
    const pct = categoryPct(line.category, plan);
    // Once the max is gone, plans with officeFeesAfterMax stop covering
    // remaining lines entirely — office fee applies, no write-off.
    const revertedToOfficeFee = !!plan.officeFeesAfterMax && remainingMax <= 0;
    const covered = pct > 0 && !revertedToOfficeFee;
    const writeOff =
      plan.writeoffApplies && covered ? Math.max(0, line.officeFeeCents - allowed) : 0;

    let deductibleApplied = 0;
    let insurancePays = 0;

    if (covered) {
      const deductibleWaived = line.category === 'preventive' && plan.deductibleWaivedPreventive;
      if (!deductibleWaived && remainingDeductible > 0) {
        deductibleApplied = Math.min(remainingDeductible, allowed);
        remainingDeductible -= deductibleApplied;
      }
      insurancePays = percentOfCents(allowed - deductibleApplied, pct);
      insurancePays = Math.min(insurancePays, remainingMax);
      remainingMax -= insurancePays;
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
    perLine,
  };
}
