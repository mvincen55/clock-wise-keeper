import { describe, it, expect } from 'vitest';
import { computeFofDiscounts, DEFAULT_DISCOUNT_RULES } from '@/lib/fof/discounts';

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
  it('under 65 at $1,000+: 5% prepay discount only', () => {
    const result = computeFofDiscounts(standard, false, 150_000);
    expect(result.autoDiscount).toBeNull();
    expect(result.prepayDiscountPercent).toBe(DEFAULT_DISCOUNT_RULES.courtesy.percent);
    expect(result.prepayDiscountLabel).toBe('Prepay Discount (5%)');
  });

  it('under 65 under $1,000: no courtesy discount at all', () => {
    const result = computeFofDiscounts(standard, false, 50_000);
    expect(result.autoDiscount).toBeNull();
    expect(result.prepayDiscountPercent).toBe(0);
    expect(result.prepayDiscountLabel).toBe('');
  });

  it('65+ under $1,000: automatic 10%, no prepay discount', () => {
    const result = computeFofDiscounts(standard, true, 80_000);
    expect(result.autoDiscount).toEqual({ label: 'Senior Discount (10%)', cents: 8_000 });
    expect(result.prepayDiscountPercent).toBe(0);
  });

  it('65+ at $1,000 or more: 10% via prepay in full', () => {
    const result = computeFofDiscounts(standard, true, 100_000);
    expect(result.autoDiscount).toBeNull();
    expect(result.prepayDiscountPercent).toBe(10);
    expect(result.prepayDiscountLabel).toBe('Prepay Discount (10%)');
  });

  it('template opted out of senior rules: nothing changes for seniors', () => {
    const result = computeFofDiscounts(optedOut, true, 50_000);
    expect(result.autoDiscount).toBeNull();
    expect(result.prepayDiscountPercent).toBe(10);
  });
});

describe('computeFofDiscounts — membership (Illumitrac)', () => {
  it('under 65: automatic 10% membership, no prepay extra (65+ courtesy only)', () => {
    const result = computeFofDiscounts(membership, false, 200_000);
    expect(result.autoDiscount).toEqual({ label: 'Membership Discount (10%)', cents: 20_000 });
    expect(result.prepayDiscountPercent).toBe(0);
    expect(result.prepayDiscountLabel).toBe('');
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
    expect(result.prepayDiscountPercent).toBe(DEFAULT_DISCOUNT_RULES.membership.extraPercent);
    expect(result.prepayDiscountLabel).toContain('Prepay Discount');
    expect(result.prepayDiscountBase).toBe('preDiscountTotal');
  });

  it('zero portion: membership discount is zero but prepay unchanged', () => {
    const result = computeFofDiscounts(membership, true, 0);
    expect(result.autoDiscount?.cents ?? 0).toBe(0);
  });
});

describe('computeFofDiscounts — org-scoped rules (Phase 2b)', () => {
  it('explicit default rules match the implicit defaults', () => {
    const a = computeFofDiscounts(standard, true, 80_000);
    const b = computeFofDiscounts(standard, true, 80_000, DEFAULT_DISCOUNT_RULES);
    expect(a).toEqual(b);
  });

  it('disabling the senior rule removes senior treatment everywhere', () => {
    const rules = {
      ...DEFAULT_DISCOUNT_RULES,
      senior: { ...DEFAULT_DISCOUNT_RULES.senior, enabled: false },
    };
    // A 65+ patient under the threshold gets NO automatic senior discount…
    const under = computeFofDiscounts(standard, true, 80_000, rules);
    expect(under.autoDiscount).toBeNull();
    expect(under.prepayDiscountPercent).toBe(0);
    // …and above the threshold earns only the under-65 courtesy rate.
    const above = computeFofDiscounts(standard, true, 150_000, rules);
    expect(above.prepayDiscountPercent).toBe(DEFAULT_DISCOUNT_RULES.courtesy.percent);
  });

  it('disabling the courtesy rule removes the under-65 prepay credit', () => {
    const rules = {
      ...DEFAULT_DISCOUNT_RULES,
      courtesy: { ...DEFAULT_DISCOUNT_RULES.courtesy, enabled: false },
    };
    const result = computeFofDiscounts(standard, false, 150_000, rules);
    expect(result.prepayDiscountPercent).toBe(0);
    expect(result.prepayDiscountLabel).toBe('');
  });

  it('the membership rate comes from the rule, not the template number', () => {
    const rules = {
      ...DEFAULT_DISCOUNT_RULES,
      membership: { ...DEFAULT_DISCOUNT_RULES.membership, percent: 15 },
    };
    const result = computeFofDiscounts(membership, false, 200_000, rules);
    expect(result.autoDiscount).toEqual({
      label: 'Membership Discount (15%)',
      cents: 30_000,
    });
  });

  it('disabling membership falls back to the senior/courtesy program', () => {
    const rules = {
      ...DEFAULT_DISCOUNT_RULES,
      membership: { ...DEFAULT_DISCOUNT_RULES.membership, enabled: false },
    };
    const result = computeFofDiscounts(membership, false, 200_000, rules);
    expect(result.autoDiscount).toBeNull();
    expect(result.prepayDiscountPercent).toBe(DEFAULT_DISCOUNT_RULES.courtesy.percent);
  });

  it('a changed senior threshold moves the automatic/prepay pivot', () => {
    const rules = {
      ...DEFAULT_DISCOUNT_RULES,
      senior: { ...DEFAULT_DISCOUNT_RULES.senior, thresholdCents: 200_000 },
    };
    // $1,500 is now UNDER the threshold: automatic senior discount.
    const result = computeFofDiscounts(standard, true, 150_000, rules);
    expect(result.autoDiscount).toEqual({
      label: 'Senior Discount (10%)',
      cents: 15_000,
    });
  });
});
