import { describe, it, expect } from 'vitest';
import {
  buildPaymentPlan,
  DEFAULT_PAYMENT_POLICY,
  policyFromRow,
  resolveTreatmentClass,
  splitExact,
  type PaymentPolicy,
  type PlanProcedure,
  type TreatmentClass,
} from '@/lib/fof/payment-plan';

/**
 * Harelick Dental's confirmed policy, expressed the way the office's own
 * settings row stores it. It is used here as a FIXTURE for that office —
 * never as the product default (see the isolation test at the bottom).
 */
const HARELICK: PaymentPolicy = {
  ...DEFAULT_PAYMENT_POLICY,
  enabled: true,
  thresholdCents: 100_000,
  thresholdInclusive: true,
  workUpCodes: ['D0367', 'D0470', 'D6190'],
  implantAdvanceException: true,
};

function proc(overrides: Partial<PlanProcedure> & { id: string; oopCents: number }): PlanProcedure {
  return {
    code: 'D0000',
    treatmentClass: 'other_no_delivery',
    groupId: overrides.id,
    appointmentId: 'apt-1',
    appointmentOrder: 1,
    ...overrides,
  };
}

const amounts = (plan: ReturnType<typeof buildPaymentPlan>) =>
  plan.rows.map((r) => r.amountCents);

describe('splitExact', () => {
  it('puts the balancing cents in the LAST installment', () => {
    expect(splitExact(200_000, 3, 'last')).toEqual([66_667, 66_667, 66_666]);
    expect(splitExact(306_800, 3, 'last')).toEqual([102_267, 102_267, 102_266]);
  });
  it('always sums back to the total', () => {
    for (const total of [1, 99, 100_000, 817_300, 306_800]) {
      for (const n of [1, 2, 3, 4, 7]) {
        expect(splitExact(total, n, 'last').reduce((a, b) => a + b, 0)).toBe(total);
      }
    }
  });
});

describe('1 + 2. work-up', () => {
  it('a $1,896 work-up is due entirely at the work-up appointment', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'ct', code: 'D0367', oopCents: 52_000, treatmentClass: 'work_up', groupId: 'workup', appointmentId: 'apt-workup', appointmentOrder: 0 }),
        proc({ id: 'models', code: 'D0470', oopCents: 25_600, treatmentClass: 'work_up', groupId: 'workup', appointmentId: 'apt-workup', appointmentOrder: 0 }),
        proc({ id: 'guide', code: 'D6190', oopCents: 112_000, treatmentClass: 'work_up', groupId: 'workup', appointmentId: 'apt-workup', appointmentOrder: 0 }),
      ],
    });
    expect(amounts(plan)).toEqual([189_600]);
    expect(plan.rows[0].allocations).toHaveLength(3);
  });

  it('excludes work-up from a later treatment threshold and balance', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'guide', code: 'D6190', oopCents: 112_000, treatmentClass: 'work_up', groupId: 'workup', appointmentId: 'apt-workup', appointmentOrder: 0 }),
        // $900 crown alone stays BELOW the threshold despite the work-up.
        proc({ id: 'crown', code: 'D2740', oopCents: 90_000, treatmentClass: 'restorative_lab', groupId: 'crown', appointmentId: 'apt-prep', appointmentOrder: 2, deliveryAppointmentId: 'apt-seat', deliveryAppointmentOrder: 3 }),
      ],
    });
    expect(amounts(plan)).toEqual([112_000, 45_000, 45_000]);
  });

  it('D6190 resolves to work-up from Harelick’s configured code list', () => {
    expect(resolveTreatmentClass('D6190', HARELICK)).toBe('work_up');
    // Another office without that configuration keeps the neutral suggestion.
    expect(resolveTreatmentClass('D6190', DEFAULT_PAYMENT_POLICY)).toBe('implant_surgical');
  });
});

