/**
 * Saved insurance plan defaults, applied to the form when staff pick a
 * carrier schedule.
 *
 * A plan row (insurance_plans) is office configuration: the coverage
 * percentages, the deductible and the annual maximum the office EXPECTS a
 * plan to carry. None of that is the patient's verified eligibility, so the
 * builder applies these values as unverified estimates and asks staff to
 * confirm or correct the patient's remaining deductible and maximum before
 * the form prints. Nothing here touches patient data.
 */
import type { InsurancePlan } from '@/hooks/useFeeSchedules';

export interface PlanDefaults {
  planId: string;
  planName: string;
  pctPrev: number;
  pctBasic: number;
  pctMajor: number;
  deductibleCents: number;
  annualMaxCents: number;
  deductibleWaivedPreventive: boolean;
  writeoffApplies: boolean;
  officeFeesAfterMax: boolean;
  isInNetwork: boolean;
  /** null = follow the office default; true/false = this plan's own rule. */
  alternateBenefitDowngrade: boolean | null;
}

/** Active saved plans linked to the schedule, in their configured order. */
export function plansForSchedule(
  scheduleId: string,
  plans: readonly InsurancePlan[] | undefined
): InsurancePlan[] {
  return (plans ?? []).filter(plan => plan.isActive && plan.feeScheduleId === scheduleId);
}

export function planDefaults(plan: InsurancePlan): PlanDefaults {
  return {
    planId: plan.id,
    planName: plan.name,
    pctPrev: clampPercent(plan.preventivePct, 100),
    pctBasic: clampPercent(plan.basicPct, 80),
    pctMajor: clampPercent(plan.majorPct, 50),
    deductibleCents: nonNegativeCents(plan.deductibleCents),
    annualMaxCents: nonNegativeCents(plan.annualMaxCents),
    deductibleWaivedPreventive: plan.deductibleWaivedPreventive,
    writeoffApplies: plan.writeoffApplies,
    officeFeesAfterMax: plan.officeFeesAfterMax,
    isInNetwork: plan.isInNetwork,
    alternateBenefitDowngrade: plan.alternateBenefitDowngrade ?? null,
  };
}

/** Generic form defaults used when no plan is saved for the carrier. */
export const GENERIC_PLAN_DEFAULTS: Omit<PlanDefaults, 'planId' | 'planName'> = {
  pctPrev: 100,
  pctBasic: 80,
  pctMajor: 50,
  deductibleCents: 5000,
  annualMaxCents: 150000,
  deductibleWaivedPreventive: true,
  writeoffApplies: true,
  officeFeesAfterMax: false,
  isInNetwork: true,
  alternateBenefitDowngrade: null,
};

function clampPercent(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function nonNegativeCents(value: number): number {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

/**
 * Whether a downgrade-eligible filling starts with the alternate-benefit
 * toggle on: the plan's own rule when it has one, otherwise the office's
 * FOF setting.
 */
export function downgradeDefault(
  officeDefaultOn: boolean,
  plan: Pick<PlanDefaults, 'alternateBenefitDowngrade'> | null
): boolean {
  if (plan && plan.alternateBenefitDowngrade !== null) return plan.alternateBenefitDowngrade;
  return officeDefaultOn;
}

/** Percent input validation: whole number 0-100, or null when malformed. */
export function parsePercentInput(input: string): number | null {
  const trimmed = input.trim().replace(/%$/, '').trim();
  if (!/^\d{1,3}$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return n >= 0 && n <= 100 ? n : null;
}
