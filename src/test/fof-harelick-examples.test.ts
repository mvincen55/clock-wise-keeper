import { describe, expect, it } from 'vitest';
import { buildPaymentSchedule, type PaymentInput } from '@/lib/fof/payment-engine';
import { harelickPolicyTemplate, type PaymentClass } from '@/lib/fof/payment-policy';
import { computeFof } from '@/lib/fof/compute';
import { computeFofDiscounts } from '@/lib/fof/discounts';
import { buildVisitSchedule } from '@/lib/fof/visits';
import { LIVE_TEMPLATES } from './blank-form-fixtures';

/**
 * Harelick Dental's configured payment rules, exercised on both sides of the
 * $1,000 boundary and on mixed treatment with combined real collection
 * events. Every schedule reconciles to the cent, and the printed rows are
 * the same rows the calculator produced (computeFof passes the schedule
 * through untouched).
 */
const policy = harelickPolicyTemplate();
const events = [
  { id: 'wb', label: 'Work-up', order: 0 },
  { id: 'sb', label: 'Implant booking', order: 1 }, { id: 's', label: 'Implant surgery', order: 2 },
  { id: 'rb', label: 'Crown booking', order: 3 }, { id: 'rp', label: 'Crown prep', order: 4 }, { id: 'rd', label: 'Crown delivery', order: 5 },
  { id: 'db', label: 'Denture booking', order: 6 }, { id: 'di', label: 'Impressions', order: 7 }, { id: 'dt', label: 'Try-in', order: 8 }, { id: 'dd', label: 'Denture delivery', order: 9 },
  { id: 'ob', label: 'Other booking', order: 10 }, { id: 'ot', label: 'Treatment', order: 11 },
];
const groupFor = (classification: PaymentClass) => ({
  workup: { workup: 'wb' }, implant: { booking: 'sb', surgery: 's' }, restoration: { booking: 'rb', prep: 'rp', delivery: 'rd' },
  denture: { booking: 'db', impressions: 'di', tryin: 'dt', delivery: 'dd' }, other: { booking: 'ob', treatment: 'ot' },
}[classification]);
const single = (classification: PaymentClass, cents: number): PaymentInput => ({
  policy, expectedObligationCents: cents,
  procedures: [{ id: 'p', groupId: 'g', responsibilityCents: cents }],
  groups: [{ id: 'g', label: classification, classification, events: groupFor(classification) }],
  events,
});
const rows = (input: PaymentInput) => {
  const schedule = buildPaymentSchedule(input);
  expect(schedule.issues).toEqual([]);
  expect(schedule.rows.reduce((sum, row) => sum + row.cents, 0)).toBe(schedule.remainingCents);
  return schedule.rows.map(row => [row.label, row.cents] as const);
};

describe('the $1,000 boundary (inclusive: exactly $1,000 takes the higher tier)', () => {
  it('crowns / bridges / restorations: thirds at or over, prep and delivery halves under', () => {
    expect(rows(single('restoration', 100_000))).toEqual([['Crown booking', 33_333], ['Crown prep', 33_333], ['Crown delivery', 33_334]]);
    expect(rows(single('restoration', 99_999))).toEqual([['Crown prep', 50_000], ['Crown delivery', 49_999]]);
    expect(rows(single('restoration', 100_001))).toEqual([['Crown booking', 33_334], ['Crown prep', 33_334], ['Crown delivery', 33_333]]);
  });
  it('dentures / partials: thirds at scheduling, first impressions/try-in and delivery; impressions and delivery halves under', () => {
    expect(rows(single('denture', 100_000))).toEqual([['Denture booking', 33_333], ['Impressions', 33_333], ['Denture delivery', 33_334]]);
    expect(rows(single('denture', 99_999))).toEqual([['Impressions', 50_000], ['Denture delivery', 49_999]]);
  });
  it('other treatment without a delivery: scheduling/treatment halves at or over, treatment day under', () => {
    expect(rows(single('other', 100_000))).toEqual([['Other booking', 50_000], ['Treatment', 50_000]]);
    expect(rows(single('other', 99_999))).toEqual([['Treatment', 99_999]]);
  });
  it('implant surgery collects in halves at scheduling and surgery whatever the amount', () => {
    expect(rows(single('implant', 100_000))).toEqual([['Implant booking', 50_000], ['Implant surgery', 50_000]]);
    expect(rows(single('implant', 80_000))).toEqual([['Implant booking', 40_000], ['Implant surgery', 40_000]]);
    expect(rows(single('implant', 101))).toEqual([['Implant booking', 51], ['Implant surgery', 50]]);
  });
  it('work-up is paid in full at the work-up appointment and never leaks into later installments', () => {
    expect(rows(single('workup', 189_600))).toEqual([['Work-up', 189_600]]);
    expect(rows(single('workup', 52_000))).toEqual([['Work-up', 52_000]]);
  });
});

