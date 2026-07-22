import { describe, it, expect } from 'vitest';
import { computeFofDiscounts, SENIOR_RULES } from '@/lib/fof/discounts';

const standard = {
  discountPercent: 10,
  discountLabel: 'Prepay Discount',
  membershipDiscountPercent: 0,
  seniorDiscountApplies: true,
};

const membership = {
  discountPercent: 0,
  discountLabel: '',
  membershipDiscountPercent: 10,
  seniorDiscountApplies: true,
};

const optedOut = { ...standard, seniorDiscountApplies: false };

describe('computeFofDiscounts — standard (Self-Pay / OON)', () => {
  it('under 65: prepay discount only', () => {
    const result = computeFofDiscounts(standard, false, 50_000);
    expect(result.autoDiscount).toBeNull();
    expect(result.prepayDiscountPercent).toBe(10);
  });

  it('65+ under $1,000: automatic 10%, no prepay discount', () => {
    const result = computeFofDiscounts(standard, true, 80_000);
    expect(result.autoDiscount).toEqual({ label: 'Senior Discount (10%)', cents: 8_000 });
    expect(result.prepayDiscountPercent).toBe(0);
  });

  it('65+ at $1,000 or more: normal prepay rules', () => {
    const result = computeFofDiscounts(standard, true, 100_000);
    expect(result.autoDiscount).toBeNull();
    expect(result.prepayDiscountPercent).toBe(10);
  });

  it('template opted out of senior rules: nothing changes for seniors', () => {
    const result = computeFofDiscounts(optedOut, true, 50_000);
    expect(result.autoDiscount).toBeNull();
    expect(result.prepayDiscountPercent).toBe(10);
  });
});

describe('computeFofDiscounts — membership (Illumitrac)', () => {
  it('under 65: automatic 10% membership, no prepay extra', () => {
    const result = computeFofDiscounts(membership, false, 200_000);
    expect(result.autoDiscount).toEqual({ label: 'Membership Discount (10%)', cents: 20_000 });
    expect(result.prepayDiscountPercent).toBe(0);
  });

  it('65+ under $1,000: automatic 15%, no prepay needed', () => {
    const result = computeFofDiscounts(membership, true, 80_000);
    expect(result.autoDiscount).toEqual({
      label: 'Membership + Senior Discount (15%)',
      cents: 12_000,
    });
    expect(result.prepayDiscountPercent).toBe(0);
  });

  it('65+ at $1,000+: automatic 10% plus 5% prepay-only extra off the SAME base', () => {
    const result = computeFofDiscounts(membership, true, 200_000);
    expect(result.autoDiscount).toEqual({ label: 'Membership Discount (10%)', cents: 20_000 });
    expect(result.prepayDiscountPercent).toBe(SENIOR_RULES.membershipExtraPct);
    expect(result.prepayDiscountLabel).toContain('Senior Prepay');
    expect(result.prepayDiscountBase).toBe('preDiscountTotal');
  });

  it('zero portion: membership discount is zero but prepay unchanged', () => {
    const result = computeFofDiscounts(membership, true, 0);
    expect(result.autoDiscount?.cents ?? 0).toBe(0);
  });
});
