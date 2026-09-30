import type { FofComputation, FofTemplate } from './types';
import { formatCents } from './money';

/** Print must explain every cent with the recorded amounts, not an override
 * that silently invents a discount. Applies to policy and legacy schedules. */
export function fofReconciliationIssues(template: FofTemplate, computation: FofComputation): string[] {
  const { computed, effective, paymentSchedule } = computation;
  const issues: string[] = [];
  const remaining = computed.patientPortionCents - (paymentSchedule?.paidCents ?? 0);
  const valid = (value: number) => Number.isSafeInteger(value) && value >= 0;
  if (!valid(effective.patientPortionCents) || effective.patientPortionCents !== computed.patientPortionCents) {
    const difference = Math.abs(effective.patientPortionCents - computed.patientPortionCents);
    issues.push(`The patient portion differs from the itemized balance by ${formatCents(difference)}. Record an office courtesy, credit, or other offset in Discounts & Credits, or reset the patient portion, before printing.`);
  }
  if (template.showPrepayOption && (!valid(effective.discountCents) || !valid(effective.prepayTotalCents) || effective.prepayTotalCents + effective.discountCents !== remaining)) {
    issues.push('The prepay total plus its recorded discount must equal the remaining patient balance. Correct the discount or reset the prepay total before printing.');
  }
  if (template.showInstallmentOption && (effective.installmentsCents.some(value => !valid(value)) || effective.installmentsCents.reduce((sum,value) => sum+value,0) !== remaining)) {
    issues.push('The scheduled payments do not add up to the remaining patient balance. Correct the payments or record the missing courtesy or credit before printing.');
  }
  return issues;
}
