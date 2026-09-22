/**
 * The manager Home briefing (design §3.3): one sentence from recorded
 * facts, the top three Attention items, exceptions only for Today, status
 * lines that name their scope, the challenge only when noteworthy, and a
 * wrap-up state after close. Nothing here decides; every part navigates.
 */
import { describe, expect, it } from 'vitest';
import type { AttentionItem } from '@/lib/attention';
import type { StaffingSummary } from '@/components/dashboard/staffing';
import type { GoalBrief, MonthPaceLine } from '@/lib/owner-pulse';
import { buildHomeBrief, lastDayLine, paceLine, spotlight, stateSentence, todayBand } from '@/lib/home-brief';

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
    { id: 'e2', name: 'Marcus T.', status: 'In · late 12m', tone: 'attention' },
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

describe('todayBand', () => {
  it('lists exceptions only, attention first, opening the attendance item over any other item; the count line names who is in and who comes later', () => {
    const t = todayBand({ summary: open, now, needsNow: [
      item({ key: 'correction_request:c9', kind: 'correction_request', verb: 'decide', subject: { employeeId: 'e2', userId: 'u2', name: 'Marcus T.' } }),
      item({ key: 'tardy_unreviewed:t1', kind: 'tardy_unreviewed', verb: 'follow_up', subject: { employeeId: 'e2', userId: 'u2', name: 'Marcus T.' } }),
    ] });
    expect(t.exceptions.map(e => e.name)).toEqual(['Marcus T.', 'Ken W.', 'Jo B.']);
    expect(t.exceptions[0]).toMatchObject({ href: '/management?item=tardy_unreviewed:t1', action: 'Open' });
    // No attendance item for Ken: his row opens his record in People instead.
    expect(t.exceptions[1]).toMatchObject({ href: '/management/people/e4', action: 'Open' });
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

describe('stateSentence and buildHomeBrief', () => {
  const closeouts = [{ id: 'a', deposit_date: '2026-09-19', sealed_at: null, needs_manager_review: false }];
  it('a busy morning: open with a count, the first exception, the unsealed closeout, the payroll deadline, and what needs the manager', () => {
    const brief = buildHomeBrief({
      attention: { ...attention, needsNow: [item({}), item({ key: 'x:2', recordId: '2' }), item({ key: 'x:3', recordId: '3' }), item({ key: 'x:4', recordId: '4' })], waiting: [item({ key: 'w:1', work: 'waiting_on_employee' })] },
      summary: open, now, today: '2026-09-21', closeouts, closeDay: null, pace: null, paceScopeDate: null, goal: null,
      payroll: { dueDate: '2026-09-24', dueLabel: 'payroll Thu' }, inbox: null,
    });
    const text = brief.sentence.map(p => p.text).join('');
    expect(text).toBe("Open, 3 of 8 in. Marcus T. came in late. Saturday's closeout is saved, not sealed, and payroll hours are due Thu. 4 things need you.");
    expect(brief.sentence.find(p => p.text === '3 of 8 in')?.href).toBe('/management/people');
    expect(brief.sentence.find(p => p.text === 'Marcus T. came in late.')?.href).toBe('/management/people/e2');
    expect(brief.sentence.find(p => p.text.startsWith("Saturday's"))?.href).toBe('/management?item=close_day_unsealed:a');
    expect(brief.needs).toMatchObject({ more: 1, waiting: 1, deferred: 0 });
    expect(brief.needs.top).toHaveLength(3);
    expect(brief.wrapUp).toBe(false);
  });
  it('a quiet day is one sentence; nothing is invented', () => {
    const quiet: StaffingSummary = { ...open, scheduledToday: 3, rows: open.rows.filter(r => r.tone !== 'attention' && r.status !== 'Approved off') };
    const s = stateSentence({ office: quiet.office, today: todayBand({ summary: quiet, now, needsNow: [] }), needs: { top: [], more: 0, waiting: 0, deferred: 0, degraded: false, enabled: true }, lastDay: { id: 'l', label: "Yesterday's closeout", text: 'sealed', tone: 'calm', href: '/deposit-log' }, payroll: null, todayDate: '2026-09-21' });
    expect(s.map(p => p.text).join('')).toBe('Open, 2 of 3 in. Yesterday closed clean. Nothing needs you.');
  });
  it('after close the sentence is the wrap-up, the inbox line appears, and Needs you becomes Before you leave', () => {
    const brief = buildHomeBrief({
      attention, summary: closed, now: new Date('2026-09-21T21:20:00Z'), today: '2026-09-21', closeouts: [],
      closeDay: { state: 'saved_unsealed', label: 'Saved, not sealed', detail: '', href: '/deposit-log', tone: 'attention' }, pace: null, paceScopeDate: null, goal: null, payroll: null,
      inbox: { outstanding: 2, label: 'doctor notes' },
    });
    expect(brief.wrapUp).toBe(true);
    expect(brief.sentence.map(p => p.text).join('')).toBe("Closing. Everyone is clocked out, and today's closeout is saved, not sealed.");
    expect(brief.inbox?.text).toBe('2 doctor notes still need a reply before closeout');
  });
  it('a roster still loading is said, never read as an empty office', () => {
    const empty: StaffingSummary = { ...open, office: { phase: 'no_schedule', headline: 'No one scheduled today', detail: 'No shifts are on the schedule for today.' }, rows: [], scheduledToday: 0 };
    const s = stateSentence({ office: empty.office, today: todayBand({ summary: empty, now, needsNow: [], asOf: 'loading' }), needs: { top: [], more: 0, waiting: 0, deferred: 0, degraded: false, enabled: true }, lastDay: { id: 'l', label: "Yesterday's closeout", text: 'sealed', tone: 'calm', href: '/deposit-log' }, payroll: null, todayDate: '2026-09-21' });
    expect(s.map(p => p.text).join('')).toBe("Reading today's roster. Yesterday closed clean. Nothing needs you.");
  });
  it('a source that could not be read never reads as nothing to do', () => {
    const s = stateSentence({ office: open.office, today: todayBand({ summary: open, now, needsNow: [] }), needs: { top: [], more: 0, waiting: 0, deferred: 0, degraded: true, enabled: true }, lastDay: null, payroll: null, todayDate: '2026-09-21' });
    expect(s.map(p => p.text).join('')).toContain('Some sources are still loading.');
  });
});
