/**
 * deriveAttention — the one selector every management surface reads.
 *
 *  - admission: an item enters only on a decision, a fixable incorrect
 *    record, or an office rule that reached manager follow-up; the closed
 *    state of every kind is never admitted;
 *  - order: a verified coverage issue first, then the soonest deadline, then
 *    decide / fix / follow-up, oldest first;
 *  - dedup: one item per record condition, and a pending correction request
 *    supersedes the missing-time item for the same person and day;
 *  - layers: work state and park/snooze only decide which list an open item
 *    sits in; the badge counts needsNow; unresolved = needsNow + waiting +
 *    deferred; an expired park is no park;
 *  - honesty: a source that is missing or not ok is reported as degraded and
 *    never read as "nothing to report".
 */
import { describe, expect, it } from 'vitest';
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { PtoRequest } from '@/hooks/usePtoRequests';
import type { CorrectionRequestRow } from '@/hooks/useCorrectionRequests';
import type { ChangeRequestRow } from '@/hooks/useChangeRequests';
import type { TardyRow } from '@/hooks/useTardies';
import type { TrainingAssignment } from '@/hooks/useTraining';
import type { AccountabilityReport } from '@/hooks/useAccountability';
import type { DepositLog } from '@/hooks/useDepositLog';
import type { ManagerFollowup } from '@/lib/attention';
import { deriveAttention, itemKey, type AttentionSources } from '@/lib/attention/derive';

const TODAY = '2026-09-21';
const NOW = '2026-09-21T12:24:00Z';

const employees = [
  { id: 'e1', user_id: 'u1', display_name: 'Priya S.' },
  { id: 'e2', user_id: 'u2', display_name: 'Sam O.' },
  { id: 'e3', user_id: 'u3', display_name: 'Ken B.' },
  { id: 'e9', user_id: 'owner', display_name: 'Dr. Lin' },
];

const src = (over: Partial<AttentionSources> = {}): AttentionSources => ({
  today: TODAY, nowIso: NOW, nowMinutes: 8 * 60 + 24, bufferMinutes: 60, officePhase: 'open',
  viewer: { userId: 'mgr', role: 'manager' }, employees, ownerUserIds: new Set(['owner']),
  payrollPeriod: { start: '2026-09-07', end: '2026-09-20', dueDate: '2026-09-24', dueLabel: 'payroll Thu' },
  rules: { reviewTardies: true, bypassReasonHours: 24, ackManagerLevel: 2 },
  dayStatuses: [], entries: [], daysOff: [], closures: [], exceptions: [], tardies: [], ptoRequests: [], corrections: [],
  changeRequests: [], closeouts: { today: null, latestSealedDate: '2026-09-18', officeDaysSinceSeal: 0, unsealedPast: [] }, bypasses: [], accountability: [],
  acks: [], training: [], incidents: [], versionsInReview: [], challenges: [], followups: [], ...over,
});

