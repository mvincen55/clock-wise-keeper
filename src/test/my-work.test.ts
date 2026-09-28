/**
 * my-work — a person's own open items, from the records they are party to.
 * A late arrival waits on the person's answer; an excuse request they sent
 * waits on a manager; the attendance report needs their signature only once
 * the meeting is on record; nothing of anyone else's is ever theirs.
 */
import { describe, expect, it } from 'vitest';
import { buildMyWork, type MyWorkInput } from '@/lib/my-work';

const today = '2026-03-03';
const me = { today, userId: 'u-me', employeeId: 'e-me' };
const tardy = (over: Partial<NonNullable<MyWorkInput['tardies']>[number]> = {}) => ({
  id: 't1', user_id: 'u-me', entry_date: '2026-03-02', minutes_late: 12, approval_status: 'unreviewed', excuse_requested_at: null, acknowledged_at: null, resolved: false, timezone_suspect: false, ...over,
});
const report = (over: Partial<NonNullable<MyWorkInput['incidents']>[number]> = {}) => ({
  id: 'i1', employee_id: 'e-me', category: 'attendance', status: 'meeting_required', incident_date: '2026-02-20', meeting_recorded_at: null, employee_signed_at: null, manager_signed_at: null, ...over,
});

describe('late arrivals', () => {
  it('an unanswered late arrival needs me, opens the exact row, and asks for no explanation', () => {
    const w = buildMyWork({ ...me, tardies: [tardy()] });
    expect(w.now).toHaveLength(1);
    expect(w.now[0]).toMatchObject({ kind: 'late_arrival', href: '/days-off?tardy=t1', action: 'Answer', tone: 'attention', bucket: 'now', title: 'Late arrival · Mon, Mar 2, 2026' });
    expect(w.now[0].detail).toMatch(/No explanation is required to acknowledge/);
    expect(w.next?.id).toBe('late_arrival:t1');
  });
  it('an acknowledged one is settled; a pending excuse request waits on a manager; a decided one is done', () => {
    expect(buildMyWork({ ...me, tardies: [tardy({ acknowledged_at: '2026-03-02T13:00:00Z' })] }).now).toHaveLength(0);
    const pending = buildMyWork({ ...me, tardies: [tardy({ excuse_requested_at: '2026-03-02T13:00:00Z' })] });
    expect(pending.now).toHaveLength(0);
    expect(pending.waiting[0]).toMatchObject({ kind: 'excuse_request', bucket: 'waiting', tone: 'calm', href: '/days-off?tardy=t1' });
    expect(buildMyWork({ ...me, tardies: [tardy({ approval_status: 'unapproved' })] }).now).toHaveLength(0);
    expect(buildMyWork({ ...me, tardies: [tardy({ approval_status: 'approved' })] }).waiting).toHaveLength(0);
  });
  it('a corrected or suspect arrival never counts; someone else’s never appears', () => {
    expect(buildMyWork({ ...me, tardies: [tardy({ resolved: true })] }).now).toHaveLength(0);
    expect(buildMyWork({ ...me, tardies: [tardy({ timezone_suspect: true })] }).now).toHaveLength(0);
    expect(buildMyWork({ ...me, tardies: [tardy({ user_id: 'u-other' })] }).now).toHaveLength(0);
  });
});

