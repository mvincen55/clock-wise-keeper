import { describe, it, expect } from 'vitest';
import {
  estimateInsurance,
  sumOfficeFees,
  type FofLine,
  type PlanRules,
} from '@/lib/fof/insurance';

const plan: PlanRules = {
  preventivePct: 100,
  basicPct: 80,
  majorPct: 50,
  deductibleWaivedPreventive: true,
  writeoffApplies: true,
};

const line = (overrides: Partial<FofLine>): FofLine => ({
  code: 'D0000',
  description: 'Test',
  category: 'basic',
  officeFeeCents: 10_000,
  allowedCents: null,
  ...overrides,
});

const noBenefitsUsed = { remainingDeductibleCents: 0, remainingAnnualMaxCents: 1_000_000 };

describe('sumOfficeFees', () => {
  it('totals office fees', () => {
    expect(sumOfficeFees([line({ officeFeeCents: 100 }), line({ officeFeeCents: 250 })])).toBe(350);
  });
});

describe('estimateInsurance', () => {
  it('returns zero insurance without a plan', () => {
    const result = estimateInsurance([line({})], null, noBenefitsUsed);
    expect(result.totalCents).toBe(10_000);
    expect(result.insurancePaysCents).toBe(0);
    expect(result.writeOffCents).toBe(0);
  });

  it('computes write-off as office fee minus allowed', () => {
    const result = estimateInsurance(
      [line({ officeFeeCents: 157_300, allowedCents: 120_000 })],
      plan,
      noBenefitsUsed
    );
    expect(result.writeOffCents).toBe(37_300);
    expect(result.insurancePaysCents).toBe(96_000); // 80% of allowed
  });

  it('never produces a negative write-off', () => {
    const result = estimateInsurance(
      [line({ officeFeeCents: 100_00, allowedCents: 120_00 })],
      plan,
      noBenefitsUsed
    );
    expect(result.writeOffCents).toBe(0);
  });

  it('falls back to office fee when no allowed fee exists', () => {
    const result = estimateInsurance([line({ officeFeeCents: 50_000 })], plan, noBenefitsUsed);
    expect(result.perLine[0].allowedCents).toBe(50_000);
    expect(result.insurancePaysCents).toBe(40_000);
  });

  it('applies remaining deductible before coverage, in line order', () => {
    const result = estimateInsurance(
      [
        line({ officeFeeCents: 8_000, allowedCents: 8_000 }),
        line({ officeFeeCents: 20_000, allowedCents: 20_000 }),
      ],
      plan,
      { remainingDeductibleCents: 5_000, remainingAnnualMaxCents: 1_000_000 }
    );
    // Line 1: deductible eats 5000 of 8000 allowed → ins pays 80% of 3000
    expect(result.perLine[0].deductibleAppliedCents).toBe(5_000);
    expect(result.perLine[0].insurancePaysCents).toBe(2_400);
    // Line 2: deductible exhausted → 80% of 20000
    expect(result.perLine[1].deductibleAppliedCents).toBe(0);
    expect(result.perLine[1].insurancePaysCents).toBe(16_000);
    expect(result.deductibleUsedCents).toBe(5_000);
  });

  it('waives the deductible for preventive when the plan says so', () => {
    const result = estimateInsurance(
      [line({ category: 'preventive', officeFeeCents: 12_000, allowedCents: 12_000 })],
      plan,
      { remainingDeductibleCents: 5_000, remainingAnnualMaxCents: 1_000_000 }
    );
    expect(result.perLine[0].deductibleAppliedCents).toBe(0);
    expect(result.perLine[0].insurancePaysCents).toBe(12_000); // 100%
  });

  it('caps insurance payments at the remaining annual max', () => {
    const result = estimateInsurance(
      [
        line({ category: 'major', officeFeeCents: 200_000, allowedCents: 200_000 }),
        line({ category: 'major', officeFeeCents: 200_000, allowedCents: 200_000 }),
      ],
      plan,
      { remainingDeductibleCents: 0, remainingAnnualMaxCents: 120_000 }
    );
    // Line 1: 50% of 2000.00 = 1000.00 → within max
    expect(result.perLine[0].insurancePaysCents).toBe(100_000);
    // Line 2: only 200.00 of max remains
    expect(result.perLine[1].insurancePaysCents).toBe(20_000);
    expect(result.insurancePaysCents).toBe(120_000);
  });

  it("pays nothing and takes no write-off for 'other' (non-covered) lines — office fee applies", () => {
    const result = estimateInsurance(
      [line({ category: 'other', officeFeeCents: 30_000, allowedCents: 20_000 })],
      plan,
      noBenefitsUsed
    );
    expect(result.perLine[0].insurancePaysCents).toBe(0);
    expect(result.perLine[0].writeOffCents).toBe(0);
    expect(result.perLine[0].allowedCents).toBe(30_000); // office fee, not carrier allowed
  });

  it('skips write-offs when the plan does not apply them (out of network)', () => {
    const oonPlan: PlanRules = { ...plan, writeoffApplies: false };
    const result = estimateInsurance(
      [line({ officeFeeCents: 157_300, allowedCents: 120_000 })],
      oonPlan,
      noBenefitsUsed
    );
    expect(result.writeOffCents).toBe(0);
    expect(result.insurancePaysCents).toBe(96_000);
  });

  it('reverts to office fees (no write-off) after the max is exhausted when the plan says so', () => {
    const afterMaxPlan: PlanRules = { ...plan, officeFeesAfterMax: true };
    const result = estimateInsurance(
      [
        line({ category: 'major', officeFeeCents: 200_000, allowedCents: 150_000 }),
        line({ category: 'major', officeFeeCents: 100_000, allowedCents: 80_000 }),
      ],
      afterMaxPlan,
      { remainingDeductibleCents: 0, remainingAnnualMaxCents: 75_000 }
    );
    // Line 1: 50% of 1500.00 = 750.00, exactly exhausts the max; write-off applies
    expect(result.perLine[0].insurancePaysCents).toBe(75_000);
    expect(result.perLine[0].writeOffCents).toBe(50_000);
    // Line 2: max gone → office fee, no write-off, no insurance
    expect(result.perLine[1].insurancePaysCents).toBe(0);
    expect(result.perLine[1].writeOffCents).toBe(0);
  });

  it('keeps write-offs after max when the plan does NOT revert', () => {
    const result = estimateInsurance(
      [
        line({ category: 'major', officeFeeCents: 200_000, allowedCents: 150_000 }),
        line({ category: 'major', officeFeeCents: 100_000, allowedCents: 80_000 }),
      ],
      plan,
      { remainingDeductibleCents: 0, remainingAnnualMaxCents: 75_000 }
    );
    expect(result.perLine[1].insurancePaysCents).toBe(0);
    expect(result.perLine[1].writeOffCents).toBe(20_000);
  });

  it('benefit-year renewal: fresh max opens and deductible re-applies once year 1 is spent', () => {
    const result = estimateInsurance(
      [
        line({ category: 'major', officeFeeCents: 200_000, allowedCents: 200_000 }),
        line({ category: 'major', officeFeeCents: 100_000, allowedCents: 100_000 }),
      ],
      plan,
      {
        remainingDeductibleCents: 0,
        remainingAnnualMaxCents: 100_000,
        renewal: { annualMaxCents: 150_000, deductibleCents: 5_000 },
      }
    );
    // Line 1: 50% of 2000 = 1000, fully consumes year-1 max
    expect(result.perLine[0].insurancePaysCents).toBe(100_000);
    // Line 2: renewal kicks in — deductible 50 re-applies, then 50% of the rest
    expect(result.perLine[1].deductibleAppliedCents).toBe(5_000);
    expect(result.perLine[1].insurancePaysCents).toBe(47_500);
  });

  it('office-fees-after-max only applies once the renewal is also spent', () => {
    const afterMaxPlan: PlanRules = { ...plan, officeFeesAfterMax: true };
    const result = estimateInsurance(
      [
        line({ category: 'major', officeFeeCents: 200_000, allowedCents: 150_000 }),
        line({ category: 'major', officeFeeCents: 100_000, allowedCents: 80_000 }),
      ],
      afterMaxPlan,
      {
        remainingDeductibleCents: 0,
        remainingAnnualMaxCents: 75_000,
        renewal: { annualMaxCents: 100_000, deductibleCents: 0 },
      }
    );
    // Line 1 exhausts year 1; line 2 rolls into year 2 instead of reverting
    expect(result.perLine[1].insurancePaysCents).toBe(40_000);
    expect(result.perLine[1].writeOffCents).toBe(20_000);
  });

  it('downgrade: pays from the amalgam benefit basis while write-off uses the actual allowed', () => {
    // D2392 posterior composite downgraded to the D2150 amalgam allowance
    const result = estimateInsurance(
      [
        line({
          code: 'D2392',
          officeFeeCents: 30_000, // office composite fee
          allowedCents: 24_000, // plan's composite allowed
          benefitBasisCents: 15_000, // plan's amalgam allowed (D2150)
        }),
      ],
      plan,
      noBenefitsUsed
    );
    // Insurance pays 80% of the amalgam basis, not the composite allowed
    expect(result.perLine[0].insurancePaysCents).toBe(12_000);
    // Write-off still comes from the actual procedure: office − composite allowed
    expect(result.perLine[0].writeOffCents).toBe(6_000);
  });

  it('downgrade: deductible applies against the benefit basis', () => {
    const result = estimateInsurance(
      [line({ officeFeeCents: 30_000, allowedCents: 24_000, benefitBasisCents: 15_000 })],
      plan,
      { remainingDeductibleCents: 5_000, remainingAnnualMaxCents: 1_000_000 }
    );
    expect(result.perLine[0].deductibleAppliedCents).toBe(5_000);
    // 80% of (15000 − 5000)
    expect(result.perLine[0].insurancePaysCents).toBe(8_000);
  });

  it('downgrade basis never exceeds the actual allowed fee', () => {
    // Guard: a bad/backwards basis can't inflate the payment
    const result = estimateInsurance(
      [line({ officeFeeCents: 30_000, allowedCents: 15_000, benefitBasisCents: 24_000 })],
      plan,
      noBenefitsUsed
    );
    expect(result.perLine[0].insurancePaysCents).toBe(12_000); // 80% of 15000
  });

  it('null benefit basis behaves exactly like no downgrade', () => {
    const withNull = estimateInsurance(
      [line({ officeFeeCents: 30_000, allowedCents: 24_000, benefitBasisCents: null })],
      plan,
      noBenefitsUsed
    );
    const without = estimateInsurance(
      [line({ officeFeeCents: 30_000, allowedCents: 24_000 })],
      plan,
      noBenefitsUsed
    );
    expect(withNull.perLine[0]).toEqual(without.perLine[0]);
  });

  it('full-flow sanity: patient portion = total − writeoffs − insurance', () => {
    const lines = [
      line({ category: 'preventive', officeFeeCents: 15_000, allowedCents: 12_000 }),
      line({ category: 'basic', officeFeeCents: 30_000, allowedCents: 25_000 }),
      line({ category: 'major', officeFeeCents: 150_000, allowedCents: 110_000 }),
    ];
    const result = estimateInsurance(lines, plan, {
      remainingDeductibleCents: 5_000,
      remainingAnnualMaxCents: 100_000,
    });
    const patientPortion =
      result.totalCents - result.writeOffCents - result.insurancePaysCents;
    expect(result.totalCents).toBe(195_000);
    expect(patientPortion).toBeGreaterThan(0);
    expect(patientPortion).toBeLessThan(result.totalCents);
    // All components reconcile
    expect(result.writeOffCents).toBe(3_000 + 5_000 + 40_000);
  });
});