const day = (over: Partial<AttendanceDayStatusRow> = {}): AttendanceDayStatusRow => ({
  id: 'ds-1', user_id: 'u1', employee_id: 'e1', entry_date: '2026-09-18',
  schedule_expected_start: '08:00:00', schedule_expected_end: '17:00:00',
  is_scheduled_day: true, office_closed: false, has_punches: true, is_remote: false,
  is_absent: false, is_incomplete: false, is_late: false, minutes_late: 0,
  tardy_approval_status: 'unreviewed', has_edits: false, has_day_comment: false,
  has_day_off: false, timezone_suspect: false, status_code: 'ok', status_reasons: {},
  recompute_version: 1, computed_at: '', ...over,
});
const pto = (over: Partial<PtoRequest> = {}): PtoRequest => ({
  id: 'p1', org_id: 'o', employee_id: 'e2', created_by: 'u2', start_date: '2026-09-18', end_date: '2026-09-18',
  hours_requested: 8, pto_type: 'pto', note: 'dentist', status: 'pending', reviewed_by: null, reviewed_at: null,
  manager_note: null, created_at: '2026-09-15T10:00:00Z', updated_at: '2026-09-15T10:00:00Z', ...over,
});
const correction = (over: Partial<CorrectionRequestRow> = {}): CorrectionRequestRow => ({
  id: 'c1', org_id: 'o', employee_id: 'e1', created_by: 'u1', target_table: 'punches', target_id: 't',
  proposed_change: { entry_date: '2026-09-18', description: 'forgot to clock out' }, reason: 'forgot to clock out',
  status: 'pending', reviewed_by: null, reviewed_at: null, resolution_note: null, applied_audit_event_ids: null,
  created_at: '2026-09-19T08:00:00Z', ...over,
});
const change = (over: Partial<ChangeRequestRow> = {}): ChangeRequestRow => ({
  id: 'ch1', org_id: 'o', employee_id: 'e3', requested_by: 'u3', request_type: 'schedule_change', payload: { description: 'move Friday' },
  status: 'pending', reviewed_by: null, reviewed_at: null, review_reason: null, created_at: '2026-09-20T08:00:00Z', updated_at: '', ...over,
});
const tardy = (over: Partial<TardyRow> = {}): TardyRow => ({
  id: 't1', user_id: 'u2', employee_id: 'e2', time_entry_id: null, entry_date: '2026-09-17', expected_start_time: '08:00:00',
  actual_start_time: '08:22:00', minutes_late: 22, reason_text: null, approval_status: 'unreviewed', approved_by: null,
  approved_at: null, resolved: false, timezone_suspect: false, created_at: '2026-09-17T12:22:00Z', updated_at: '', ...over,
});
const training = (over: Partial<TrainingAssignment> = {}): TrainingAssignment => ({
  id: 'ta1', org_id: 'o', module_id: 'm1', assigned_to: 'u3', assigned_by: 'mgr', due_date: '2026-09-15', status: 'assigned' as never,
  completed_at: null, created_at: '', ...over,
});
const record = (over: Partial<AccountabilityReport> = {}): AccountabilityReport => ({
  id: 'ar1', org_id: 'o', kind: 'tardy_threshold', subject_user_id: 'u2', subject_employee_id: 'e2', period_start: '2026-09-01',
  period_end: '2026-09-20', summary: '3 tardies in 30 days', status: 'awaiting_manager', member_reason: 'traffic', member_signed_name: 'Sam',
  member_signed_at: '2026-09-20T10:00:00Z', manager_note: null, manager_signed_name: null, manager_signed_at: null,
  review_due_at: '2026-09-23T00:00:00Z', escalated_at: null, closed_at: null, created_at: '2026-09-19T10:00:00Z', ...over,
});
const log = (over: Record<string, unknown> = {}): DepositLog => ({
  id: 'dl-today', org_id: 'o', deposit_date: TODAY, sealed_at: null, needs_manager_review: false, staffing_assessment: null,
  created_at: '2026-09-21T10:00:00Z', updated_at: '2026-09-21T10:00:00Z', ...over,
}) as unknown as DepositLog;
const bypass = (over: Record<string, unknown> = {}) => ({
  id: 'b1', org_id: 'o', user_id: 'u3', employee_id: 'e3', checklist_date: '2026-09-18', bypassed_at: '2026-09-18T22:00:00Z',
  escalation_level: 1, incomplete_count: 2, reason: null, reason_submitted_at: null, resolved: false, resolved_at: null, ...over,
}) as never;
const incident = (over: Record<string, unknown> = {}) => ({
  id: 'ir1', org_id: 'o', employee_id: 'e2', incident_date: '2026-09-16', category: 'sharps', status: 'open', countersign_role: 'manager',
  employee_signed_at: '2026-09-16T20:00:00Z', manager_signed_at: null, follow_up_required: false, follow_up_notes: '',
  reviewed_at: null, created_at: '2026-09-16T19:00:00Z', ...over,
}) as never;
const followup = (over: Partial<ManagerFollowup> & { item_key: string }): ManagerFollowup => ({
  work_state: 'needs_action', owner_user_id: null, requested_at: null, due_at: null, parked_until: null, snoozed_until: null, note: null, ...over,
});

const kinds = (r: ReturnType<typeof deriveAttention>) => r.unresolved.map(i => i.kind);