describe('work-up + implant + crown, with real collection events', () => {
  const mixed = (): PaymentInput => ({
    policy, expectedObligationCents: 817_300,
    procedures: [
      { id: 'ct', groupId: 'w', responsibilityCents: 52_000 }, { id: 'models', groupId: 'w', responsibilityCents: 25_600 }, { id: 'guide', groupId: 'w', responsibilityCents: 112_000 },
      { id: 'implant', groupId: 's', responsibilityCents: 271_700 }, { id: 'stage2', groupId: 's', responsibilityCents: 49_200 },
      { id: 'abutment', groupId: 'r', responsibilityCents: 114_100 }, { id: 'crown', groupId: 'r', responsibilityCents: 192_700 },
    ],
    groups: [
      { id: 'w', label: 'Work-up', classification: 'workup', events: { workup: 'wb' } },
      { id: 's', label: 'Implant', classification: 'implant', events: { booking: 'sb', surgery: 's' } },
      { id: 'r', label: 'Implant crown', classification: 'restoration', events: { booking: 'rb', prep: 'rp', delivery: 'rd' } },
    ],
    events,
  });
  it('produces six separate collection events that sum to the cent', () => {
    expect(rows(mixed())).toEqual([
      ['Work-up', 189_600], ['Implant booking', 160_450], ['Implant surgery', 160_450],
      ['Crown booking', 102_267], ['Crown prep', 102_267], ['Crown delivery', 102_266],
    ]);
  });
  it('booking the restorative crown at implant surgery collects its scheduling third at that real event, combined into one row', () => {
    const input = mixed();
    input.groups[2].events.booking = 's';
    const combined = rows(input);
    expect(combined).toEqual([
      ['Work-up', 189_600], ['Implant booking', 160_450], ['Implant surgery', 160_450 + 102_267],
      ['Crown prep', 102_267], ['Crown delivery', 102_266],
    ]);
    // Money due at the surgery visit is the implant half plus the crown's
    // scheduling third; the visit's own treatment fee is not what is due.
    expect(combined[2][1]).not.toBe(271_700 + 49_200);
  });
  it('an explicitly recorded prior work-up payment reduces the plan without touching later phases', () => {
    const input = mixed();
    input.procedures.filter(p => p.groupId === 'w').forEach(p => { p.paidCents = p.responsibilityCents; });
    const schedule = buildPaymentSchedule(input);
    expect(schedule.issues).toEqual([]);
    expect(schedule.paidCents).toBe(189_600);
    expect(schedule.remainingCents).toBe(627_700);
    expect(schedule.rows.map(r => r.cents)).toEqual([160_450, 160_450, 102_267, 102_267, 102_266]);
  });
  it('an $800 extraction booked with a $2,000 crown as one approved arrangement is paid by prep', () => {
    const input: PaymentInput = {
      policy, expectedObligationCents: 280_000,
      procedures: [{ id: 'c', groupId: 'g', responsibilityCents: 200_000 }, { id: 'x', groupId: 'x', responsibilityCents: 80_000 }],
      groups: [
        { id: 'g', label: 'Crown', classification: 'restoration', arrangementId: 'together', events: { booking: 'rb', prep: 'rp', delivery: 'rd' } },
        { id: 'x', label: 'Extraction', classification: 'other', arrangementId: 'together', events: { booking: 'rb', treatment: 'rp' } },
      ],
      events,
    };
    expect(rows(input)).toEqual([['Crown booking', 106_667], ['Crown prep', 106_667], ['Crown delivery', 66_666]]);
  });
});