describe('attendance reports', () => {
  it('meeting required waits on the manager; the meeting on record puts the signature on me; my signature leaves the manager’s', () => {
    const before = buildMyWork({ ...me, incidents: [report()] });
    expect(before.now).toHaveLength(0);
    expect(before.waiting[0]).toMatchObject({ kind: 'attendance_report', title: 'Attendance report · meeting required', href: '/incident-reports?report=i1', tone: 'attention' });
    const sign = buildMyWork({ ...me, incidents: [report({ status: 'meeting_completed', meeting_recorded_at: '2026-02-27T15:00:00Z' })] });
    expect(sign.now[0]).toMatchObject({ kind: 'attendance_report', title: 'Sign your attendance report', action: 'Read and sign', tone: 'urgent' });
    expect(sign.next?.title).toBe('Sign your attendance report');
    const signed = buildMyWork({ ...me, incidents: [report({ status: 'awaiting_signatures', meeting_recorded_at: '2026-02-27T15:00:00Z', employee_signed_at: '2026-02-28T09:00:00Z' })] });
    expect(signed.now).toHaveLength(0);
    expect(signed.waiting[0].title).toBe('Attendance report · awaiting manager signature');
    expect(buildMyWork({ ...me, incidents: [report({ status: 'closed', closed_at: 'x' } as never)] }).waiting).toHaveLength(0);
  });
  it('a report about someone else is not mine; a safety report needs my signature until I give it', () => {
    expect(buildMyWork({ ...me, incidents: [report({ employee_id: 'e-other', status: 'meeting_completed', meeting_recorded_at: 'x' })] }).now).toHaveLength(0);
    const safety = buildMyWork({ ...me, incidents: [report({ category: 'sharps_injury', status: 'open' })] });
    expect(safety.now[0]).toMatchObject({ kind: 'incident_signature', action: 'Read and sign' });
    expect(buildMyWork({ ...me, incidents: [report({ category: 'sharps_injury', status: 'open', employee_signed_at: 'x' })] }).now).toHaveLength(0);
  });
});

describe('the rest of my work, in priority order', () => {
  it('signing comes before answering, answering before reading, reading before finishing; waiting is separate', () => {
    const w = buildMyWork({
      ...me,
      tardies: [tardy()],
      incidents: [report({ status: 'meeting_completed', meeting_recorded_at: 'x' })],
      records: [{ id: 'r1', status: 'awaiting_member', kind: 'attendance', created_at: '2026-03-01T10:00:00Z' }],
      bypasses: [{ id: 'b1', checklist_date: '2026-03-02', resolved: false }, { id: 'b0', checklist_date: '2026-02-20', resolved: true }],
      acknowledgments: [
        { id: 'a1', title_snapshot: 'Sterilization log', due_at: '2026-02-28T00:00:00Z', acknowledged_at: null, waived_at: null },
        { id: 'a2', title_snapshot: 'Done', due_at: '2026-03-30T00:00:00Z', acknowledged_at: 'x', waived_at: null },
      ],
      training: [
        { id: 'ta1', assigned_to: 'u-me', status: 'assigned', due_date: '2026-03-01', title: 'Sharps refresher' },
        { id: 'ta2', assigned_to: 'u-other', status: 'assigned', due_date: null },
        { id: 'ta3', assigned_to: 'u-me', status: 'completed', due_date: null },
      ],
      missingDays: [{ date: '2026-02-26' }],
      openChecklistItems: 2,
      repliesOwed: 1,
      ptoRequests: [{ id: 'p1', start_date: '2026-03-20', end_date: '2026-03-20', status: 'pending' }, { id: 'p0', start_date: '2026-02-01', end_date: '2026-02-01', status: 'approved' }],
      corrections: [{ id: 'c1', status: 'pending', created_at: 'x', entry_date: '2026-02-27' }],
    });
    expect(w.now.map(i => i.kind)).toEqual(['attendance_report', 'record', 'late_arrival', 'reply', 'bypass', 'acknowledgment', 'training', 'checklist', 'missing_day']);
    expect(w.now.find(i => i.kind === 'acknowledgment')).toMatchObject({ tone: 'attention', href: '/management/office/acknowledgments?assignment=a1' });
    expect(w.now.find(i => i.kind === 'training')).toMatchObject({ tone: 'attention', href: '/training?assignment=ta1&tab=mine', title: 'Training · Sharps refresher' });
    expect(w.now.find(i => i.kind === 'record')?.href).toBe('/?record=r1');
    expect(w.now.find(i => i.kind === 'checklist')?.title).toBe('2 checklist items open today');
    expect(w.now.find(i => i.kind === 'missing_day')?.href).toBe('/days-off?date=2026-02-26');
    expect(w.waiting.map(i => i.kind)).toEqual(['pto_request', 'correction_request']);
    expect(w.waiting[1].title).toBe('Time correction · Fri, Feb 27, 2026');
    expect(w.next?.kind).toBe('attendance_report');
  });
  it('nothing is a genuine all-clear', () => {
    const w = buildMyWork(me);
    expect(w).toEqual({ now: [], waiting: [], next: null });
  });
});
