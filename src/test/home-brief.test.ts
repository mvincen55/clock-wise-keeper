/**
 * The manager Home briefing: a short summary of the office state and its
 * genuine priorities, the Attention lists, exceptions only for Today (a
 * late arrival that is simply in is routine, never an exception), status
 * lines that name their scope, the challenge only when noteworthy, and a
 * wrap-up state after close. Nothing here decides; every part navigates.
 */
import { describe, expect, it } from 'vitest';
import type { AttentionItem } from '@/lib/attention';
import type { StaffingSummary } from '@/components/dashboard/staffing';
import type { GoalBrief, MonthPaceLine } from '@/lib/owner-pulse';
import { buildHomeBrief, lastDayLine, needsYou, paceLine, spotlight, stateSummary, todayBand } from '@/lib/home-brief';

const item = (over: Partial<AttentionItem>): AttentionItem => ({
  key: 'pto_request:p1', kind: 'pto_request', verb: 'decide', recordTable: 'pto_requests', recordId: 'p1',
  subject: { employeeId: 'e1', userId: 'u1', name: 'Priya S.' }, label: 'PTO request', detail: '', why: '', occurredAt: null, ageHours: 2,
  deadline: null, coverage: false, payroll: false, href: '/management?item=pto_request:p1', work: 'needs_action', waitingOn: null, parkedUntil: null, snoozedUntil: null, ...over,
});
const open: StaffingSummary = {
  office: { phase: 'open', headline: 'Open', detail: 'Workday runs until 5:00 PM.' },
  expectedNow: 8, presentNow: 6, missingNow: 1, scheduledToday: 8,
  rows: [
    { id: 'e1', name: 'Dana R.', status: 'In', tone: 'steady' },
    { id: 'e2', name: 'Marcus T.', status: 'In · late 12m', tone: 'calm' },
    { id: 'e3', name: 'Jo B.', status: 'Approved off', tone: 'calm' },
    { id: 'e4', name: 'Ken W.', status: 'Not in yet', tone: 'attention' },
    { id: 'e5', name: 'Sam K.', status: 'Starts 1:00 PM', tone: 'calm' },
    { id: 'e6', name: 'Rita M.', status: 'In', tone: 'steady' },
  ],
  reviewCount: 1, reviewDetail: '1 unreviewed late arrival',
};
const closed: StaffingSummary = { ...open, office: { phase: 'after_close', headline: 'Closed for the day', detail: "Today's workday ended at 5:00 PM." }, expectedNow: null, presentNow: null, missingNow: null, rows: [] };
const now = new Date('2026-09-21T13:24:00Z');
const attention = { needsNow: [] as AttentionItem[], waiting: [] as AttentionItem[], deferred: [] as AttentionItem[], degradedSources: [], enabled: true };
const quietNeeds = needsYou(attention);

describe('todayBand', () => {
  it('lists genuine exceptions only, attention first; a late arrival that is in is routine; the count line names who is in and who comes later', () => {
    const t = todayBand({ summary: open, now, needsNow: [
      item({ key: 'correction_request:c9', kind: 'correction_request', verb: 'decide', subject: { employeeId: 'e4', userId: 'u4', name: 'Ken W.' } }),
      item({ key: 'excuse_request:t1', kind: 'excuse_request', verb: 'decide', subject: { employeeId: 'e2', userId: 'u2', name: 'Marcus T.' } }),
    ] });
    expect(t.exceptions.map(e => e.name)).toEqual(['Ken W.', 'Jo B.']);
    // Ken's attendance item is a decision, so the row offers Review; Jo is off with no item: People.
    expect(t.exceptions[0]).toMatchObject({ href: '/management?item=correction_request:c9', action: 'Review' });
    expect(t.exceptions[1]).toMatchObject({ href: '/management/people/e3', action: 'Open' });
    expect(t.countLine).toBe('3 in · Sam K. at 1:00 PM');
    expect(t.inNow).toBe(3);
    expect(t.scheduled).toBe(8);
  });
  it('after close the roster is not live; still-clocked-in people come from the snapshot', () => {
    const snapshot = [
      { employee_id: 'e5', user_id: 'u5', display_name: 'Sam K.', status_code: 'ok', is_late: false, is_absent: false, is_incomplete: true, has_punches: true, is_remote: false, minutes_late: 0, has_day_off: false, office_closed: false, is_scheduled_day: true, schedule_expected_start: '13:00:00', schedule_expected_end: '17:00:00', tardy_approval_status: null },
      { employee_id: 'e1', user_id: 'u1', display_name: 'Dana R.', status_code: 'ok', is_late: false, is_absent: false, is_incomplete: false, has_punches: true, is_remote: false, minutes_late: 0, has_day_off: false, office_closed: false, is_scheduled_day: true, schedule_expected_start: '08:00:00', schedule_expected_end: '17:00:00', tardy_approval_status: null },
    ];
    const t = todayBand({ summary: closed, snapshot, now: new Date('2026-09-21T21:20:00Z'), needsNow: [] });
    expect(t.exceptions.map(e => `${e.name} · ${e.status}`)).toEqual(['Sam K. · Still clocked in']);
    expect(t.countLine).toBe('1 still clocked in');
  });
});

