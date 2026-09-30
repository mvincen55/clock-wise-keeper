/**
 * goal-progress — production and collections each against ONLY their own
 * target, paced by the office's own calendar when it is in hand. No target
 * is "no goal", no data is "nothing recorded" (never behind), a partial
 * month suppresses a behind verdict but never an ahead one, a missing
 * calendar makes a behind reading an estimate, and over-goal stays over.
 */
import { describe, expect, it } from 'vitest';
import { goalMeters, PACE_BASIS_LABEL, paceBasisLabel, VERDICT_LABELS } from '@/lib/goal-progress';
import type { VitalsSummary } from '@/hooks/usePracticeVitals';

const month = (over: Partial<VitalsSummary> = {}): VitalsSummary => ({
  productionCents: 4_000_000, collectedCents: 3_000_000, newPatientsScheduled: 0, newPatientsSeen: 0,
  newPatientsScheduledRecordedDays: 0, newPatientsSeenRecordedDays: 0, hygieneCancellations: 0, hygieneNoShows: 0,
  doctorCancellations: 0, doctorNoShows: 0, disruptions: 0, productionRecordedDays: 8, disruptionsRecordedDays: 8, days: 8, ...over,
});
const today = '2026-09-10'; // 10 of 30 calendar days; 8 office days through yesterday, 9 through today, 22 in the month
const officeDays = { total: 22, throughYesterday: 8, throughToday: 9 };
const targets = { productionCents: 11_000_000, collectionsCents: 8_250_000, newPatientsSeen: 0 };

describe('goalMeters on the office-day basis', () => {
  it('paces each metric by the office days whose closeouts should be on record, and says so', () => {
    const [prod, coll] = goalMeters({ today, thisMonth: month(), targets, monthElapsed: 10 / 30, officeDays });
    expect(prod).toMatchObject({ id: 'production', state: 'progress', achievedCents: 4_000_000, remainingCents: 7_000_000, overCents: null, expectedToDateCents: 4_000_000, expectedRecordedDays: 8, missingDays: 0, completeness: 'complete', verdict: 'on_pace', verdictLabel: 'On pace', monthLabel: 'September 2026' });
    expect(prod.basis).toEqual({ kind: 'office_days', elapsed: 8, total: 22 });
    expect(prod.detail).toBe('36% of the $110,000 goal · on pace by office day 8 of 22.');
    expect(coll).toMatchObject({ id: 'collections', achievedCents: 3_000_000, expectedToDateCents: 3_000_000, verdict: 'on_pace' });
  });
  it('today counts as elapsed only once its closeout is recorded', () => {
    const [prod] = goalMeters({ today, thisMonth: month({ productionRecordedDays: 9, days: 9 }), targets, monthElapsed: 10 / 30, officeDays, todayRecorded: true });
    expect(prod.basis).toEqual({ kind: 'office_days', elapsed: 9, total: 22 });
    expect(prod.expectedToDateCents).toBe(4_500_000);
    expect(prod.verdict).toBe('behind');
  });
  it('never cross-wires the two targets', () => {
    const [prod, coll] = goalMeters({ today, thisMonth: month(), targets: { ...targets, collectionsCents: 30_000_000 }, monthElapsed: 10 / 30, officeDays });
    expect(prod.verdict).toBe('on_pace');
    expect(coll.verdict).toBe('behind');
    expect(coll.paceLabel).toBe('$79,091 behind pace');
    expect(coll.verdictLabel).toBe('Behind pace');
  });
  it('office days with no closeout make the month partial: totals show, behind is not judged, ahead survives', () => {
    const partial = month({ productionRecordedDays: 6, days: 6, productionCents: 2_000_000, collectedCents: 4_000_000 });
    const [prod, coll] = goalMeters({ today, thisMonth: partial, targets, monthElapsed: 10 / 30, officeDays });
    expect(prod).toMatchObject({ completeness: 'partial', missingDays: 2, verdict: 'incomplete', verdictLabel: 'Partial data', achievedCents: 2_000_000, expectedToDateCents: 4_000_000 });
    expect(prod.detail).toBe('18% of the $110,000 goal · 2 office days not recorded, so pace is not judged until the records are complete.');
    expect(coll).toMatchObject({ completeness: 'partial', verdict: 'ahead', verdictLabel: 'Ahead of pace' });
  });
  it('a goal reached stays reached even with days unrecorded', () => {
    const [prod] = goalMeters({ today, thisMonth: month({ productionCents: 12_000_000, productionRecordedDays: 5, days: 5 }), targets, monthElapsed: 10 / 30, officeDays });
    expect(prod).toMatchObject({ verdict: 'reached', overCents: 1_000_000, remainingCents: 0 });
    expect(prod.pct).toBeCloseTo(12 / 11);
    expect(prod.detail).toBe('Goal reached — $10,000 over the $110,000 goal with 20 days left.');
  });
});

