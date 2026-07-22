import { describe, it, expect } from 'vitest';
import { computeFof } from '@/lib/fof/compute';
import type { FofAmounts, FofTemplate } from '@/lib/fof/types';

function makeTemplate(overrides: Partial<FofTemplate> = {}): FofTemplate {
  return {
    id: 't1',
    name: 'Test',
    sortOrder: 0,
    isActive: true,
    discountPercent: 10,
    discountLabel: 'Prepay Discount',
    showInsuranceEstimate: false,
    showWriteOff: false,
    showPrepayOption: true,
    showInstallmentOption: true,
    installmentCount: 3,
    installmentLabels: ['Visit 1', 'Visit 2', 'Visit 3'],
    validityNote: '',
    prepayNote: '',
    insuranceNote: '',
    contactNote: '',
    footnotes: [],
    signatureIntro: 'agrees to:',
    membershipDiscountPercent: 0,
    seniorDiscountApplies: false,
    ...overrides,
  };
}

const amounts = (
  total: number | null,
  insurance: number | null = null,
  writeOff: number | null = null
): FofAmounts => ({
  totalCents: total,
  insuranceEstimateCents: insurance,
  writeOffCents: writeOff,
});

describe('computeFof', () => {
  it('self-pay: portion equals total, sheet golden case', () => {
    const result = computeFof(makeTemplate(), amounts(1_181_900));
    expect(result.effective.patientPortionCents).toBe(1_181_900);
    expect(result.effective.discountCents).toBe(118_190);
    expect(result.effective.prepayTotalCents).toBe(1_063_710); // $10,637.10
    expect(result.effective.installmentsCents).toEqual([393_966, 393_967, 393_967]);
  });

  it('OON insurance: portion = total − insurance − write-off', () => {
    const template = makeTemplate({ showInsuranceEstimate: true, showWriteOff: true });
    const result = computeFof(template, amounts(157_300, 10_000, 5_000));
    expect(result.effective.patientPortionCents).toBe(142_300);
    expect(result.effective.discountCents).toBe(14_230);
  });

  it('ignores insurance amounts when the template hides those lines', () => {
    const result = computeFof(makeTemplate(), amounts(100_000, 40_000, 10_000));
    expect(result.effective.patientPortionCents).toBe(100_000);
  });

  it('financing template: 0% discount, prepay total equals portion', () => {
    const template = makeTemplate({ discountPercent: 0 });
    const result = computeFof(template, amounts(1_642_500));
    expect(result.effective.discountCents).toBe(0);
    expect(result.effective.prepayTotalCents).toBe(1_642_500);
  });

  it('clamps negative portions to zero', () => {
    const template = makeTemplate({ showInsuranceEstimate: true });
    const result = computeFof(template, amounts(50_000, 80_000));
    expect(result.effective.patientPortionCents).toBe(0);
  });

  it('portion override re-derives discount and installments', () => {
    const result = computeFof(makeTemplate(), amounts(1_181_900), {
      patientPortionCents: 900_000,
    });
    expect(result.effective.patientPortionCents).toBe(900_000);
    expect(result.effective.discountCents).toBe(90_000);
    expect(result.effective.installmentsCents).toEqual([300_000, 300_000, 300_000]);
    expect(result.overridden.patientPortion).toBe(true);
    expect(result.overridden.discount).toBe(false);
  });

  it('single installment override leaves the others computed', () => {
    const result = computeFof(makeTemplate(), amounts(300_000), {
      installmentsCents: [undefined, 120_000, undefined],
    });
    expect(result.effective.installmentsCents).toEqual([100_000, 120_000, 100_000]);
    expect(result.overridden.installments).toEqual([false, true, false]);
    expect(result.computed.installmentsCents).toEqual([100_000, 100_000, 100_000]);
  });

  it('discount override does not change the portion', () => {
    const result = computeFof(makeTemplate(), amounts(100_000), {
      discountCents: 5_000,
    });
    expect(result.effective.patientPortionCents).toBe(100_000);
    expect(result.effective.discountCents).toBe(5_000);
    expect(result.effective.prepayTotalCents).toBe(95_000);
  });

  it('office discount and patient credit reduce the portion', () => {
    const result = computeFof(makeTemplate({ discountPercent: 0 }), {
      ...amounts(100_000),
      officeDiscountCents: 10_000,
      patientCreditCents: 5_000,
    });
    expect(result.effective.patientPortionCents).toBe(85_000);
  });

  it('omitted office discount and credit change nothing', () => {
    const withFields = computeFof(makeTemplate(), {
      ...amounts(100_000),
      officeDiscountCents: null,
      patientCreditCents: null,
    });
    const without = computeFof(makeTemplate(), amounts(100_000));
    expect(withFields.effective).toEqual(without.effective);
  });

  it('handles null total as zero', () => {
    const result = computeFof(makeTemplate(), amounts(null));
    expect(result.effective.patientPortionCents).toBe(0);
    expect(result.effective.installmentsCents).toEqual([0, 0, 0]);
  });
});