describe('3. implant advance-payment exception', () => {
  it('$800 implant OOP is $400 at scheduling and $400 at surgery', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'imp', code: 'D6010', oopCents: 80_000, treatmentClass: 'implant_surgical', groupId: 'implant', appointmentId: 'apt-surgery', appointmentOrder: 1 }),
      ],
    });
    expect(amounts(plan)).toEqual([40_000, 40_000]);
  });
});

describe('4 + 5 + 6. crowns and bridges', () => {
  it('$900 crown: half at prep, half at delivery, nothing at scheduling', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'crown', code: 'D2740', oopCents: 90_000, treatmentClass: 'restorative_lab', groupId: 'crown', appointmentId: 'apt-prep', appointmentOrder: 1, deliveryAppointmentId: 'apt-seat', deliveryAppointmentOrder: 2 }),
      ],
    });
    expect(amounts(plan)).toEqual([45_000, 45_000]);
    expect(plan.rows.some((r) => r.kinds.includes('schedule'))).toBe(false);
  });

  it('exactly $1,000 belongs to the higher tier and splits in thirds', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'crown', code: 'D2740', oopCents: 100_000, treatmentClass: 'restorative_lab', groupId: 'crown', appointmentId: 'apt-prep', appointmentOrder: 1, deliveryAppointmentId: 'apt-seat', deliveryAppointmentOrder: 2 }),
      ],
    });
    expect(amounts(plan)).toEqual([33_334, 33_333, 33_333]);
    expect(plan.scheduledCents).toBe(100_000);
  });

  it('two $700 crowns prepared together share one $1,400 threshold', () => {
    const together = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'c1', code: 'D2740', oopCents: 70_000, treatmentClass: 'restorative_lab', groupId: 'crowns', appointmentId: 'apt-prep', appointmentOrder: 1, deliveryAppointmentId: 'apt-seat', deliveryAppointmentOrder: 2 }),
        proc({ id: 'c2', code: 'D2740', oopCents: 70_000, treatmentClass: 'restorative_lab', groupId: 'crowns', appointmentId: 'apt-prep', appointmentOrder: 1, deliveryAppointmentId: 'apt-seat', deliveryAppointmentOrder: 2 }),
      ],
    });
    expect(amounts(together)).toEqual([46_667, 46_667, 46_666]);
    // Separate groups (prepped at different appointments) stay below.
    const apart = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'c1', code: 'D2740', oopCents: 70_000, treatmentClass: 'restorative_lab', groupId: 'crown1', appointmentId: 'apt-prep-1', appointmentOrder: 1, deliveryAppointmentId: 'apt-seat-1', deliveryAppointmentOrder: 2 }),
        proc({ id: 'c2', code: 'D2740', oopCents: 70_000, treatmentClass: 'restorative_lab', groupId: 'crown2', appointmentId: 'apt-prep-2', appointmentOrder: 3, deliveryAppointmentId: 'apt-seat-2', deliveryAppointmentOrder: 4 }),
      ],
    });
    expect(amounts(apart)).toEqual([35_000, 35_000, 35_000, 35_000]);
  });
});

describe('7 + 8. mixed treatment and the standalone allowance', () => {
  it('the approved $800 extraction + $2,000 crown example', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'ext', code: 'D7140', oopCents: 80_000, treatmentClass: 'other_no_delivery', groupId: 'ext', appointmentId: 'apt-visit', appointmentOrder: 1 }),
        proc({ id: 'crown', code: 'D2740', oopCents: 200_000, treatmentClass: 'restorative_lab', groupId: 'crown', appointmentId: 'apt-visit', appointmentOrder: 1, deliveryAppointmentId: 'apt-seat', deliveryAppointmentOrder: 2 }),
      ],
    });
    expect(amounts(plan)).toEqual([106_667, 106_667, 66_666]);
    expect(plan.scheduledCents).toBe(280_000);
    // The extraction is fully paid by extraction day.
    const extPaid = plan.rows
      .slice(0, 2)
      .flatMap((r) => r.allocations)
      .filter((a) => a.groupId === 'ext')
      .reduce((s, a) => s + a.amountCents, 0);
    expect(extPaid).toBe(80_000);
  });

  it('a standalone $800 extraction is payable in full on treatment day', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'ext', code: 'D7140', oopCents: 80_000, treatmentClass: 'other_no_delivery', groupId: 'ext' }),
      ],
    });
    expect(amounts(plan)).toEqual([80_000]);
    expect(plan.rows[0].kinds).toEqual(['treatment']);
  });
});

