import { describe, it, expect } from 'vitest';
import { computeFof } from '@/lib/fof/compute';
import {
  decideVisitPlan,
  planForCount,
  splitCentsWeighted,
  VISIT_PLANS,
} from '@/lib/fof/visits';
import { friendlyCdtName } from '@/lib/fof/cdt-names';
import type { FofTemplate } from '@/lib/fof/types';

describe('splitCentsWeighted', () => {
  it('splits evenly with remainder on the FIRST payments', () => {
    expect(splitCentsWeighted(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(splitCentsWeighted(1_181_900, [1, 1, 1])).toEqual([393_967, 393_967, 393_966]);
  });

  it('front-loads by weight', () => {
    expect(splitCentsWeighted(100_000, [50, 25, 25])).toEqual([50_000, 25_000, 25_000]);
    expect(splitCentsWeighted(100_001, [50, 25, 25])).toEqual([50_001, 25_000, 25_000]);
  });

  it('always sums back to the total', () => {
    for (const total of [1, 99, 101, 1_181_900, 123_457]) {
      for (const weights of [[1], [1, 1], [1, 1, 1], [50, 25, 25], [40, 20, 20, 20]]) {
        const parts = splitCentsWeighted(total, weights);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });
});

describe('decideVisitPlan', () => {
  it('picks front-loaded 3 for implants and dentures', () => {
    expect(decideVisitPlan(['6010']).key).toBe('frontloaded3');
    expect(decideVisitPlan(['D5213']).key).toBe('frontloaded3');
    expect(decideVisitPlan(['6111', '7140']).key).toBe('frontloaded3');
  });

  it('picks even thirds for crowns and bridges', () => {
    expect(decideVisitPlan(['2740']).key).toBe('even3');
    expect(decideVisitPlan(['D6750', '2950']).key).toBe('even3');
  });

  it('picks half/half for single-visit treatment', () => {
    expect(decideVisitPlan(['2391']).key).toBe('single2');
    expect(decideVisitPlan(['7140', '4341']).key).toBe('single2');
    expect(decideVisitPlan([]).key).toBe('single2');
  });

  it('heaviest treatment wins', () => {
    expect(decideVisitPlan(['1110', '2740', '6010']).key).toBe('frontloaded3');
    expect(decideVisitPlan(['1110', '2740']).key).toBe('even3');
  });
});

describe('planForCount', () => {
  it('maps counts to plans', () => {
    expect(planForCount(1).labels).toHaveLength(1);
    expect(planForCount(2).labels).toHaveLength(2);
    expect(planForCount(3).labels).toHaveLength(3);
    expect(planForCount(4).labels).toHaveLength(4);
  });
});

describe('computeFof with a visit plan', () => {
  const template: FofTemplate = {
    id: 't',
    name: 'T',
    sortOrder: 0,
    isActive: true,
    discountPercent: 10,
    discountLabel: 'Prepay Discount',
    showInsuranceEstimate: false,
    showWriteOff: false,
    showPrepayOption: true,
    showInstallmentOption: true,
    installmentCount: 3,
    installmentLabels: ['A', 'B', 'C'],
    validityNote: '',
    prepayNote: '',
    insuranceNote: '',
    contactNote: '',
    footnotes: [],
    signatureIntro: 's',
  };

  it('uses the plan weights and labels', () => {
    const result = computeFof(
      template,
      { totalCents: 100_000, insuranceEstimateCents: null, writeOffCents: null },
      {},
      VISIT_PLANS.frontloaded3
    );
    expect(result.effective.installmentsCents).toEqual([50_000, 25_000, 25_000]);
    expect(result.installmentLabels).toEqual(VISIT_PLANS.frontloaded3.labels);
  });

  it('falls back to template labels without a plan', () => {
    const result = computeFof(template, {
      totalCents: 90_000,
      insuranceEstimateCents: null,
      writeOffCents: null,
    });
    expect(result.installmentLabels).toEqual(['A', 'B', 'C']);
  });
});

describe('friendlyCdtName', () => {
  it('translates common codes to Title Case with or without the D', () => {
    expect(friendlyCdtName('D2740')).toBe('Porcelain Crown');
    expect(friendlyCdtName('2740')).toBe('Porcelain Crown');
    expect(friendlyCdtName('1110')).toBe('Adult Cleaning');
    expect(friendlyCdtName('6111')).toBe('Implant-Supported Lower Denture');
    expect(friendlyCdtName('3310')).toBe('Root Canal (Front Tooth)');
    expect(friendlyCdtName('2750')).toBe('Porcelain-Fused-to-Metal Crown');
  });

  it('returns null for unknown or custom codes', () => {
    expect(friendlyCdtName('XX232')).toBeNull();
    expect(friendlyCdtName('9999')).toBeNull();
  });
});
