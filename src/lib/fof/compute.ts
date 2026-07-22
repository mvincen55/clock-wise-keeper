import type {
  FofAmounts,
  FofComputation,
  FofComputedValues,
  FofOverrides,
  FofTemplate,
} from './types';
import { percentOfCents, splitCents } from './money';

/**
 * Derive all money values on the form from the template rules and the
 * patient-entered amounts. Every derived value can be manually overridden;
 * overriding the patient portion re-derives discount and installments from
 * the overridden portion, while individual overrides only replace themselves.
 */
export function computeFof(
  template: FofTemplate,
  amounts: FofAmounts,
  overrides: FofOverrides = {}
): FofComputation {
  const total = amounts.totalCents ?? 0;
  const insurance = template.showInsuranceEstimate ? amounts.insuranceEstimateCents ?? 0 : 0;
  const writeOff = template.showWriteOff ? amounts.writeOffCents ?? 0 : 0;

  const computedPortion = Math.max(0, total - insurance - writeOff);
  const effectivePortion = overrides.patientPortionCents ?? computedPortion;

  const computedDiscount = percentOfCents(effectivePortion, template.discountPercent);
  const effectiveDiscount = overrides.discountCents ?? computedDiscount;

  const computedPrepayTotal = Math.max(0, effectivePortion - effectiveDiscount);
  const effectivePrepayTotal = overrides.prepayTotalCents ?? computedPrepayTotal;

  const computedInstallments = splitCents(effectivePortion, template.installmentCount);
  const effectiveInstallments = computedInstallments.map(
    (value, i) => overrides.installmentsCents?.[i] ?? value
  );

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
    computed,
    effective,
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