describe('9 + 10 + 11. other treatment, dentures and partials', () => {
  it('non-delivery treatment at exactly $1,000 halves at scheduling and treatment', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [proc({ id: 'perio', code: 'D4260', oopCents: 100_000, groupId: 'perio' })],
    });
    expect(amounts(plan)).toEqual([50_000, 50_000]);
  });

  it('$1,500 denture: thirds at scheduling, first impressions/try-in, delivery', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'denture', code: 'D5110', oopCents: 150_000, treatmentClass: 'denture_partial', groupId: 'denture', appointmentId: 'apt-impressions', appointmentOrder: 1, deliveryAppointmentId: 'apt-delivery', deliveryAppointmentOrder: 4 }),
        // A later try-in adds NO extra installment.
        proc({ id: 'tryin', code: 'D5109', oopCents: 0, treatmentClass: 'zero_fee_marker', groupId: 'denture', appointmentId: 'apt-tryin', appointmentOrder: 2 }),
      ],
    });
    expect(amounts(plan)).toEqual([50_000, 50_000, 50_000]);
    expect(plan.rows).toHaveLength(3);
  });

  it('$900 denture: half at impressions, half at delivery', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: [
        proc({ id: 'denture', code: 'D5213', oopCents: 90_000, treatmentClass: 'denture_partial', groupId: 'denture', appointmentId: 'apt-impressions', appointmentOrder: 1, deliveryAppointmentId: 'apt-delivery', deliveryAppointmentOrder: 3 }),
      ],
    });
    expect(amounts(plan)).toEqual([45_000, 45_000]);
  });
});

// ---------------------------------------------------------------------------
// The full self-pay fixture (no credits, prior payments or prepay discount).
// ---------------------------------------------------------------------------
const FIXTURE: PlanProcedure[] = [
  proc({ id: 'ct', code: 'D0367', oopCents: 52_000, treatmentClass: 'work_up', groupId: 'workup', appointmentId: 'apt-workup', appointmentOrder: 0 }),
  proc({ id: 'models', code: 'D0470', oopCents: 25_600, treatmentClass: 'work_up', groupId: 'workup', appointmentId: 'apt-workup', appointmentOrder: 0 }),
  proc({ id: 'guide', code: 'D6190', oopCents: 112_000, treatmentClass: 'work_up', groupId: 'workup', appointmentId: 'apt-workup', appointmentOrder: 0 }),
  proc({ id: 'implant', code: 'D6010', oopCents: 271_700, treatmentClass: 'implant_surgical', groupId: 'implant', appointmentId: 'apt-surgery', appointmentOrder: 1 }),
  proc({ id: 'stage2', code: 'D6011', oopCents: 49_200, treatmentClass: 'implant_surgical', groupId: 'implant', appointmentId: 'apt-surgery', appointmentOrder: 1 }),
  proc({ id: 'abutment', code: 'D6057', oopCents: 114_100, treatmentClass: 'restorative_lab', groupId: 'resto', appointmentId: 'apt-impression', appointmentOrder: 2, deliveryAppointmentId: 'apt-seat', deliveryAppointmentOrder: 3 }),
  proc({ id: 'implantcrown', code: 'D6058', oopCents: 192_700, treatmentClass: 'restorative_lab', groupId: 'resto', appointmentId: 'apt-impression', appointmentOrder: 2, deliveryAppointmentId: 'apt-seat', deliveryAppointmentOrder: 3 }),
  proc({ id: 'seat', code: 'D6199', oopCents: 0, treatmentClass: 'zero_fee_marker', groupId: 'resto', appointmentId: 'apt-seat', appointmentOrder: 3 }),
];

