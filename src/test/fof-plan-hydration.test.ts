import { describe, expect, it } from 'vitest';
import { downgradeDefault, GENERIC_PLAN_DEFAULTS, parsePercentInput, planDefaults, plansForSchedule } from '@/lib/fof/plan-hydration';
import type { InsurancePlan } from '@/hooks/useFeeSchedules';

const plan = (overrides: Partial<InsurancePlan> = {}): InsurancePlan => ({
  id: 'p1', name: 'DD MA 100/80/50', feeScheduleId: 'delta', preventivePct: 100, basicPct: 80, majorPct: 50,
  deductibleCents: 5000, deductibleWaivedPreventive: true, annualMaxCents: 150000, writeoffApplies: true,
  officeFeesAfterMax: false, isInNetwork: true, isActive: true, sortOrder: 0, alternateBenefitDowngrade: null, ...overrides,
});

describe('saved plan hydration', () => {
  it('offers only active plans linked to the selected carrier schedule', () => {
    const plans = [plan(), plan({ id: 'p2', name: 'Inactive', isActive: false }), plan({ id: 'p3', name: 'Other carrier', feeScheduleId: 'bcbs' })];
    expect(plansForSchedule('delta', plans).map(p => p.id)).toEqual(['p1']);
    expect(plansForSchedule('bcbs', plans).map(p => p.id)).toEqual(['p3']);
    expect(plansForSchedule('altus', plans)).toEqual([]);
    expect(plansForSchedule('delta', undefined)).toEqual([]);
  });
  it('maps a plan to form defaults and clamps malformed percentages and cents', () => {
    expect(planDefaults(plan())).toEqual({
      planId: 'p1', planName: 'DD MA 100/80/50', pctPrev: 100, pctBasic: 80, pctMajor: 50,
      deductibleCents: 5000, annualMaxCents: 150000, deductibleWaivedPreventive: true, writeoffApplies: true,
      officeFeesAfterMax: false, isInNetwork: true, alternateBenefitDowngrade: null,
    });
    const odd = planDefaults(plan({ preventivePct: 140, basicPct: -5, majorPct: Number.NaN, deductibleCents: -1, annualMaxCents: 12.5 }));
    expect([odd.pctPrev, odd.pctBasic, odd.pctMajor, odd.deductibleCents, odd.annualMaxCents]).toEqual([100, 0, 50, 0, 0]);
  });
  it('generic defaults are what a carrier with no saved plan gets', () => {
    expect(GENERIC_PLAN_DEFAULTS).toMatchObject({ pctPrev: 100, pctBasic: 80, pctMajor: 50, deductibleCents: 5000, annualMaxCents: 150000 });
  });
  it('the plan overrides the office downgrade default; otherwise the office setting applies', () => {
    expect(downgradeDefault(false, null)).toBe(false);
    expect(downgradeDefault(true, null)).toBe(true);
    expect(downgradeDefault(true, { alternateBenefitDowngrade: null })).toBe(true);
    expect(downgradeDefault(true, { alternateBenefitDowngrade: false })).toBe(false);
    expect(downgradeDefault(false, { alternateBenefitDowngrade: true })).toBe(true);
  });
  it('validates percentages instead of partially parsing them', () => {
    expect(parsePercentInput('80')).toBe(80);
    expect(parsePercentInput(' 100% ')).toBe(100);
    expect(parsePercentInput('0')).toBe(0);
    expect(parsePercentInput('101')).toBeNull();
    expect(parsePercentInput('8O')).toBeNull();
    expect(parsePercentInput('80.5')).toBeNull();
    expect(parsePercentInput('')).toBeNull();
    expect(parsePercentInput('-5')).toBeNull();
  });
});