describe('deriveAttention · admission', () => {
  it('reports nothing when every source is loaded and clean', () => {
    const r = deriveAttention(src());
    expect(r.unresolved).toEqual([]);
    expect(r.degradedSources).toEqual([]);
    expect(r.counts).toEqual({ unresolved: 0, needsNow: 0, waiting: 0, deferred: 0, byVerb: { decide: 0, fix: 0, follow_up: 0 } });
  });

  it('admits only pending requests', () => {
    const r = deriveAttention(src({
      ptoRequests: [pto(), pto({ id: 'p2', status: 'approved' })],
      corrections: [correction(), correction({ id: 'c2', status: 'applied' })],
      changeRequests: [change(), change({ id: 'ch2', status: 'denied' })],
    }));
    expect(r.unresolved.map(i => i.key).sort()).toEqual(['change_request:ch1', 'correction_request:c1', 'pto_request:p1']);
    expect(r.unresolved.every(i => i.verb === 'decide')).toBe(true);
  });

  it('a pending PTO or correction inside the pay period carries the payroll deadline; outside it carries none', () => {
    const r = deriveAttention(src({ ptoRequests: [pto(), pto({ id: 'p2', start_date: '2026-10-05', end_date: '2026-10-05' })] }));
    const inside = r.unresolved.find(i => i.recordId === 'p1')!;
    const outside = r.unresolved.find(i => i.recordId === 'p2')!;
    expect(inside.payroll).toBe(true);
    expect(inside.deadline).toEqual({ label: 'payroll Thu', date: '2026-09-24', days: 3 });
    expect(outside.payroll).toBe(false);
    expect(outside.deadline).toBeNull();
  });

  it('nobody reviews their own content submission', () => {
    const r = deriveAttention(src({ versionsInReview: [
      { id: 'v1', title: 'Sterilization', version_number: 3, submitted_by: 'u1', submitted_at: '2026-09-20T09:00:00Z' },
      { id: 'v2', title: 'Front desk', version_number: 2, submitted_by: 'mgr', submitted_at: '2026-09-20T09:00:00Z' },
    ] }));
    expect(r.unresolved.map(i => i.recordId)).toEqual(['v1']);
    expect(r.unresolved[0].subject.name).toBe('Priya S.');
  });

  it('admits a finished challenge awaiting verification, not a live one', () => {
    const g = (id: string, status: string) => ({ id, title: 'Reviews', metric: 'reviews', target_count: 10, progress: 10, status, ends_on: '2026-09-20' }) as never;
    const r = deriveAttention(src({ challenges: [g('g1', 'pending_verification'), g('g2', 'active')] }));
    expect(r.unresolved.map(i => i.key)).toEqual(['challenge_verify:g1']);
  });

  it('incident countersign respects the countersign role and never asks the subject', () => {
    const manager = deriveAttention(src({ incidents: [incident(), incident({ id: 'ir2', countersign_role: 'owner' }), incident({ id: 'ir3', manager_signed_at: '2026-09-17T10:00:00Z' })] }));
    expect(manager.unresolved.map(i => i.key)).toEqual(['incident_countersign:ir1']);
    const owner = deriveAttention(src({ viewer: { userId: 'owner', role: 'owner' }, incidents: [incident({ id: 'ir2', countersign_role: 'owner' })] }));
    expect(owner.unresolved.map(i => i.key)).toEqual(['incident_countersign:ir2']);
    const subject = deriveAttention(src({ viewer: { userId: 'u2', role: 'manager' }, incidents: [incident()] }));
    expect(subject.unresolved).toEqual([]);
  });

  it('an open follow-up on an incident is its own item until the report closes', () => {
    const r = deriveAttention(src({ incidents: [incident({ follow_up_required: true, manager_signed_at: '2026-09-17T10:00:00Z' }), incident({ id: 'ir2', follow_up_required: true, manager_signed_at: '2026-09-17T10:00:00Z', status: 'closed' })] }));
    expect(r.unresolved.map(i => i.key)).toEqual(['incident_followup:ir1']);
  });

  it('missing time comes from the shared rule and never counts owners', () => {
    const r = deriveAttention(src({ dayStatuses: [
      day({ is_incomplete: true }),
      day({ id: 'ds-2', employee_id: 'e2', user_id: 'u2', entry_date: '2026-09-17', has_punches: false, is_absent: true }),
      day({ id: 'ds-9', employee_id: 'e9', user_id: 'owner', entry_date: '2026-09-17', has_punches: false, is_absent: true }),
    ] }));
    expect(r.unresolved.map(i => i.key).sort()).toEqual(['missing_clock_out:ds-1', 'missing_day:ds-2']);
    expect(r.unresolved.every(i => i.verb === 'fix' && i.payroll)).toBe(true);
  });

  it('a pending correction supersedes the missing-time item for the same person and day', () => {
    const r = deriveAttention(src({ dayStatuses: [day({ is_incomplete: true })], corrections: [correction()] }));
    expect(r.unresolved.map(i => i.key)).toEqual(['correction_request:c1']);
    const other = deriveAttention(src({ dayStatuses: [day({ is_incomplete: true })], corrections: [correction({ proposed_change: { entry_date: '2026-09-17' } })] }));
    expect(other.unresolved.map(i => i.key).sort()).toEqual(['correction_request:c1', 'missing_clock_out:ds-1']);
  });

  it('still clocked in past the scheduled end while the office is closing is a coverage item; during the day it is nothing yet', () => {
    const open = day({ id: 'ds-t', entry_date: TODAY, is_incomplete: true });
    const sealedToday = { today: log({ sealed_at: '2026-09-21T21:30:00Z' }), latestSealedDate: TODAY, officeDaysSinceSeal: 0, unsealedPast: [] };
    const closing = deriveAttention(src({ dayStatuses: [open], nowMinutes: 17 * 60 + 20, officePhase: 'after_close', closeouts: sealedToday }));
    expect(closing.unresolved.map(i => i.key)).toEqual(['clocked_in_after_close:ds-t']);
    expect(closing.unresolved[0].coverage).toBe(true);
    expect(closing.unresolved[0].deadline?.label).toBe('tonight');
    const midday = deriveAttention(src({ dayStatuses: [open], nowMinutes: 13 * 60, officePhase: 'open' }));
    expect(midday.unresolved).toEqual([]);
  });

  it('an unsafe or understaffed staffing answer is admitted as coverage; other answers are not', () => {
    const closeouts = (l: DepositLog) => ({ today: l, latestSealedDate: '2026-09-18', officeDaysSinceSeal: 0, unsealedPast: [] });
    const unsafe = deriveAttention(src({ closeouts: closeouts(log({ staffing_assessment: 'unsafe' })) }));
    expect(unsafe.unresolved.map(i => i.kind)).toEqual(['staffing_answer']);
    expect(unsafe.unresolved[0].coverage).toBe(true);
    const fine = deriveAttention(src({ closeouts: closeouts(log({ staffing_assessment: 'stretched' })) }));
    expect(fine.unresolved.map(i => i.kind)).toEqual([]);
  });

  it('Close the Day: behind by two office days, saved-not-sealed, unsealed after close, sealed with review items', () => {
    const behind = deriveAttention(src({ closeouts: { today: null, latestSealedDate: '2026-09-16', officeDaysSinceSeal: 2, unsealedPast: [{ id: 'dl-1', deposit_date: '2026-09-17' }] } }));
    expect(behind.unresolved.map(i => i.key).sort()).toEqual(['close_day_behind:gap:2026-09-16', 'close_day_unsealed:dl-1']);
    const oneDay = deriveAttention(src({ closeouts: { today: null, latestSealedDate: '2026-09-18', officeDaysSinceSeal: 1, unsealedPast: [] } }));
    expect(oneDay.unresolved).toEqual([]);
    const tonight = deriveAttention(src({ officePhase: 'after_close', closeouts: { today: log(), latestSealedDate: '2026-09-18', officeDaysSinceSeal: 0, unsealedPast: [] } }));
    expect(tonight.unresolved.map(i => i.kind)).toEqual(['close_day_unsealed']);
    const notStarted = deriveAttention(src({ officePhase: 'after_close', closeouts: { today: null, latestSealedDate: '2026-09-18', officeDaysSinceSeal: 0, unsealedPast: [] } }));
    expect(notStarted.unresolved.map(i => i.key)).toEqual([`close_day_unsealed:not_started:${TODAY}`]);
    const stillOpen = deriveAttention(src({ officePhase: 'open', closeouts: { today: null, latestSealedDate: '2026-09-18', officeDaysSinceSeal: 0, unsealedPast: [] } }));
    expect(stillOpen.unresolved).toEqual([]);
    const review = deriveAttention(src({ closeouts: { today: log({ sealed_at: '2026-09-21T22:00:00Z', needs_manager_review: true }), latestSealedDate: TODAY, officeDaysSinceSeal: 0, unsealedPast: [] } }));
    expect(review.unresolved.map(i => i.kind)).toEqual(['close_day_review']);
  });

  it('tardies are follow-ups only when the office reviews them', () => {
    const on = deriveAttention(src({ tardies: [tardy(), tardy({ id: 't2', approval_status: 'approved' })] }));
    expect(on.unresolved.map(i => i.key)).toEqual(['tardy_unreviewed:t1']);
    expect(on.unresolved[0].verb).toBe('follow_up');
    const off = deriveAttention(src({ rules: { reviewTardies: false, bypassReasonHours: 24, ackManagerLevel: 2 }, tardies: [tardy()] }));
    expect(off.unresolved).toEqual([]);
  });

  it('a bypass reason owed is admitted once the office rule is reached and drops once followed up', () => {
    const owed = deriveAttention(src({ bypasses: [bypass(), bypass({ id: 'b2', bypassed_at: '2026-09-21T10:00:00Z' }), bypass({ id: 'b3', resolved: true })] }));
    expect(owed.unresolved.map(i => i.key)).toEqual(['bypass_followup:b1']);
    const done = deriveAttention(src({ bypasses: [bypass()], followups: [followup({ item_key: 'bypass_followup:b1', work_state: 'followed_up' })] }));
    expect(done.unresolved).toEqual([]);
  });

  it('record sign-off goes to the reviewer role, never to the subject', () => {
    const rows = [record(), record({ id: 'ar2', status: 'awaiting_owner' }), record({ id: 'ar3', status: 'closed' }), record({ id: 'ar4', status: 'awaiting_member' })];
    const manager = deriveAttention(src({ accountability: rows }));
    expect(manager.unresolved.map(i => i.key)).toEqual(['record_signoff:ar1']);
    expect(manager.unresolved[0].deadline).toEqual({ label: 'due 2026-09-23', date: '2026-09-23', days: 2 });
    const owner = deriveAttention(src({ viewer: { userId: 'owner', role: 'owner' }, accountability: rows }));
    expect(owner.unresolved.map(i => i.key).sort()).toEqual(['record_signoff:ar1', 'record_signoff:ar2']);
    const subject = deriveAttention(src({ viewer: { userId: 'u2', role: 'manager' }, accountability: [record()] }));
    expect(subject.unresolved).toEqual([]);
  });

  it('acknowledgments are admitted only once the ladder reaches the manager step', () => {
    const ack = (id: string, level: number, over: Record<string, unknown> = {}) => ({ id, employee_id: 'e3', user_id: 'u3', escalation_level: level, acknowledged_at: null, waived_at: null, overdue_at: '2026-09-15T00:00:00Z', title_snapshot: 'PPE policy', ...over });
    const r = deriveAttention(src({ acks: [ack('a1', 2), ack('a2', 1), ack('a3', 3, { acknowledged_at: '2026-09-20T00:00:00Z' }), ack('a4', 3, { waived_at: '2026-09-20T00:00:00Z' })] }));
    expect(r.unresolved.map(i => i.key)).toEqual(['ack_escalated:a1']);
  });

  it('training is a follow-up only once it is past due and not completed', () => {
    const r = deriveAttention(src({ training: [training(), training({ id: 'ta2', due_date: '2026-09-30' }), training({ id: 'ta3', status: 'completed' as never }), training({ id: 'ta4', due_date: null })], trainingTitles: new Map([['m1', 'HIPAA basics']]) }));
    expect(r.unresolved.map(i => i.key)).toEqual(['training_overdue:ta1']);
    expect(r.unresolved[0].label).toContain('HIPAA basics');
    expect(r.unresolved[0].subject.name).toBe('Ken B.');
  });
});

