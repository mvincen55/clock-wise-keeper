/**
 * home-performance — the builder every role view reads. Organization
 * isolation and access are enforced here, before any component renders:
 * rows from another office never pass, and a member never receives report
 * history or postings whatever the cache holds.
 */
import { describe, expect, it } from 'vitest';
import { performanceDataFrom, type PerformanceRaw } from '@/lib/home-performance';
import type { DayVitals, VitalsSummary } from '@/hooks/usePracticeVitals';
import type { PreparedReport } from '@/lib/prepared-report';
import { filterMetersByVisibility } from '@/components/dashboard/performance/block';
import { goalMeters } from '@/lib/goal-progress';

const summary: VitalsSummary = {
  productionCents: 100, collectedCents: 100, newPatientsScheduled: 0, newPatientsSeen: 0, newPatientsScheduledRecordedDays: 0,
  newPatientsSeenRecordedDays: 0, hygieneCancellations: 0, hygieneNoShows: 0, doctorCancellations: 0, doctorNoShows: 0, disruptions: 0,
  productionRecordedDays: 1, disruptionsRecordedDays: 1, days: 1,
};
const day: DayVitals = {
  date: '2026-09-02', productionCents: 100, collectedCents: 100, newPatientsScheduled: 1, newPatientsSeen: 1,
  hygieneCancellations: 0, hygieneNoShows: 0, doctorCancellations: 0, doctorNoShows: 0, sealedAt: null,
};
const raw = (over: Partial<PerformanceRaw> = {}): PerformanceRaw => ({
  orgId: 'office-a', viewerOrgId: 'office-a', today: '2026-09-24', role: 'owner', days: [day], closeoutsState: 'ok',
  reports: [{ id: 'r', report_start: '2026-08-01', report_end: '2026-08-31', imported_at: '2026-09-01T00:00:00Z', payload: { daily_financials_by_entry_date: [{ date: '2026-08-04', posted_charges_cents: 5, recorded_payments_cents: 5, credit_adjustments_cents: 0, charge_adjustments_cents: 0 }] } as unknown as PreparedReport }],
  reportState: 'ok', missedEvents: [{ business_date: '2026-09-02', code: '9100', department: 'doctor' }], missedState: 'ok',
  visibility: { production: true, collections: true, newPatients: true }, thisMonth: summary,
  targets: { productionCents: 0, collectionsCents: 0, newPatientsSeen: 0 }, monthElapsed: 0.8, ...over,
});

describe('organization switching', () => {
  it('rows read for another office never build a view for this one', () => {
    expect(performanceDataFrom(raw({ orgId: 'office-b' }))).toBeNull();
    expect(performanceDataFrom(raw())?.orgId).toBe('office-a');
  });
});

describe('role access', () => {
  it('admins get closeouts, report history, and postings', () => {
    const d = performanceDataFrom(raw())!;
    expect(d.access).toBe('admin');
    expect(d.sources.reportDays).toHaveLength(1);
    expect(d.missedEvents).toHaveLength(1);
    expect(d.presets).toContain('last_3_months');
  });
  it('a member gets the shared rows only — no report history, no postings — whatever was passed in', () => {
    const d = performanceDataFrom(raw({ role: 'employee' }))!;
    expect(d.access).toBe('member');
    expect(d.sources.reportDays).toEqual([]);
    expect(d.sources.reportState).toBe('unauthorized');
    expect(d.missedEvents).toEqual([]);
    expect(d.missedState).toBe('unauthorized');
    expect(d.sources.closeouts).toHaveLength(1);
  });
  it('a member’s goal meters follow each metric’s own visibility', () => {
    const meters = goalMeters({ today: '2026-09-24', thisMonth: summary, targets: { productionCents: 100, collectionsCents: 100, newPatientsSeen: 0 }, monthElapsed: 0.8 });
    expect(filterMetersByVisibility(meters, { production: false, collections: true, newPatients: true }).map(m => m.id)).toEqual(['collections']);
    expect(filterMetersByVisibility(meters, { production: false, collections: false, newPatients: true })).toEqual([]);
  });
});