describe('goalMeters without the office calendar', () => {
  it('falls back to calendar days and calls a behind reading an estimate', () => {
    const [prod, coll] = goalMeters({ today, thisMonth: month({ collectedCents: 1_000_000 }), targets: { productionCents: 12_000_000, collectionsCents: 9_000_000, newPatientsSeen: 0 }, monthElapsed: 10 / 30, officeDays: null });
    expect(prod.basis).toEqual({ kind: 'calendar_days', elapsed: 10, total: 30 });
    expect(prod).toMatchObject({ completeness: 'unknown', verdict: 'on_pace', expectedToDateCents: 4_000_000 });
    expect(coll).toMatchObject({ verdict: 'estimate', verdictLabel: 'Below calendar pace (estimate)' });
    expect(coll.detail).toMatch(/an estimate, since the office calendar could not be read/);
  });
  it('labels the basis honestly either way', () => {
    expect(paceBasisLabel({ kind: 'office_days', elapsed: 1, total: 22 })).toMatch(/office days on the office calendar/);
    expect(paceBasisLabel({ kind: 'calendar_days', elapsed: 1, total: 30 })).toMatch(/estimate, not a verdict/);
    expect(PACE_BASIS_LABEL).toMatch(/Calendar-day pace/);
    expect(Object.keys(VERDICT_LABELS)).toEqual(['reached', 'ahead', 'on_pace', 'behind', 'incomplete', 'estimate']);
  });
});

describe('no goal and no data', () => {
  it('no target reads "no goal", with the recorded total but no percentage or verdict', () => {
    const [prod] = goalMeters({ today, thisMonth: month(), targets: { productionCents: 0, collectionsCents: 0, newPatientsSeen: 0 }, monthElapsed: 10 / 30, officeDays });
    expect(prod).toMatchObject({ state: 'no_goal', pct: null, verdict: null });
    expect(prod.detail).toBe('No production goal is set — $40,000 recorded so far this month.');
  });
  it('a target with nothing recorded is "no data", not behind', () => {
    const [prod, coll] = goalMeters({ today, thisMonth: month({ productionCents: 0, collectedCents: 0, productionRecordedDays: 0, days: 0 }), targets, monthElapsed: 10 / 30, officeDays });
    expect(prod).toMatchObject({ state: 'no_data', pace: null, verdict: null });
    expect(coll.detail).toMatch(/nothing recorded yet this month/);
  });
  it('production not entered on the recorded days is "no data" even when collections exist', () => {
    const [prod, coll] = goalMeters({ today, thisMonth: month({ productionCents: 0, productionRecordedDays: 0 }), targets, monthElapsed: 10 / 30, officeDays });
    expect(prod.state).toBe('no_data');
    expect(coll.state).toBe('progress');
  });
});

describe('closeouts outside the office calendar', () => {
  it('never cover a missing office day: the meter judges completeness on office days only', () => {
    // 5 office days elapsed; production recorded on 4 of them plus 2 weekend closeouts (6 recorded in all).
    const meters = goalMeters({
      today: '2026-09-10', targets: { productionCents: 10_000_000, collectionsCents: 9_000_000, newPatientsSeen: 0 },
      thisMonth: month({ productionCents: 3_000_000, collectedCents: 2_500_000, productionRecordedDays: 6, days: 6 }),
      monthElapsed: 10 / 30, officeDays: { total: 22, throughYesterday: 5, throughToday: 6 }, todayRecorded: false,
      recordedOfficeDays: { production: 4, collections: 5 },
    });
    const [prod, coll] = meters;
    expect(prod).toMatchObject({ recordedDays: 6, recordedOfficeDays: 4, expectedRecordedDays: 5, missingDays: 1, completeness: 'partial' });
    expect(coll).toMatchObject({ recordedDays: 6, recordedOfficeDays: 5, missingDays: 0, completeness: 'complete' });
  });
});