describe('12 + 16. the full implant fixture', () => {
  it('produces the confirmed component schedule totalling $8,173', () => {
    const plan = buildPaymentPlan({ policy: HARELICK, procedures: FIXTURE });
    expect(amounts(plan)).toEqual([189_600, 160_450, 160_450, 102_267, 102_267, 102_266]);
    expect(plan.scheduledCents).toBe(817_300);
    expect(plan.obligationCents).toBe(817_300);
    expect(plan.blocksPrint).toBe(false);
    // Implant surgery and restoration keep SEPARATE thresholds and bookings.
    expect(plan.rows[1].id).not.toBe(plan.rows[3].id);
  });

  it('a zero-fee seat appointment adds no payment', () => {
    const plan = buildPaymentPlan({ policy: HARELICK, procedures: FIXTURE });
    expect(plan.rows).toHaveLength(6);
    expect(plan.rows.every((r) => r.amountCents > 0)).toBe(true);
  });

  it('recorded prior payment of the work-up leaves $6,277 to collect', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: FIXTURE.map((p) => (p.groupId === 'workup' ? { ...p, alreadyPaid: true } : p)),
    });
    expect(plan.priorPaidCents).toBe(189_600);
    expect(plan.scheduledCents).toBe(627_700);
    expect(plan.obligationCents).toBe(817_300);
  });
});

describe('13. restorative booking taken at implant surgery', () => {
  it('combines only when explicitly linked to that collection event', () => {
    const linked = buildPaymentPlan({
      policy: HARELICK,
      procedures: FIXTURE,
      eventLinks: { 'resto::schedule': 'apt-surgery' },
    });
    // Surgery day now collects the surgical half + the restorative booking.
    expect(amounts(linked)).toEqual([189_600, 160_450, 160_450 + 102_267, 102_267, 102_266]);
    expect(linked.scheduledCents).toBe(817_300);
    // Unlinked, they stay apart.
    const unlinked = buildPaymentPlan({ policy: HARELICK, procedures: FIXTURE });
    expect(unlinked.rows).toHaveLength(6);
  });

  it('never merges two groups just because both say "Upon Scheduling"', () => {
    const plan = buildPaymentPlan({ policy: HARELICK, procedures: FIXTURE });
    const scheduleRows = plan.rows.filter((r) => r.kinds.includes('schedule'));
    expect(scheduleRows).toHaveLength(2);
    expect(scheduleRows[0].label).toBe(scheduleRows[1].label);
    expect(scheduleRows[0].id).not.toBe(scheduleRows[1].id);
  });
});

describe('14. office isolation', () => {
  it('identical procedures produce different schedules under different settings', () => {
    const otherOffice: PaymentPolicy = {
      ...DEFAULT_PAYMENT_POLICY,
      enabled: true,
      thresholdCents: 500_000,
      implantAdvanceException: false,
      workUpCodes: [],
    };
    const harelick = buildPaymentPlan({ policy: HARELICK, procedures: FIXTURE });
    const other = buildPaymentPlan({ policy: otherOffice, procedures: FIXTURE });
    expect(amounts(other)).not.toEqual(amounts(harelick));
    // Harelick's configuration did not leak into the other office's policy.
    expect(DEFAULT_PAYMENT_POLICY.workUpCodes).toEqual([]);
    expect(DEFAULT_PAYMENT_POLICY.enabled).toBe(false);
    expect(otherOffice.workUpCodes).toEqual([]);
  });

  it('an unconfigured organization keeps the legacy schedule (policy disabled)', () => {
    expect(policyFromRow(null).enabled).toBe(false);
    expect(policyFromRow({}).enabled).toBe(false);
    expect(policyFromRow({ payment_policy_enabled: true, payment_threshold_cents: 250_000 })).toMatchObject({
      enabled: true,
      thresholdCents: 250_000,
    });
  });
});

