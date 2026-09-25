/**
 * goal-progress — production and collections each against ONLY their own
 * target, by the shared calendar-day pace formula. No target is "no goal",
 * no data is "nothing recorded" (never behind), and over-goal stays over.
 */
import { describe, expect, it } from 'vitest';
import { goalMeters, PACE_BASIS_LABEL } from '@/lib/goal-progress';
import type { VitalsSummary } from '@/hooks/usePracticeVitals';

const month = (over: Partial<VitalsSummary> = {}): VitalsSummary => ({
  productionCents: 4_000_000, collectedCents: 3_000_000, newPatientsScheduled: 0, newPatientsSeen: 0,
  newPatientsScheduledRecordedDays: 0, newPatientsSeenRecordedDays: 0, hygieneCancellations: 0, hygieneNoShows: 0,
  doctorCancellations: 0, doctorNoShows: 0, disruptions: 0, productionRecordedDays: 8, disruptionsRecordedDays: 8, days: 8, ...over,
});
const today = '2026-09-10'; // 10 of 30 days elapsed

describe('goalMeters', () => {
  it('reports achieved, remaining, percentage, and the calendar-day expectation per metric', () => {
    const [prod, coll] = goalMeters({ today, thisMonth: month(), targets: { productionCents: 12_000_000, collectionsCents: 9_000_000, newPatientsSeen: 0 }, monthElapsed: 10 / 30 });
    expect(prod).toMatchObject({ id: 'production', state: 'progress', achievedCents: 4_000_000, remainingCents: 8_000_000, overCents: null, expectedToDateCents: 4_000_000, daysElapsed: 10, daysInMonth: 30, monthLabel: 'September 2026' });
    expect(prod.pct).toBeCloseTo(1 / 3);
    expect(prod.pace?.status).toBe('on_pace');
    expect(prod.paceLabel).toBe('on calendar pace');
    expect(coll).toMatchObject({ id: 'collections', achievedCents: 3_000_000, expectedToDateCents: 3_000_000, remainingCents: 6_000_000 });
    expect(coll.pace?.status).toBe('on_pace');
  });
  it('never cross-wires the two targets', () => {
    const [prod, coll] = goalMeters({ today, thisMonth: month(), targets: { productionCents: 12_000_000, collectionsCents: 30_000_000, newPatientsSeen: 0 }, monthElapsed: 10 / 30 });
    expect(prod.pace?.status).toBe('on_pace');
    expect(coll.pace?.status).toBe('behind');
    expect(coll.paceLabel).toBe('$70,000 behind calendar pace');
  });
  it('no target reads "no goal", with the recorded total but no percentage', () => {
    const [prod] = goalMeters({ today, thisMonth: month(), targets: { productionCents: 0, collectionsCents: 0, newPatientsSeen: 0 }, monthElapsed: 10 / 30 });
    expect(prod.state).toBe('no_goal');
    expect(prod.pct).toBeNull();
    expect(prod.detail).toBe('No production goal is set — $40,000 recorded so far this month.');
  });
  it('a target with nothing recorded is "no data", not behind', () => {
    const [prod, coll] = goalMeters({ today, thisMonth: month({ productionCents: 0, collectedCents: 0, productionRecordedDays: 0, days: 0 }), targets: { productionCents: 12_000_000, collectionsCents: 9_000_000, newPatientsSeen: 0 }, monthElapsed: 10 / 30 });
    expect(prod.state).toBe('no_data');
    expect(prod.pace).toBeNull();
    expect(coll.detail).toMatch(/nothing recorded yet this month/);
  });
  it('production not entered on the recorded days is "no data" even when collections exist', () => {
    const [prod, coll] = goalMeters({ today, thisMonth: month({ productionCents: 0, productionRecordedDays: 0 }), targets: { productionCents: 12_000_000, collectionsCents: 9_000_000, newPatientsSeen: 0 }, monthElapsed: 10 / 30 });
    expect(prod.state).toBe('no_data');
    expect(coll.state).toBe('progress');
  });
  it('a legitimate over-goal result stays over: pct above 1, remaining 0, overage named', () => {
    const [prod] = goalMeters({ today: '2026-09-28', thisMonth: month({ productionCents: 13_000_000, productionRecordedDays: 20, days: 20 }), targets: { productionCents: 12_000_000, collectionsCents: 0, newPatientsSeen: 0 }, monthElapsed: 28 / 30 });
    expect(prod.pct).toBeCloseTo(13 / 12);
    expect(prod.remainingCents).toBe(0);
    expect(prod.overCents).toBe(1_000_000);
    expect(prod.detail).toBe('Goal reached — $10,000 over the $120,000 goal with 2 days left.');
  });
  it('labels the pace basis as calendar days, not the office calendar', () => {
    expect(PACE_BASIS_LABEL).toMatch(/Calendar-day pace/);
    expect(PACE_BASIS_LABEL).toMatch(/not the office’s working days/);
  });
});
