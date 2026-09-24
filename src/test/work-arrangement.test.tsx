/**
 * Some people on the roster never punch a clock or accrue PTO — the office's
 * doctors, on Team with their schedule codes so the posted schedule reads
 * against them. Two roster flags (employees.clocks_in, employees.pto_eligible)
 * mark them, set only by an owner or manager through the audited endpoint:
 *
 *  - attendance surfaces leave a non-clocking member out at the data
 *    boundary, exactly like owners, by employee id (they usually have no login);
 *  - Attention, payroll readiness and the closeout calendar never read their
 *    scheduled day as missing time or an office day;
 *  - the Team badge says "No login" rather than "Pending" for them, since no
 *    invite is owed; "No time clock" / "No PTO" are roster facts of their own;
 *  - a member's own clock follows the roster flag after the role.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import WorkArrangementSetting from '@/components/team/WorkArrangementSetting';
import { employeeClocksIn, nonClockingEmployeeIds, rowClocksIn } from '@/lib/clocking';
import { memberClocksIn } from '@/lib/roles';
import { employeeTeamStatus } from '@/lib/team-status';
import { closeoutsFrom, deriveAttention, type AttentionSources } from '@/lib/attention';
import { deriveReadiness, type ReadinessInput } from '@/lib/attention/readiness';
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';

const state = vi.hoisted(() => ({ role: 'manager', rpc: vi.fn().mockResolvedValue({ data: { id: 'doc' }, error: null }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'office', employee_id: 'manager', role: state.role } }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: state.rpc } }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const clients: QueryClient[] = [];
function wrapper({ children }: { children: React.ReactNode }) {
  const c = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  clients.push(c);
  return <QueryClientProvider client={c}>{children}</QueryClientProvider>;
}
afterEach(() => { cleanup(); clients.splice(0).forEach(c => c.clear()); state.role = 'manager'; state.rpc.mockClear(); });

const owners = new Set(['owner-login']);
const roster = [
  { id: 'e-owner', user_id: 'owner-login', clocks_in: true },
  { id: 'e-doc', user_id: null, clocks_in: false },
  { id: 'e-hyg', user_id: null, clocks_in: true },
  { id: 'e-front', user_id: 'front-login' },
];

describe('who clocks', () => {
  it('leaves out owners by login and off-clock members by roster record', () => {
    expect(roster.filter(e => employeeClocksIn(e, owners)).map(e => e.id)).toEqual(['e-hyg', 'e-front']);
    expect([...nonClockingEmployeeIds(roster, owners)].sort()).toEqual(['e-doc', 'e-owner']);
  });
  it('filters attendance rows by either identity', () => {
    const off = nonClockingEmployeeIds(roster, owners);
    expect(rowClocksIn({ employee_id: 'e-doc', user_id: null }, owners, off)).toBe(false);
    expect(rowClocksIn({ employee_id: 'e-owner', user_id: 'owner-login' }, owners, off)).toBe(false);
    expect(rowClocksIn({ employee_id: 'e-hyg', user_id: null }, owners, off)).toBe(true);
    expect(rowClocksIn({ employee_id: null, user_id: 'front-login' }, owners)).toBe(true);
  });
  it("a member's own clock follows the role first, then the roster flag", () => {
    expect(memberClocksIn('owner', true)).toBe(false);
    expect(memberClocksIn('employee', false)).toBe(false);
    expect(memberClocksIn('employee', undefined)).toBe(true);
    expect(memberClocksIn('manager', true)).toBe(true);
  });
});

describe('Team status for an off-clock member', () => {
  it('reads "No login" instead of "Pending": no invite is owed', () => {
    const s = employeeTeamStatus({ hasLogin: false, onboarding: null, clocksIn: false });
    expect(s.kind).toBe('no_login');
    expect(s.label).toBe('No login');
    expect(s.detail).toMatch(/nothing is waiting on an invite/i);
  });
  it('keeps "Pending" for a clocking member without a login', () => {
    expect(employeeTeamStatus({ hasLogin: false, onboarding: null, clocksIn: true }).label).toBe('Pending');
    expect(employeeTeamStatus({ hasLogin: false, onboarding: null }).label).toBe('Pending');
  });
});

const TODAY = '2026-09-21';
const day = (over: Partial<AttendanceDayStatusRow> = {}): AttendanceDayStatusRow => ({
  id: 'ds-doc', user_id: 'doc-login', employee_id: 'e-doc', entry_date: '2026-09-18',
  schedule_expected_start: '08:00:00', schedule_expected_end: '17:00:00',
  is_scheduled_day: true, office_closed: false, has_punches: false, is_remote: false,
  is_absent: true, is_incomplete: false, is_late: false, minutes_late: 0,
  tardy_approval_status: 'unreviewed', has_edits: false, has_day_comment: false,
  has_day_off: false, timezone_suspect: false, status_code: 'absent', status_reasons: {},
  recompute_version: 1, computed_at: '', ...over,
});
const employees = [{ id: 'e-doc', user_id: 'doc-login', display_name: 'Dr. Lin' }, { id: 'e-front', user_id: 'front-login', display_name: 'Sam O.' }];
const attention = (over: Partial<AttentionSources> = {}): AttentionSources => ({
  today: TODAY, nowIso: '2026-09-21T12:24:00Z', nowMinutes: 8 * 60 + 24, bufferMinutes: 60, officePhase: 'open',
  viewer: { userId: 'mgr', role: 'manager' }, employees, ownerUserIds: new Set(), nonClockingEmployeeIds: new Set(['e-doc']),
  payrollPeriod: null, rules: { reviewTardies: true, bypassReasonHours: 24, ackManagerLevel: 2 },
  dayStatuses: [], entries: [], daysOff: [], closures: [], exceptions: [], tardies: [], ptoRequests: [], corrections: [],
  changeRequests: [], closeouts: { today: null, latestSealedDate: null, officeDaysSinceSeal: 0, unsealedPast: [] }, bypasses: [], accountability: [],
  acks: [], training: [], incidents: [], versionsInReview: [], challenges: [], followups: [], ...over,
});

describe('a scheduled day with no punches is not missing time for someone off the clock', () => {
  it('Attention skips the row; the same row for a clocking person is admitted', () => {
    const off = deriveAttention(attention({ dayStatuses: [day()] }));
    expect(off.unresolved.map(i => i.kind)).toEqual([]);
    const on = deriveAttention(attention({ dayStatuses: [day({ id: 'ds-front', employee_id: 'e-front', user_id: 'front-login' })] }));
    expect(on.unresolved.map(i => i.kind)).toEqual(['missing_day']);
  });
  it('payroll readiness stays ready', () => {
    const ok = { state: 'ok' as const, asOf: '2026-09-21T12:24:00Z' };
    const input: ReadinessInput = {
      period: { start: '2026-09-07', end: '2026-09-20' }, today: TODAY, nowMinutes: 8 * 60 + 24, bufferMinutes: 60, weekStartDay: 1,
      employees, ownerUserIds: new Set(), nonClockingEmployeeIds: new Set(['e-doc']),
      dayStatuses: [day()], entries: [], daysOff: [], closures: [], exceptions: [], corrections: [], ptoRequests: [], followups: [],
      sources: { attendance: ok, requests: ok },
    };
    expect(deriveReadiness(input).status).toBe('ready');
    expect(deriveReadiness({ ...input, nonClockingEmployeeIds: new Set() }).status).toBe('not_ready');
  });
  it('their scheduled day alone is not an office day for the closeout count', () => {
    const logs = [{ id: 'l1', deposit_date: '2026-09-15', sealed_at: '2026-09-15T22:00:00Z' } as never];
    expect(closeoutsFrom(logs, [day()], TODAY, new Set(), new Set(['e-doc'])).officeDaysSinceSeal).toBe(0);
    expect(closeoutsFrom(logs, [day()], TODAY, new Set()).officeDaysSinceSeal).toBe(1);
  });
});

describe('Time clock and PTO setting', () => {
  it('lets a manager take a doctor off the clock through the audited endpoint', async () => {
    render(<WorkArrangementSetting employee={{ id: 'doc', clocks_in: true, pto_eligible: true }} />, { wrapper });
    fireEvent.click(screen.getByRole('switch', { name: 'Uses the time clock' }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('set_employee_work_arrangement', { p_employee_id: 'doc', p_clocks_in: false, p_pto_eligible: true }));
  });
  it('turns PTO off on its own, keeping the clock as it is', async () => {
    render(<WorkArrangementSetting employee={{ id: 'doc', clocks_in: false, pto_eligible: true }} />, { wrapper });
    expect(screen.getByRole('switch', { name: 'Uses the time clock' })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('switch', { name: 'Accrues PTO' }));
    await waitFor(() => expect(state.rpc).toHaveBeenCalledWith('set_employee_work_arrangement', { p_employee_id: 'doc', p_clocks_in: false, p_pto_eligible: false }));
  });
  it('is not offered to a team member', () => {
    state.role = 'employee';
    render(<WorkArrangementSetting employee={{ id: 'doc' }} />, { wrapper });
    expect(screen.queryByRole('switch')).toBeNull();
  });
});
