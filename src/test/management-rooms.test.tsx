/**
 * Management rooms (design §3.4): the shell gates members and lands on
 * Attention; the legacy addresses redirect to the exact room and item;
 * Attention renders one derived state as three labeled lists with filters
 * that never reorder, a quiet sentence, and an honest degraded-source
 * notice; Payroll readiness reads one verdict.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { AttentionItem } from '@/lib/attention';

const state = vi.hoisted(() => ({
  role: 'manager' as 'owner' | 'manager' | 'employee',
  attention: null as null | Record<string, unknown>,
  readiness: null as null | Record<string, unknown>,
}));

vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: state.role, org_id: 'office', employee_id: 'emp-mgr', user_id: 'mgr' }, isLoading: false }) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));
vi.mock('@/hooks/useAttentionItems', () => ({ useAttentionItems: () => state.attention, ATTENTION_WINDOW_DAYS: 30 }));
vi.mock('@/hooks/useReadiness', () => ({ useReadiness: () => state.readiness }));
vi.mock('@/hooks/usePayrollSettings', () => ({ usePayrollSettings: () => ({ data: { pay_period_type: 'weekly', week_start_day: 1, payroll_due_days_after_period: 4, pay_period_anchor: null, missing_shift_buffer_minutes: 60 } }) }));
vi.mock('@/components/management/AttentionPanel', () => ({ default: ({ item, onClose }: { item: AttentionItem; onClose: () => void }) => <div data-testid="panel">Panel · {item.label}<button onClick={onClose}>Close panel</button></div> }));

import ManagementShell from '@/components/management/ManagementShell';
import AttentionRoom from '@/components/management/AttentionRoom';
import PayrollReadiness from '@/pages/management/PayrollReadiness';
import { LegacyAcknowledgmentsRedirect, LegacyApprovalsRedirect, LegacyEmployeeRedirect, LegacySettingsTabRedirect, LegacyTeamRedirect } from '@/components/management/LegacyRedirects';

const item = (over: Partial<AttentionItem>): AttentionItem => ({
  key: 'pto_request:p1', kind: 'pto_request', verb: 'decide', recordTable: 'pto_requests', recordId: 'p1',
  subject: { employeeId: 'e1', userId: 'u1', name: 'Priya S.' }, label: 'PTO request · 2026-10-01', detail: '', why: 'A PTO request is waiting on a manager decision.',
  occurredAt: '2026-09-20T10:00:00Z', ageHours: 26, deadline: null, coverage: false, payroll: false, href: '/management?item=pto_request:p1',
  work: 'needs_action', waitingOn: null, parkedUntil: null, snoozedUntil: null, ...over,
});
const counts = (needsNow: number, waiting: number, deferred: number, byVerb = { decide: 0, fix: 0, follow_up: 0 }) => ({ unresolved: needsNow + waiting + deferred, needsNow, waiting, deferred, byVerb });

function Location() { const l = useLocation(); return <p data-testid="location">{l.pathname}{l.search}{l.hash}</p>; }

afterEach(() => { cleanup(); state.role = 'manager'; });

describe('ManagementShell', () => {
  it('sends members home and shows managers the four rooms with the one count', () => {
    state.attention = { counts: counts(3, 1, 0) };
    state.role = 'employee';
    render(<MemoryRouter initialEntries={['/management']}><Routes><Route path="/" element={<p>Home</p>} /><Route path="/management" element={<ManagementShell room="attention"><p>Room</p></ManagementShell>} /></Routes></MemoryRouter>);
    expect(screen.getByText('Home')).toBeInTheDocument();
    cleanup();
    state.role = 'manager';
    render(<MemoryRouter initialEntries={['/management']}><ManagementShell room="attention"><p>Room</p></ManagementShell></MemoryRouter>);
    for (const room of ['Attention', 'People', 'Payroll', 'Office']) expect(screen.getByRole('link', { name: new RegExp(room) })).toBeInTheDocument();
    expect(screen.getByLabelText('3 need you now')).toHaveTextContent('3');
    expect(screen.getByRole('link', { name: /Attention/ })).toHaveAttribute('aria-current', 'page');
  });
});

describe('legacy addresses land on the room that owns them', () => {
  const mount = (entry: string) => render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/approvals" element={<LegacyApprovalsRedirect />} />
        <Route path="/team" element={<LegacyTeamRedirect />} />
        <Route path="/team/:employeeId" element={<LegacyEmployeeRedirect />} />
        <Route path="/acknowledgments" element={<LegacyAcknowledgmentsRedirect />} />
        <Route path="/settings/:tab" element={<LegacySettingsTabRedirect />} />
        <Route path="*" element={<Location />} />
      </Routes>
    </MemoryRouter>,
  );
  it.each([
    ['/approvals', '/management?kind=decide'],
    ['/approvals?tab=pto-requests&request=pto-42', '/management?item=pto_request:pto-42'],
    ['/approvals?tab=corrections&request=cr-1', '/management?item=correction_request:cr-1'],
    ['/team', '/management/people'],
    ['/team?bypass=b-1', '/management/people?view=patterns&bypass=b-1'],
    ['/team/emp-9', '/management/people/emp-9'],
    ['/acknowledgments?assignment=ack-7', '/management/office/acknowledgments?assignment=ack-7'],
    ['/settings/office#work-zones', '/management/office/settings#work-zones'],
    ['/settings/workflows?closingDate=2026-06-08#schedule-intelligence', '/management/office/settings?closingDate=2026-06-08#schedule-intelligence'],
    ['/settings/me', '/settings'],
  ])('%s → %s', (from, to) => {
    mount(from);
    expect(screen.getByTestId('location')).toHaveTextContent(to);
    cleanup();
  });
});

describe('AttentionRoom', () => {
  const base = () => ({
    enabled: true, today: '2026-09-21', payrollPeriod: null, degradedSources: [] as { name: string; status: { state: string; asOf: string | null } }[],
    unresolved: [] as AttentionItem[], needsNow: [] as AttentionItem[], waiting: [] as AttentionItem[], deferred: [] as AttentionItem[], counts: counts(0, 0, 0),
  });
  const mount = (entry = '/management') => render(<MemoryRouter initialEntries={[entry]}><AttentionRoom /></MemoryRouter>);

  it('a quiet office is one sentence, never rows of zeros', () => {
    state.attention = base();
    mount();
    expect(screen.getByText(/Nothing waiting\./)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeInTheDocument();
    expect(screen.queryByText('Now')).not.toBeInTheDocument();
  });

  it('three labeled lists from one state; a row opens the panel; filters narrow without reordering', () => {
    const now1 = item({ key: 'clocked_in_after_close:ds-t', kind: 'clocked_in_after_close', verb: 'fix', recordId: 'ds-t', label: 'Still clocked in', subject: { employeeId: 'e2', userId: 'u2', name: 'Sam K.' }, coverage: true, deadline: { label: 'tonight', date: '2026-09-21', days: 0 } });
    const now2 = item({});
    const waiting = item({ key: 'missing_clock_out:ds-1', kind: 'missing_clock_out', verb: 'fix', recordId: 'ds-1', label: 'No clock-out · 2026-09-18', work: 'waiting_on_employee', waitingOn: { ownerUserId: 'u1', requestedAt: '2026-09-21T12:31:00Z', dueAt: '2026-09-23' }, payroll: true });
    const later = item({ key: 'tardy_unreviewed:t1', kind: 'tardy_unreviewed', verb: 'follow_up', recordId: 't1', label: 'Late 12 min', parkedUntil: '2026-09-25' });
    state.attention = { ...base(), unresolved: [now1, now2, waiting, later], needsNow: [now1, now2], waiting: [waiting], deferred: [later], counts: counts(2, 1, 1, { decide: 1, fix: 1, follow_up: 0 }) };
    mount();
    expect(screen.getByText('2 need you now · 1 waiting on others · 1 later')).toBeInTheDocument();
    const rows = screen.getAllByRole('button', { name: /Still clocked in|PTO request|No clock-out|Late 12 min/ });
    expect(rows.map(r => r.textContent)).toEqual([
      expect.stringContaining('Still clocked in'), expect.stringContaining('PTO request'), expect.stringContaining('No clock-out'), expect.stringContaining('Late 12 min'),
    ]);
    expect(screen.getByText(/Waiting on Priya S\. · follow up .* still unresolved for payroll/)).toBeInTheDocument();
    expect(screen.getByText(/Parked until/)).toBeInTheDocument();
    fireEvent.click(rows[1]);
    expect(screen.getByTestId('panel')).toHaveTextContent('Panel · PTO request · 2026-10-01');
    fireEvent.click(screen.getByRole('button', { name: 'Decide 1' }));
    expect(screen.queryByRole('button', { name: /Still clocked in/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /PTO request/ })).toBeInTheDocument();
    fireEvent.click(screen.getByText('Close panel'));
    expect(screen.queryByTestId('panel')).not.toBeInTheDocument();
  });

  it('a deep link opens the exact item and a stale link says so', () => {
    const one = item({});
    state.attention = { ...base(), unresolved: [one], needsNow: [one], counts: counts(1, 0, 0, { decide: 1, fix: 0, follow_up: 0 }) };
    mount('/management?item=pto_request:p1');
    expect(screen.getByTestId('panel')).toHaveTextContent('PTO request');
    cleanup();
    mount('/management?item=pto_request:gone');
    expect(screen.getByText(/This item is no longer open/)).toBeInTheDocument();
  });

  it('a source that cannot be read is said, never shown as clean', () => {
    state.attention = { ...base(), degradedSources: [{ name: 'followups', status: { state: 'error', asOf: null } }] };
    mount();
    expect(screen.getByText(/Could not read followups/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing waiting\./)).toHaveTextContent('Some sources');
  });
});

describe('PayrollReadiness', () => {
  const mount = (entry = '/management/payroll') => render(<MemoryRouter initialEntries={[entry]}><Routes><Route path="/management/payroll" element={<PayrollReadiness />} /></Routes></MemoryRouter>);
  const summary = { people: 6, shifts: 40, minutesRecorded: 18_000, approvedPtoDays: 1, closures: 0 };

  it('reads one verdict: not ready lists the exact fixes and never blocks the report', () => {
    state.readiness = { enabled: true, refetch: vi.fn(), result: { status: 'not_ready', degraded: [], worthALook: [], summary, issues: [
      { key: 'missing_clock_out:ds-1', kind: 'missing_clock_out', employeeId: 'e1', name: 'Priya S.', date: '2026-09-18', label: 'No clock-out (open punch pair)', href: '/management/attendance?employee=e1&date=2026-09-18', waiting: { workState: 'waiting_on_employee', requestedAt: '2026-09-21T12:31:00Z', dueAt: '2026-09-23' } },
    ] } };
    mount();
    expect(screen.getByRole('heading', { name: 'Not ready yet · 1 record' })).toBeInTheDocument();
    expect(screen.getByText(/waiting on Priya · follow up .* still unresolved for payroll/)).toBeInTheDocument();
    const fix = screen.getByRole('link', { name: 'Fix the day' });
    expect(fix.getAttribute('href')).toMatch(/^\/management\/attendance\?employee=e1&date=2026-09-18&return=%2Fmanagement%2Fpayroll/);
    expect(screen.getByRole('link', { name: /Prepare payroll report · 1 open record/ })).toHaveAttribute('href', expect.stringMatching(/^\/reports\?type=pay_period&start=\d{4}-\d{2}-\d{2}&end=\d{4}-\d{2}-\d{2}$/));
  });

  it('ready is one line; unknown offers a retry and says which source', () => {
    state.readiness = { enabled: true, refetch: vi.fn(), result: { status: 'ready', degraded: [], worthALook: [], summary, issues: [] } };
    mount();
    expect(screen.getByRole('heading', { name: 'Ready' })).toBeInTheDocument();
    cleanup();
    state.readiness = { enabled: true, refetch: vi.fn(), result: { status: 'unknown', degraded: [{ name: 'attendance', status: { state: 'stale', asOf: '2026-09-21T10:10:00Z' } }], worthALook: [], summary, issues: [] } };
    mount();
    expect(screen.getByRole('heading', { name: 'Can’t confirm yet' })).toBeInTheDocument();
    expect(screen.getByText(/attendance: stale/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Retry/ })).toBeInTheDocument();
  });
});