describe('lastDayLine and paceLine', () => {
  it('names the last closeout and whether it is sealed; after close it is today’s', () => {
    const logs = [{ id: 'a', deposit_date: '2026-09-19', sealed_at: null, needs_manager_review: false }, { id: 'b', deposit_date: '2026-09-18', sealed_at: 'x', needs_manager_review: false }];
    expect(lastDayLine({ closeouts: logs, today: '2026-09-21', phase: 'open', closeDay: null })).toMatchObject({ label: "Saturday's closeout", text: 'saved, not sealed', tone: 'attention', href: '/management?item=close_day_unsealed:a', action: 'Open' });
    expect(lastDayLine({ closeouts: [logs[1]], today: '2026-09-19', phase: 'open', closeDay: null })).toMatchObject({ label: "Yesterday's closeout", text: 'sealed', tone: 'calm' });
    expect(lastDayLine({ closeouts: [], today: '2026-09-21', phase: 'open', closeDay: null })).toMatchObject({ text: 'none on record in the last two weeks', tone: 'attention' });
    expect(lastDayLine({ closeouts: logs, today: '2026-09-21', phase: 'after_close', closeDay: { state: 'in_progress', label: 'In progress', detail: '', href: '/deposit-log', tone: 'attention' } })).toMatchObject({ label: "Today's closeout", text: 'In progress', action: 'Open' });
  });
  it('pace is one clause with its scope; behind names the metric, on pace lists the rest', () => {
    const line = (id: MonthPaceLine['id'], label: string, status: 'behind' | 'on_pace' | null): MonthPaceLine => ({ id, label, value: '$1', detail: 'd', tone: status === 'behind' ? 'attention' : 'calm', pace: status ? ({ status } as MonthPaceLine['pace']) : null });
    const all = paceLine([line('production', 'Production month to date', 'on_pace'), line('collections', 'Collections month to date', 'behind'), line('new_patients', 'New patients seen month to date', 'on_pace')], '2026-09-21', '2026-09-18');
    expect(all).toMatchObject({ scope: "through Friday's closeout", text: 'September collections is behind pace; production and new patients seen on pace.', tone: 'attention' });
    expect(all!.figures).toHaveLength(3);
    expect(paceLine([line('production', 'Production month to date', 'on_pace'), line('collections', 'Collections month to date', 'on_pace')], '2026-09-21', '2026-09-20')).toMatchObject({ text: 'September on pace for production and collections.', scope: "through yesterday's closeout" });
    expect(paceLine([line('production', 'Production month to date', null)], '2026-09-21', '2026-09-10')).toMatchObject({ text: 'No targets are set for September; figures only.', scope: 'through closeout from Thu, Sep 10, 2026' });
    expect(paceLine([line('production', 'Production month to date', null)], '2026-09-21', null)).toMatchObject({ text: 'No days have been closed out yet; pace reads from Close the Day.', scope: 'no closeout yet', tone: 'calm' });
    expect(paceLine(null, '2026-09-21', null)).toBeNull();
  });
});