describe('deriveAttention · order and dedup', () => {
  it('coverage first, then the soonest deadline, then decide / fix / follow-up, then oldest', () => {
    const r = deriveAttention(src({
      officePhase: 'after_close', nowMinutes: 17 * 60 + 30,
      closeouts: { today: log({ sealed_at: '2026-09-21T21:30:00Z' }), latestSealedDate: TODAY, officeDaysSinceSeal: 0, unsealedPast: [] },
      dayStatuses: [day({ id: 'ds-t', entry_date: TODAY, is_incomplete: true }), day({ id: 'ds-old', entry_date: '2026-09-10', is_incomplete: true })],
      tardies: [tardy()],
      accountability: [record()],
      changeRequests: [change()],
      ptoRequests: [pto({ start_date: '2026-10-05', end_date: '2026-10-05', created_at: '2026-09-10T10:00:00Z' })],
      training: [training()],
    }));
    expect(r.unresolved.map(i => i.key)).toEqual([
      'clocked_in_after_close:ds-t',   // coverage, tonight
      'record_signoff:ar1',            // due in 2 days
      'missing_clock_out:ds-old',      // payroll in 3 days
      'pto_request:p1',                // no deadline · decide · oldest decision
      'change_request:ch1',            // no deadline · decide
      'training_overdue:ta1',          // no deadline · follow-up · overdue since Sep 15
      'tardy_unreviewed:t1',           // no deadline · follow-up · from Sep 17
    ]);
  });

  it('one item per record condition', () => {
    const r = deriveAttention(src({ ptoRequests: [pto(), pto()] }));
    expect(r.unresolved).toHaveLength(1);
  });
});

