/**
 * Payroll readiness is a verdict on the period's records:
 *  - unresolved missing time, open pairs, unexplained days, pending in-period
 *    corrections and PTO make it not ready;
 *  - asking, parking, or snoozing never removes an issue (it is carried as
 *    `waiting`), so a false "ready" is impossible;
 *  - a source that is not ok makes the verdict unknown, never ready;
 *  - overtime and adjustments are worth a look and never block;
 *  - owners' rows never count.
 */
import { describe, expect, it } from 'vitest';
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { PtoRequest } from '@/hooks/usePtoRequests';
import type { CorrectionRequestRow } from '@/hooks/useCorrectionRequests';
import { deriveReadiness, type ReadinessInput } from '@/lib/attention/readiness';

const row = (over: Partial<AttendanceDayStatusRow> = {}): AttendanceDayStatusRow => ({
  id: 'ds-1', user_id: 'u1', employee_id: 'e1', entry_date: '2026-09-18',
  schedule_expected_start: '08:00:00', schedule_expected_end: '17:00:00',
  is_scheduled_day: true, office_closed: false, has_punches: true, is_remote: false,
  is_absent: false, is_incomplete: false, is_late: false, minutes_late: 0,
  tardy_approval_status: 'unreviewed', has_edits: false, has_day_comment: false,
  has_day_off: false, timezone_suspect: false, status_code: 'ok', status_reasons: {},
  recompute_version: 1, computed_at: '', ...over,
});
const ok = { state: 'ok' as const, asOf: '2026-09-21T12:24:00Z' };
const input = (over: Partial<ReadinessInput> = {}): ReadinessInput => ({
  period: { start: '2026-09-07', end: '2026-09-20' }, today: '2026-09-21', nowMinutes: 8 * 60 + 24, bufferMinutes: 60, weekStartDay: 1,
  employees: [{ id: 'e1', user_id: 'u1', display_name: 'Priya S.' }, { id: 'e2', user_id: 'u2', display_name: 'Alice N.' }, { id: 'e9', user_id: 'owner', display_name: 'Dr. Lin' }],
  ownerUserIds: new Set(['owner']),
  dayStatuses: [], entries: [], daysOff: [], closures: [], exceptions: [], corrections: [], ptoRequests: [], followups: [],
  sources: { attendance: ok, requests: ok }, ...over,
});

describe('deriveReadiness', () => {
  it('is ready when every row in the period is clean and nothing is pending', () => {
    const r = deriveReadiness(input({ dayStatuses: [row(), row({ id: 'ds-2', entry_date: '2026-09-17' })] }));
    expect(r.status).toBe('ready');
    expect(r.issues).toEqual([]);
    expect(r.summary.shifts).toBe(2);
  });
  it('a missing clock-out and an unexplained day are issues', () => {
    const r = deriveReadiness(input({ dayStatuses: [
      row({ is_incomplete: true }),
      row({ id: 'ds-2', employee_id: 'e2', user_id: 'u2', entry_date: '2026-09-17', has_punches: false, is_absent: true }),
    ] }));
    expect(r.status).toBe('not_ready');
    expect(r.issues.map(i => i.kind).sort()).toEqual(['missing_clock_out', 'missing_day']);
    expect(r.issues.find(i => i.kind === 'missing_day')?.name).toBe('Alice N.');
  });
  it('asking the employee carries as waiting and never removes the issue', () => {
    const r = deriveReadiness(input({
      dayStatuses: [row({ is_incomplete: true })],
      followups: [{ item_key: 'missing_clock_out:ds-1', work_state: 'waiting_on_employee', owner_user_id: 'u1', requested_at: '2026-09-21T12:31:00Z', due_at: '2026-09-23', parked_until: null, snoozed_until: null, note: null }],
    }));
    expect(r.status).toBe('not_ready');
    expect(r.issues[0].waiting?.workState).toBe('waiting_on_employee');
  });
  it('pending corrections and PTO inside the period are issues; outside the period they are not', () => {
    const corr = (id: string, date: string): CorrectionRequestRow => ({ id, org_id: 'o', employee_id: 'e1', created_by: 'u1', target_table: 'punches', target_id: 't', proposed_change: { entry_date: date, description: 'x' }, reason: 'x', status: 'pending', reviewed_by: null, reviewed_at: null, resolution_note: null, applied_audit_event_ids: null, created_at: '' });
    const pto = (id: string, start: string, end: string): PtoRequest => ({ id, org_id: 'o', employee_id: 'e2', created_by: 'u2', start_date: start, end_date: end, pto_type: 'pto', hours_requested: 16, note: null, status: 'pending', reviewed_by: null, reviewed_at: null, review_note: null, created_at: '', updated_at: '' } as unknown as PtoRequest);
    const r = deriveReadiness(input({ corrections: [corr('c1', '2026-09-18'), corr('c2', '2026-10-01')], ptoRequests: [pto('p1', '2026-09-19', '2026-09-19'), pto('p2', '2026-10-01', '2026-10-02')] }));
    expect(r.issues.map(i => i.key)).toEqual(['correction_request:c1', 'pto_request:p1']);
  });
  it('a source that is not ok makes the verdict unknown, never ready', () => {
    const r = deriveReadiness(input({ sources: { attendance: { state: 'stale', asOf: '2026-09-21T10:10:00Z' }, requests: ok } }));
    expect(r.status).toBe('unknown');
    expect(r.degraded[0].name).toBe('attendance');
  });
  it('owners never count', () => {
    const r = deriveReadiness(input({ dayStatuses: [row({ user_id: 'owner', employee_id: 'e9', has_punches: false, is_absent: true })] }));
    expect(r.status).toBe('ready');
    expect(r.summary.people).toBe(0);
  });
  it('overtime and adjustments are worth a look and do not block', () => {
    const e = (id: string, date: string, minutes: number) => ({ id, user_id: 'u1', employee_id: 'e1', entry_date: date, total_minutes: minutes, source: 'manual', notes: null, created_at: '', updated_at: '', is_remote: false, entry_comment: null, punches: [], all_punches: [] } as never);
    const r = deriveReadiness(input({ entries: [e('a', '2026-09-14', 540), e('b', '2026-09-15', 540), e('c', '2026-09-16', 540), e('d', '2026-09-17', 540), e('e', '2026-09-18', 330)], adjustments: [{ id: 'adj', employee_id: 'e1', adjustment_date: '2026-09-16', hours_delta: 1, reason: 'covered lunch coverage' }] }));
    expect(r.status).toBe('ready');
    expect(r.worthALook.map(w => w.kind)).toEqual(['overtime', 'adjustment']);
    expect(r.worthALook[0].detail).toContain('1.5h over 40');
  });
});