describe('15. overrides, labels and review gates', () => {
  it('a manual amount is kept and flagged when the plan no longer balances', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: FIXTURE,
      overrides: { amounts: { 'apt-workup': 100_000 } },
    });
    expect(plan.rows[0].amountCents).toBe(100_000);
    expect(plan.rows[0].overridden).toBe(true);
    expect(plan.issues.some((i) => i.code === 'override_total_mismatch')).toBe(true);
    expect(plan.blocksPrint).toBe(true);
  });

  it('a stale override is surfaced, never silently dropped', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: FIXTURE,
      overrides: { amounts: { 'apt-gone': 5_000 }, labels: { 'apt-also-gone': 'Old name' } },
    });
    expect(plan.issues.map((i) => i.code)).toContain('stale_amount_override');
    expect(plan.issues.map((i) => i.code)).toContain('stale_label_override');
    expect(plan.blocksPrint).toBe(true);
  });

  it('renaming a payment changes no amount, grouping or timing', () => {
    const base = buildPaymentPlan({ policy: HARELICK, procedures: FIXTURE });
    const renamed = buildPaymentPlan({
      policy: HARELICK,
      procedures: FIXTURE,
      overrides: { labels: { 'apt-surgery': 'Dental Implant Surgery' } },
    });
    expect(amounts(renamed)).toEqual(amounts(base));
    expect(renamed.rows.map((r) => r.id)).toEqual(base.rows.map((r) => r.id));
    expect(renamed.rows.find((r) => r.id === 'apt-surgery')?.label).toBe('Dental Implant Surgery');
    expect(renamed.blocksPrint).toBe(false);
  });

  it('an unallocated global adjustment blocks printing until staff resolve it', () => {
    const plan = buildPaymentPlan({
      policy: HARELICK,
      procedures: FIXTURE,
      unallocatedAdjustmentCents: 25_000,
    });
    expect(plan.issues.some((i) => i.code === 'unallocated_adjustment')).toBe(true);
    expect(plan.blocksPrint).toBe(true);
  });
});

describe('engine invariants', () => {
  it('allocates every cent exactly once with no negative amounts', () => {
    const plan = buildPaymentPlan({ policy: HARELICK, procedures: FIXTURE });
    const allocated = plan.rows
      .flatMap((r) => r.allocations)
      .reduce((s, a) => s + a.amountCents, 0);
    expect(allocated).toBe(plan.scheduledCents);
    expect(plan.rows.every((r) => r.amountCents >= 0)).toBe(true);
    for (const p of FIXTURE.filter((x) => x.oopCents > 0)) {
      const forProc = plan.rows
        .flatMap((r) => r.allocations)
        .filter((a) => a.procedureId === p.id)
        .reduce((s, a) => s + a.amountCents, 0);
      expect(forProc).toBe(p.oopCents);
    }
  });

  it('imposes no fixed payment limit', () => {
    const many: PlanProcedure[] = Array.from({ length: 6 }, (_, i) =>
      proc({
        id: `c${i}`,
        code: 'D2740',
        oopCents: 150_000,
        treatmentClass: 'restorative_lab' as TreatmentClass,
        groupId: `crown${i}`,
        appointmentId: `apt-prep-${i}`,
        appointmentOrder: i * 2 + 1,
        deliveryAppointmentId: `apt-seat-${i}`,
        deliveryAppointmentOrder: i * 2 + 2,
      })
    );
    const plan = buildPaymentPlan({ policy: HARELICK, procedures: many });
    expect(plan.rows.length).toBe(18);
    expect(plan.scheduledCents).toBe(900_000);
  });
});