describe('deriveAttention · work and presentation', () => {
  it('asking the employee moves an item to waiting; it stays unresolved and out of the badge', () => {
    const r = deriveAttention(src({
      dayStatuses: [day({ is_incomplete: true })],
      followups: [followup({ item_key: 'missing_clock_out:ds-1', work_state: 'waiting_on_employee', owner_user_id: 'u1', requested_at: '2026-09-21T12:31:00Z', due_at: '2026-09-23' })],
    }));
    expect(r.counts).toMatchObject({ unresolved: 1, needsNow: 0, waiting: 1, deferred: 0 });
    expect(r.waiting[0].waitingOn).toEqual({ ownerUserId: 'u1', requestedAt: '2026-09-21T12:31:00Z', dueAt: '2026-09-23' });
    expect(r.waiting[0].payroll).toBe(true);
  });

  it('parking (a date) or snoozing (a time) defers; a park reached today is no park', () => {
    const parked = deriveAttention(src({ tardies: [tardy()], followups: [followup({ item_key: 'tardy_unreviewed:t1', parked_until: '2026-09-25' })] }));
    expect(parked.counts).toMatchObject({ unresolved: 1, needsNow: 0, deferred: 1 });
    expect(parked.deferred[0].parkedUntil).toBe('2026-09-25');
    const backToday = deriveAttention(src({ tardies: [tardy()], followups: [followup({ item_key: 'tardy_unreviewed:t1', parked_until: TODAY })] }));
    expect(backToday.counts).toMatchObject({ unresolved: 1, needsNow: 1, deferred: 0 });
    expect(backToday.needsNow[0].parkedUntil).toBeNull();
    const snoozed = deriveAttention(src({ tardies: [tardy()], followups: [followup({ item_key: 'tardy_unreviewed:t1', snoozed_until: '2026-09-21T14:00:00Z' })] }));
    expect(snoozed.counts).toMatchObject({ needsNow: 0, deferred: 1 });
    const snoozeOver = deriveAttention(src({ tardies: [tardy()], followups: [followup({ item_key: 'tardy_unreviewed:t1', snoozed_until: '2026-09-21T12:00:00Z' })] }));
    expect(snoozeOver.counts).toMatchObject({ needsNow: 1, deferred: 0 });
  });

  it('without a configured payroll due date, in-period items carry the payroll flag and no deadline', () => {
    const r = deriveAttention(src({ payrollPeriod: { start: '2026-09-07', end: '2026-09-20', dueDate: null, dueLabel: null }, ptoRequests: [pto()] }));
    expect(r.unresolved[0].payroll).toBe(true);
    expect(r.unresolved[0].deadline).toBeNull();
  });

  it('a follow-up note resolves only the kinds whose rule asks for one', () => {
    const closeouts = { today: log({ staffing_assessment: 'unsafe' }), latestSealedDate: '2026-09-18', officeDaysSinceSeal: 0, unsealedPast: [] };
    const noted = deriveAttention(src({ closeouts, followups: [followup({ item_key: 'staffing_answer:dl-today', work_state: 'followed_up', note: 'Talked to Dana; two hygienists out, covered by Thursday.' })] }));
    expect(noted.unresolved).toEqual([]);
    const tardyNoted = deriveAttention(src({ tardies: [tardy()], followups: [followup({ item_key: 'tardy_unreviewed:t1', work_state: 'followed_up' })] }));
    expect(tardyNoted.counts).toMatchObject({ unresolved: 1, needsNow: 0, waiting: 1 });
  });

  it('a follow-up never admits an item whose record is resolved', () => {
    const r = deriveAttention(src({ tardies: [tardy({ approval_status: 'approved' })], followups: [followup({ item_key: 'tardy_unreviewed:t1', work_state: 'waiting_on_employee' })] }));
    expect(r.unresolved).toEqual([]);
  });

  it('the three lists partition unresolved and byVerb counts only needsNow', () => {
    const r = deriveAttention(src({
      tardies: [tardy(), tardy({ id: 't2', entry_date: '2026-09-18', user_id: 'u3', employee_id: 'e3' })],
      ptoRequests: [pto()],
      changeRequests: [change()],
      followups: [followup({ item_key: 'tardy_unreviewed:t1', work_state: 'waiting_on_employee' }), followup({ item_key: 'pto_request:p1', snoozed_until: '2026-09-21T15:00:00Z' })],
    }));
    expect(r.counts.unresolved).toBe(r.counts.needsNow + r.counts.waiting + r.counts.deferred);
    expect(r.counts).toMatchObject({ unresolved: 4, needsNow: 2, waiting: 1, deferred: 1, byVerb: { decide: 1, fix: 0, follow_up: 1 } });
  });
});

