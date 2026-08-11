/**
 * Manager pulse — close-day status, the deterministic briefing, and the
 * consequence-ordered intervention queue. The rules pinned here:
 *
 *  - Close the Day states come from the record itself, and "not started"
 *    while the office is open is calm, not urgent;
 *  - a human's unsafe/understaffed staffing answer outranks everything;
 *  - a stale deposit log outranks performance signals;
 *  - a metric behind pace enters the queue only when its own goal supports
 *    the verdict, and the receipts name the actual numbers;
 *  - a quiet office yields an empty queue and no invented intervention.
 */
import { describe, expect, it } from 'vitest';
import type { DepositLog } from '@/hooks/useDepositLog';
import type { DayVitals, VitalsSummary } from '@/hooks/usePracticeVitals';
import type { OwnerPulseInput } from '@/lib/owner-pulse';
import {
  buildInterventionQueue,
  buildManagerBrief,
  closeDayStatus,
  type InterventionInput,
} from '@/lib/manager-pulse';

const log = (over: Partial<DepositLog> = {}): DepositLog =>
  ({
    id: 'log-1',
    deposit_date: '2026-08-10',
    production_cents: 700_000,
    new_patients_scheduled_count: 2,
    new_patients_seen_count: 1,
    sealed_at: null,
    sealed_by: null,
    needs_manager_review: false,
    staffing_assessment: 'about_right',
    ...over,
  }) as DepositLog;

const day = (date: string, over: Partial<DayVitals> = {}): DayVitals => ({
  date,
  productionCents: 742_000,
  collectedCents: 615_000,
  newPatientsScheduled: 3,
  newPatientsSeen: 2,
  hygieneCancellations: 0,
  hygieneNoShows: 0,
  doctorCancellations: 0,
  doctorNoShows: 0,
  ...over,
});

const summary = (over: Partial<VitalsSummary> = {}): VitalsSummary => ({
  productionCents: 4_218_000,
  collectedCents: 5_840_000,
  newPatientsScheduled: 14,
  newPatientsSeen: 11,
  newPatientsScheduledRecordedDays: 6,
  newPatientsSeenRecordedDays: 6,
  hygieneCancellations: 4,
  hygieneNoShows: 2,
  doctorCancellations: 3,
  doctorNoShows: 2,
  disruptions: 11,
  days: 6,
  ...over,
});

const input = (over: Partial<OwnerPulseInput> = {}): OwnerPulseInput => ({
  today: '2026-08-10',
  todayVitals: day('2026-08-10'),
  latest: day('2026-08-10'),
  thisMonth: summary(),
  prevMonth: null,
  monthElapsed: 10 / 31,
  targets: { productionCents: 0, collectionsCents: 13_500_000, newPatientsSeen: 0 },
  weeklyNewPatientPace: null,
  scheduledThisWeek: 5,
  scheduledThisWeekRecordedDays: 2,
  officePhase: 'after_close',
  ...over,
});

const quiet = (over: Partial<InterventionInput> = {}): InterventionInput => ({
  input: input(),
  closeDay: closeDayStatus(log({ sealed_at: '2026-08-10T22:00:00Z' }), 'after_close'),
  staffingAssessment: 'about_right',
  lowConfidenceCount: 0,
  ptoRequests: 0,
  timeCorrections: 0,
  changeRequests: 0,
  managerReviews: 0,
  bypasses: 0,
  overdueAcks: 0,
  openTraining: 0,
  nudges: 0,
  goals: [],
  ...over,
});

/* ---------------------------- close day status --------------------------- */

describe('closeDayStatus', () => {
  it('no record while the office is open is calm, not urgent', () => {
    const s = closeDayStatus(null, 'open');
    expect(s.state).toBe('not_started');
    expect(s.tone).toBe('calm');
  });

  it('no record after close asks for attention', () => {
    const s = closeDayStatus(null, 'after_close');
    expect(s.state).toBe('not_started');
    expect(s.tone).toBe('attention');
  });

  it('a saved record with unanswered vitals is "in progress"', () => {
    const s = closeDayStatus(log({ new_patients_seen_count: null }), 'open');
    expect(s.state).toBe('in_progress');
  });

  it('a filled, unsealed record still needs the seal', () => {
    expect(closeDayStatus(log(), 'after_close').state).toBe('saved_unsealed');
  });

  it('sealed, and sealed-with-review, are distinct states', () => {
    expect(closeDayStatus(log({ sealed_at: 'x' }), 'after_close').state).toBe('sealed');
    expect(
      closeDayStatus(log({ sealed_at: 'x', needs_manager_review: true }), 'after_close').state,
    ).toBe('sealed_needs_review');
  });

  it('always links to the Close the Day record', () => {
    expect(closeDayStatus(null, 'open').href).toBe('/deposit-log');
  });
});