describe('spotlight', () => {
  const goal = (over: Partial<GoalBrief>): GoalBrief => ({ id: 'g', title: 'Huddles on time', done: 6, total: 10, remaining: 4, endsOn: '2026-09-30', endsLabel: 'Sep 30', daysLeft: 9, state: 'on_track', stateLabel: 'On track', stateDetail: '', moreCount: 0, ...over });
  it('shows the challenge only when it needs a decision, is off track, or is ending', () => {
    expect(spotlight(goal({}))).toBeNull();
    expect(spotlight(goal({ state: 'awaiting_verification' }))?.reason).toBe('needs a decision');
    expect(spotlight(goal({ state: 'needs_push' }))?.reason).toBe('off track');
    expect(spotlight(goal({ daysLeft: 2 }))?.reason).toBe('2 days left');
    expect(spotlight(goal({ remaining: 0, done: 10 }))?.reason).toBe('finished');
    expect(spotlight(null)).toBeNull();
  });
});

describe('stateSummary', () => {
  const unsealed = { id: 'l', label: "Saturday's closeout", text: 'saved, not sealed', tone: 'attention' as const, href: '/management?item=close_day_unsealed:a', action: 'Open' };
  it('a busy morning: the state as a headline, the payroll deadline with its open records, and nothing the queue already counts', () => {
    const s = stateSummary({
      office: open.office, today: todayBand({ summary: open, now, needsNow: [] }), needs: quietNeeds, lastDay: unsealed,
      payroll: { dueDate: '2026-09-24', dueLabel: 'payroll Thu' }, payrollItems: 2, todayDate: '2026-09-21',
    });
    expect(s.headline).toBe('Open · 3 of 8 in');
    expect(s.detail).toBe('Workday runs until 5:00 PM · Sam K. at 1:00 PM.');
    expect(s.tone).toBe('steady');
    expect(s.lines).toEqual([{ id: 'payroll', text: 'Payroll hours are due Thu · 2 open time records.', href: '/management/payroll', tone: 'attention' }]);
  });
  it('a quiet day is the state alone: routine status is not a priority', () => {
    // Dana, Marcus (late, but in), Sam (starts at 1:00 PM), Rita: a late arrival that is in is routine.
    const quiet: StaffingSummary = { ...open, scheduledToday: 4, rows: open.rows.filter(r => r.tone !== 'attention' && r.status !== 'Approved off') };
    const s = stateSummary({ office: quiet.office, today: todayBand({ summary: quiet, now, needsNow: [] }), needs: quietNeeds, lastDay: { id: 'l', label: "Yesterday's closeout", text: 'sealed', tone: 'calm', href: '/deposit-log' }, payroll: null, todayDate: '2026-09-21' });
    expect(s.headline).toBe('Open · 3 of 4 in');
    expect(s.lines).toEqual([]);
  });
  it('someone not in yet is the Today panel’s, calmly; someone absent after their shift is a priority', () => {
    const late = new Date('2026-09-21T22:30:00Z');
    const t = { ...todayBand({ summary: open, now, needsNow: [] }), exceptions: [{ id: 'e4', name: 'Ken W.', status: 'Absent', tone: 'attention' as const, href: '/management/people/e4', action: 'Open' as const }] };
    const s = stateSummary({ office: open.office, today: t, needs: quietNeeds, lastDay: null, payroll: null, todayDate: '2026-09-21' });
    expect(s.lines.map(l => l.id)).toEqual(['absent']);
    expect(s.lines[0].text).toBe('Ken W. has no time recorded today.');
    expect(late.getUTCHours()).toBe(22);
  });
  it('no closeout on record at all is a priority; an unsealed one is the queue’s', () => {
    const none = { id: 'l', label: 'Last closeout', text: 'none on record in the last two weeks', tone: 'attention' as const, href: '/deposit-log', action: 'Open' };
    const s = stateSummary({ office: open.office, today: todayBand({ summary: open, now, needsNow: [] }), needs: quietNeeds, lastDay: none, payroll: null, todayDate: '2026-09-21' });
    expect(s.lines.map(l => l.id)).toEqual(['closeout']);
    const u = stateSummary({ office: open.office, today: todayBand({ summary: open, now, needsNow: [] }), needs: quietNeeds, lastDay: unsealed, payroll: null, todayDate: '2026-09-21' });
    expect(u.lines).toEqual([]);
  });
  it('a roster still loading is said, never read as an empty office; a source that failed is a priority', () => {
    const empty: StaffingSummary = { ...open, office: { phase: 'no_schedule', headline: 'No one scheduled today', detail: 'No shifts are on the schedule for today.' }, rows: [], scheduledToday: 0 };
    const s = stateSummary({ office: empty.office, today: todayBand({ summary: empty, now, needsNow: [], asOf: 'loading' }), needs: quietNeeds, lastDay: null, payroll: null, todayDate: '2026-09-21' });
    expect(s.headline).toBe('Reading today’s roster');
    const failed = stateSummary({ office: open.office, today: todayBand({ summary: open, now, needsNow: [], asOf: 'unavailable' }), needs: quietNeeds, lastDay: null, payroll: null, todayDate: '2026-09-21' });
    expect(failed.headline).toBe('Roster unavailable');
    expect(failed.lines[0]).toMatchObject({ id: 'roster', tone: 'attention', href: '/management/people' });
    const degraded = stateSummary({ office: open.office, today: todayBand({ summary: open, now, needsNow: [] }), needs: { ...quietNeeds, degraded: true }, lastDay: null, payroll: null, todayDate: '2026-09-21' });
    expect(degraded.lines[0].id).toBe('degraded');
  });
  it('never more than three lines', () => {
    const t = { ...todayBand({ summary: open, now, needsNow: [] }), exceptions: [{ id: 'e4', name: 'Ken W.', status: 'Absent', tone: 'attention' as const }] };
    const s = stateSummary({ office: open.office, today: t, needs: { ...quietNeeds, degraded: true }, lastDay: { id: 'l', label: 'Last closeout', text: 'none on record in the last two weeks', tone: 'attention', href: '/deposit-log', action: 'Open' }, payroll: { dueDate: '2026-09-22', dueLabel: 'payroll Tue' }, todayDate: '2026-09-21' });
    expect(s.lines).toHaveLength(3);
    expect(s.lines.map(l => l.id)).toEqual(['degraded', 'absent', 'closeout']);
  });
});

