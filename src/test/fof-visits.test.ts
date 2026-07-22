import { describe, it, expect } from 'vitest';
import { computeFof } from '@/lib/fof/compute';
import {
  buildVisitSchedule,
  decideVisitPlan,
  planForCount,
  splitCentsWeighted,
  suggestVisitStage,
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
  it('gives implants surgery wording, front-loaded', () => {
    const plan = decideVisitPlan(['6010']);
    expect(plan.key).toBe('implant3');
    expect(plan.labels[1]).toBe('At Placement Surgery');
    expect(plan.weights).toEqual([50, 25, 25]);
  });

  it('gives dentures impressions/delivery wording, front-loaded', () => {
    const plan = decideVisitPlan(['D5213']);
    expect(plan.key).toBe('denture3');
    expect(plan.labels).toEqual(['Upon Scheduling', 'At Impressions', 'On Delivery']);
  });

  it('gives crowns and bridges prep/delivery thirds', () => {
    expect(decideVisitPlan(['2740']).key).toBe('crownBridge3');
    expect(decideVisitPlan(['D6750', '2950']).key).toBe('crownBridge3');
    expect(decideVisitPlan(['2740']).labels[1]).toBe('At Prep Appointment');
  });

  it('gives surgery wording for grafts and extractions', () => {
    expect(decideVisitPlan(['4273']).key).toBe('surgery2');
    expect(decideVisitPlan(['7140']).labels[1]).toBe('At Surgery');
  });

  it('gives endo treatment wording', () => {
    expect(decideVisitPlan(['3330']).labels[1]).toBe('At Treatment');
  });

  it('defaults to half at scheduling, half at appointment', () => {
    expect(decideVisitPlan(['2391']).key).toBe('single2');
    expect(decideVisitPlan([]).key).toBe('single2');
  });

  it('heaviest treatment wins', () => {
    expect(decideVisitPlan(['1110', '2740', '6010']).key).toBe('implant3');
    expect(decideVisitPlan(['1110', '2740']).key).toBe('crownBridge3');
    expect(decideVisitPlan(['7140', '5110']).key).toBe('denture3');
  });
});

describe('suggestVisitStage', () => {
  it('stages surgery first, placement second, restoration last', () => {
    expect(suggestVisitStage('7210')).toBe(1); // extraction
    expect(suggestVisitStage('7953')).toBe(1); // bone graft
    expect(suggestVisitStage('6010')).toBe(2); // implant placement
    expect(suggestVisitStage('3330')).toBe(2); // root canal
    expect(suggestVisitStage('2740')).toBe(3); // crown
    expect(suggestVisitStage('6058')).toBe(3); // implant crown
    expect(suggestVisitStage('0330')).toBe(1); // pano — first visit
    expect(suggestVisitStage('XX232')).toBe(1);
  });
});

describe('buildVisitSchedule — half a visit ahead', () => {
  it('single visit becomes half at scheduling, half at appointment', () => {
    const plan = buildVisitSchedule(80_000, [{ label: 'Filling', feeCents: 80_000 }]);
    expect(plan!.weights).toEqual([40_000, 40_000]);
    expect(plan!.labels[0]).toBe('Upon Scheduling');
    expect(plan!.labels[1]).toContain('At Appointment');
  });

  it('collects each visit plus half the next, ending with the final half', () => {
    // Visits allocated 40k / 60k / 100k of a 200k portion
    const plan = buildVisitSchedule(200_000, [
      { label: 'Surgery', feeCents: 40_000 },
      { label: 'Placement', feeCents: 60_000 },
      { label: 'Crown', feeCents: 100_000 },
    ]);
    // Scheduling: half of v1 = 20k
    // Visit 1: rest of v1 (20k) + half v2 (30k) = 50k
    // Visit 2: rest of v2 (30k) + half v3 (50k) = 80k
    // Visit 3: rest of v3 = 50k
    expect(plan!.weights).toEqual([20_000, 50_000, 80_000, 50_000]);
    expect(plan!.weights.reduce((a, b) => a + b, 0)).toBe(200_000);
    expect(plan!.labels).toEqual([
      'Upon Scheduling',
      'At Visit 1 · Surgery',
      'At Visit 2 · Placement',
      'At Visit 3 · Crown',
    ]);
  });

  it('allocates the portion proportionally to visit fees', () => {
    const plan = buildVisitSchedule(90_000, [
      { label: 'A', feeCents: 100_000 },
      { label: 'B', feeCents: 200_000 },
    ]);
    // Allocation 30k/60k → payments: 15k, 15k+30k=45k, 30k
    expect(plan!.weights).toEqual([15_000, 45_000, 30_000]);
  });

  it('balance never runs behind the work at any visit', () => {
    const visits = [
      { label: 'A', feeCents: 37_700 },
      { label: 'B', feeCents: 271_700 },
      { label: 'C', feeCents: 306_800 },
    ];
    const total = visits.reduce((s, v) => s + v.feeCents, 0);
    const plan = buildVisitSchedule(total, visits)!;
    let paid = 0;
    let workDone = 0;
    for (let visit = 0; visit < visits.length; visit++) {
      paid += plan.weights[visit]; // payment at start of this visit (index 0 = scheduling)
      if (visit > 0) workDone += visits[visit - 1].feeCents;
      expect(paid).toBeGreaterThanOrEqual(workDone);
    }
    expect(plan.weights.reduce((a, b) => a + b, 0)).toBe(total);
  });

  it('returns null with no billable work', () => {
    expect(buildVisitSchedule(100, [])).toBeNull();
    expect(buildVisitSchedule(100, [{ label: 'X', feeCents: 0 }])).toBeNull();
  });

  it('skips zero-fee visits (no-charge seat appointment creates no payment)', () => {
    const plan = buildVisitSchedule(199_800, [
      { label: 'Porcelain Crown', feeCents: 199_800 },
      { label: 'CerCr Ins', feeCents: 0 },
    ]);
    expect(plan!.weights).toEqual([99_900, 99_900]);
    expect(plan!.labels).toEqual([
      'Upon Scheduling',
      'At Appointment · Porcelain Crown',
    ]);
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
    membershipDiscountPercent: 0,
    seniorDiscountApplies: false,
  };

  it('uses the plan weights and labels', () => {
    const result = computeFof(
      template,
      { totalCents: 100_000, insuranceEstimateCents: null, writeOffCents: null },
      {},
      VISIT_PLANS.implant3
    );
    expect(result.effective.installmentsCents).toEqual([50_000, 25_000, 25_000]);
    expect(result.installmentLabels).toEqual(VISIT_PLANS.implant3.labels);
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