/* ------------------------------- briefing -------------------------------- */

describe('buildManagerBrief', () => {
  it('reuses the canonical daily facts — same numbers as Owner Home', () => {
    const brief = buildManagerBrief(input(), 'about_right');
    expect(brief.daily.facts.find(f => f.id === 'production')?.value).toBe('$7,420');
    expect(brief.summary).toContain('$7,420');
  });

  it('an unsafe staffing answer is appended to the briefing, first-class', () => {
    const brief = buildManagerBrief(input(), 'unsafe');
    expect(brief.summary).toMatch(/unsafe or unsustainable/);
  });

  it('a missing closeout is narrated, never zeroed', () => {
    const brief = buildManagerBrief(
      input({ todayVitals: null, latest: day('2026-08-07'), officePhase: 'after_close' }),
      null,
    );
    expect(brief.daily.note).toBe("Today's closeout has not been entered yet.");
    expect(brief.summary).not.toContain('$0');
  });
});

/* ---------------------------- intervention queue -------------------------- */

describe('buildInterventionQueue', () => {
  it('a quiet office yields an empty queue and no invented intervention', () => {
    const { next, queue } = buildInterventionQueue(quiet());
    expect(queue).toHaveLength(0);
    expect(next).toBeNull();
  });

  it('an unsafe staffing answer outranks everything else', () => {
    const { next, queue } = buildInterventionQueue(
      quiet({ staffingAssessment: 'unsafe', managerReviews: 3, ptoRequests: 5 }),
    );
    expect(queue[0].id).toBe('staffing-answer');
    expect(next?.text).toMatch(/unsafe/);
  });

  it('a stale deposit log outranks performance and approvals', () => {
    const { next, queue } = buildInterventionQueue(
      quiet({
        input: input({
          todayVitals: null,
          latest: day('2026-08-07'),
          thisMonth: summary({ collectedCents: 1_000_000 }),
        }),
        ptoRequests: 4,
      }),
    );
    expect(queue[0].id).toBe('closeout-gap');
    expect(next?.receipts.map(r => r.label)).toContain('Last closeout');
  });

  it('a metric behind pace queues with its own goal in the receipt', () => {
    const { queue } = buildInterventionQueue(
      quiet({ input: input({ thisMonth: summary({ collectedCents: 1_000_000 }) }) }),
    );
    const item = queue.find(q => q.id === 'pace-collections');
    expect(item).toBeDefined();
    expect(item?.detail).toMatch(/its own goal/);
    // Production has no goal in this input — it never borrows collections'.
    expect(queue.find(q => q.id === 'pace-production')).toBeUndefined();
  });

  it('an unsealed closeout is queued and recommended with receipts', () => {
    const { next, queue } = buildInterventionQueue(
      quiet({ closeDay: closeDayStatus(log(), 'after_close') }),
    );
    expect(queue[0].id).toBe('closeout-state');
    expect(next?.receipts[0].label).toBe('Close the Day');
  });

  it('people-work fills the queue in fixed order after the record of truth', () => {
    const { queue } = buildInterventionQueue(
      quiet({ ptoRequests: 2, timeCorrections: 1, overdueAcks: 3, openTraining: 5, nudges: 1 }),
    );
    expect(queue.map(q => q.id)).toEqual(['pto', 'corrections', 'acks', 'training', 'nudges']);
  });

  it('a sprint out of runway appears in the queue', () => {
    const { queue } = buildInterventionQueue(
      quiet({
        goals: [{
          id: 'g1', title: 'Recall reactivation', metric: 'patients', progress: 2,
          target_count: 10, starts_on: '2026-08-01', ends_on: '2026-08-12', status: 'active',
        }],
      }),
    );
    expect(queue.find(q => q.id === 'sprint-g1')?.label).toMatch(/running out of runway/);
  });
});