describe('buildHomeBrief', () => {
  const closeouts = [{ id: 'a', deposit_date: '2026-09-19', sealed_at: null, needs_manager_review: false }];
  it('a busy morning: the summary, the whole queue split three ways, and the counts', () => {
    const brief = buildHomeBrief({
      attention: { ...attention, needsNow: [item({ payroll: true }), item({ key: 'x:2', recordId: '2' }), item({ key: 'x:3', recordId: '3' }), item({ key: 'x:4', recordId: '4' })], waiting: [item({ key: 'w:1', work: 'waiting_on_employee' })] },
      summary: open, now, today: '2026-09-21', closeouts, closeDay: null, pace: null, paceScopeDate: null, goal: null,
      payroll: { dueDate: '2026-09-24', dueLabel: 'payroll Thu' }, inbox: null,
    });
    expect(brief.summary.headline).toBe('Open · 3 of 8 in');
    expect(brief.summary.lines.map(l => l.text)).toEqual(['Payroll hours are due Thu · 1 open time record.']);
    expect(brief.needs).toMatchObject({ more: 1, waiting: 1, deferred: 0 });
    expect(brief.needs.top).toHaveLength(3);
    expect(brief.needs.now).toHaveLength(4);
    expect(brief.needs.waitingItems).toHaveLength(1);
    expect(brief.wrapUp).toBe(false);
  });
  it('after close the summary is the state, the inbox line exists for Before you leave, and Needs you becomes Before you leave', () => {
    const brief = buildHomeBrief({
      attention, summary: closed, now: new Date('2026-09-21T21:20:00Z'), today: '2026-09-21', closeouts: [],
      closeDay: { state: 'saved_unsealed', label: 'Saved, not sealed', detail: '', href: '/deposit-log', tone: 'attention' }, pace: null, paceScopeDate: null, goal: null, payroll: null,
      inbox: { outstanding: 2, label: 'doctor notes' },
    });
    expect(brief.wrapUp).toBe(true);
    expect(brief.summary.headline).toBe('Closed for the day');
    expect(brief.summary.lines).toEqual([]);
    expect(brief.inbox?.text).toBe('2 doctor notes still need a reply before closeout');
  });
});