describe('deriveAttention · sources', () => {
  it('a missing source is degraded, other sources still report, and nothing pretends to be clean', () => {
    const r = deriveAttention(src({ dayStatuses: undefined, tardies: [tardy()] }));
    expect(r.degradedSources.map(d => d.name)).toEqual(['dayStatuses']);
    expect(r.degradedSources[0].status.state).toBe('loading');
    expect(r.unresolved.map(i => i.kind)).toEqual(['tardy_unreviewed']);
  });

  it('a reported stale or failed source is degraded even when rows are present', () => {
    const r = deriveAttention(src({ ptoRequests: [pto()], sources: { ptoRequests: { state: 'stale', asOf: '2026-09-21T10:10:00Z' } } }));
    expect(r.degradedSources).toEqual([{ name: 'ptoRequests', status: { state: 'stale', asOf: '2026-09-21T10:10:00Z' } }]);
    expect(r.unresolved).toEqual([]);
  });

  it('attendance needs every attendance source, the roster included, before it reports', () => {
    const r = deriveAttention(src({ dayStatuses: [day({ is_incomplete: true })], closures: undefined }));
    expect(r.unresolved).toEqual([]);
    expect(r.degradedSources.map(d => d.name)).toEqual(['closures']);
    const roster = deriveAttention(src({ dayStatuses: [day({ is_incomplete: true })], sources: { roster: { state: 'loading', asOf: null } } }));
    expect(roster.unresolved).toEqual([]);
    expect(roster.degradedSources.map(d => d.name)).toEqual(['roster']);
  });

  it('a duplicated item key reports once', () => {
    const r = deriveAttention(src({ ptoRequests: [pto()] }));
    expect(itemKey('pto_request', 'p1')).toBe(r.unresolved[0].key);
  });
});

describe('deriveAttention · roster', () => {
  it('ignores attendance, tardy, and bypass records of people off the active roster', () => {
    const gone = { user_id: 'u-gone', employee_id: 'e-gone' };
    const r = deriveAttention(src({
      dayStatuses: [day({ id: 'ds-gone', ...gone, entry_date: '2026-09-15', has_punches: false, is_absent: true, status_code: 'absent' })],
      tardies: [tardy({ id: 't-gone', ...gone })],
      bypasses: [bypass({ id: 'b-gone', ...gone, bypassed_at: '2026-09-15T22:00:00Z' })],
    }));
    expect(kinds(r)).toEqual([]);
  });

  it('keeps the same records for someone on the roster', () => {
    const r = deriveAttention(src({
      dayStatuses: [day({ id: 'ds-here', entry_date: '2026-09-15', has_punches: false, is_absent: true, status_code: 'absent' })],
      tardies: [tardy()],
    }));
    expect(kinds(r)).toContain('missing_day');
    expect(kinds(r)).toContain('tardy_unreviewed');
  });
});
