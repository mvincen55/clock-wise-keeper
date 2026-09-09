import type {
  FofAmounts,
  FofComputation,
  FofComputedValues,
  FofOverrides,
  FofTemplate,
} from './types';
import { percentOfCents, splitCents } from './money';
import { splitCentsWeighted, type VisitPlan } from './visits';
import type { PaymentSchedule } from './payment-engine';

/**
 * Derive all money values on the form from the template rules and the
 * patient-entered amounts. Every derived value can be manually overridden;
 * overriding the patient portion re-derives discount and installments from
 * the overridden portion, while individual overrides only replace themselves.
 *
 * When a visit plan is provided it governs the installment count, labels,
 * and weighting (front-loaded for lab-heavy work); otherwise the template's
 * even split applies.
 */
export function computeFof(
  template: FofTemplate,
  amounts: FofAmounts,
  overrides: FofOverrides = {},
  visitPlan?: VisitPlan,
  paymentSchedule?: PaymentSchedule
): FofComputation {
  const total = amounts.totalCents ?? 0;
  const insurance = template.showInsuranceEstimate ? amounts.insuranceEstimateCents ?? 0 : 0;
  const writeOff = template.showWriteOff ? amounts.writeOffCents ?? 0 : 0;
  const officeDiscount = amounts.officeDiscountCents ?? 0;
  const patientCredit = amounts.patientCreditCents ?? 0;
  const autoDiscount = amounts.autoDiscount?.cents ?? 0;
  const membershipCovered = amounts.membershipCoveredCents ?? 0;

  const computedPortion = Math.max(
    0,
    total - officeDiscount - patientCredit - autoDiscount - membershipCovered - insurance - writeOff
  );
  const effectivePortion = overrides.patientPortionCents ?? computedPortion;

  const computedDiscount = percentOfCents(
    Math.max(0, (amounts.prepayDiscountBaseCents ?? effectivePortion) - (paymentSchedule?.paidCents ?? 0)),
    template.discountPercent
  );
  const effectiveDiscount = overrides.discountCents ?? computedDiscount;

  const computedPrepayTotal = Math.max(0, effectivePortion - (paymentSchedule?.paidCents ?? 0) - effectiveDiscount);
  const effectivePrepayTotal = overrides.prepayTotalCents ?? computedPrepayTotal;

  const computedInstallments = paymentSchedule ? paymentSchedule.rows.map(row => row.cents) : visitPlan
    ? splitCentsWeighted(effectivePortion, visitPlan.weights)
    : splitCents(effectivePortion, template.installmentCount);
  const effectiveInstallments = computedInstallments.map(
    (value, i) => paymentSchedule ? value : overrides.installmentsCents?.[i] ?? value
  );
  const installmentLabels = paymentSchedule ? paymentSchedule.rows.map(row => row.label) : visitPlan
    ? visitPlan.labels
    : computedInstallments.map((_, i) => template.installmentLabels[i] ?? `Installment ${i + 1}`);

  const computed: FofComputedValues = {
    patientPortionCents: computedPortion,
    discountCents: computedDiscount,
    prepayTotalCents: computedPrepayTotal,
    installmentsCents: computedInstallments,
  };
  const effective: FofComputedValues = {
    patientPortionCents: effectivePortion,
    discountCents: effectiveDiscount,
    prepayTotalCents: effectivePrepayTotal,
    installmentsCents: effectiveInstallments,
  };

  return {
    paymentSchedule,
    computed,
    effective,
    installmentLabels,
    overridden: {
      patientPortion: overrides.patientPortionCents !== undefined,
      discount: overrides.discountCents !== undefined,
      prepayTotal: overrides.prepayTotalCents !== undefined,
      installments: computedInstallments.map(
        (_, i) => overrides.installmentsCents?.[i] !== undefined
      ),
    },
  };
}