describe('insurance, discounts and credits reconcile to the cent', () => {
  const template = { ...LIVE_TEMPLATES[2], showPrepayOption: true, showInstallmentOption: true };
  it('the patient portion is total minus insurance, write-off, discounts and credits, never clamped silently', () => {
    const balanced = computeFof(template, { totalCents: 412_500, insuranceEstimateCents: 98_500, writeOffCents: 0, officeDiscountCents: 10_000, patientCreditCents: 4_000 }, {});
    expect(balanced.effective.patientPortionCents).toBe(300_000);
    expect(balanced.imbalanceCents).toBe(0);
    const over = computeFof(template, { totalCents: 100_000, insuranceEstimateCents: 60_000, writeOffCents: 0, patientCreditCents: 50_000 }, {});
    expect(over.effective.patientPortionCents).toBe(0);
    expect(over.imbalanceCents).toBe(10_000);
  });
  it('a schedule passed to computeFof prints exactly the calculator rows', () => {
    const schedule = buildPaymentSchedule(single('restoration', 100_000));
    const computation = computeFof(template, { totalCents: 150_000, insuranceEstimateCents: 50_000, writeOffCents: 0 }, {}, undefined, schedule);
    expect(computation.effective.installmentsCents).toEqual([33_333, 33_333, 33_334]);
    expect(computation.installmentLabels).toEqual(['Crown booking', 'Crown prep', 'Crown delivery']);
    expect(computation.effective.installmentsCents.reduce((a, b) => a + b, 0)).toBe(computation.effective.patientPortionCents);
  });
  it('one courtesy at a time: an office discount replaces the prepay courtesy unless a manager stacks them', () => {
    const rules = computeFofDiscounts({ discountPercent: 10, discountLabel: 'Prepay Discount', membershipDiscountPercent: 0, seniorDiscountApplies: true }, false, 150_000);
    expect(rules.prepayDiscountPercent).toBe(5);
    // The builder suppresses the prepay percent when an office discount is typed.
    const suppressed = computeFof({ ...template, discountPercent: 0, discountLabel: '' }, { totalCents: 150_000, insuranceEstimateCents: 0, writeOffCents: 0, officeDiscountCents: 15_000 }, {});
    expect(suppressed.effective.discountCents).toBe(0);
    expect(suppressed.effective.prepayTotalCents).toBe(135_000);
    const stacked = computeFof({ ...template, discountPercent: 5, discountLabel: 'Prepay Discount (5%)' }, { totalCents: 150_000, insuranceEstimateCents: 0, writeOffCents: 0, officeDiscountCents: 15_000 }, {});
    expect(stacked.effective.discountCents).toBe(6_750);
    expect(stacked.effective.prepayTotalCents).toBe(128_250);
  });
  it('membership and senior courtesies never double up', () => {
    const membership = { discountPercent: 0, discountLabel: '', membershipDiscountPercent: 10, seniorDiscountApplies: true };
    const under = computeFofDiscounts(membership, true, 80_000);
    expect(under.autoDiscount).toEqual({ label: 'Membership + Senior Discount (15%)', cents: 12_000 });
    expect(under.prepayDiscountPercent).toBe(0);
    const over = computeFofDiscounts(membership, true, 200_000);
    expect(over.autoDiscount).toEqual({ label: 'Membership Discount (10%)', cents: 20_000 });
    expect(over.prepayDiscountPercent).toBe(5);
  });
});

describe('legacy visit schedule follows the office settings, not constants', () => {
  const visits = [{ label: 'Extraction', feeCents: 30_000 }, { label: 'Crown Prep', feeCents: 90_000 }, { label: 'Crown Delivery', feeCents: 90_000 }];
  it('a first visit under the configured day-of-service threshold is collected at the visit', () => {
    const office = buildVisitSchedule(210_000, visits, { dayOfServiceThresholdCents: 100_000, minStandalonePaymentCents: 10_000 })!;
    expect(office.labels[0]).toBe('Extraction');
    const strict = buildVisitSchedule(210_000, visits, { dayOfServiceThresholdCents: 20_000, minStandalonePaymentCents: 10_000 })!;
    expect(strict.labels[0]).toBe('Upon Scheduling');
    expect(office.weights.reduce((a, b) => a + b, 0)).toBe(210_000);
    expect(strict.weights.reduce((a, b) => a + b, 0)).toBe(210_000);
  });
  it('the minimum standalone payment folds tiny payments into the previous one', () => {
    const loose = buildVisitSchedule(100_050, [{ label: 'Prep', feeCents: 100_000 }, { label: 'Delivery', feeCents: 50 }], { dayOfServiceThresholdCents: 0, minStandalonePaymentCents: 10_000 })!;
    expect(loose.weights.filter(w => w > 0 && w < 10_000)).toEqual([]);
    const strict = buildVisitSchedule(100_050, [{ label: 'Prep', feeCents: 100_000 }, { label: 'Delivery', feeCents: 50 }], { dayOfServiceThresholdCents: 0, minStandalonePaymentCents: 1 })!;
    expect(strict.weights.reduce((a, b) => a + b, 0)).toBe(100_050);
  });
});
