import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import DepositLog from '@/pages/DepositLog';
import { closingDate, scheduleReturnUrl } from '@/lib/close-day-navigation';
import { getToday } from '@/lib/time-utils';

const state = vi.hoisted(() => ({
  role: 'owner', profiles: [] as object[], pending: false, error: false,
  log: { id: 'day', cash_cents: 1200, checks: [15140], new_patients_scheduled_count: 7, new_patients_seen_count: 3, schedule_capture_status: 'none' },
  save: vi.fn(), metricsSave: vi.fn(), retry: vi.fn(),
  calendar: { closedDates: new Set<string>(), openDates: new Set<string>() } as { closedDates: Set<string>; openDates: Set<string> } | undefined,
  calendarError: false, recordDates: new Set<string>(),
}));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: state.role } }) }));
vi.mock('@/hooks/useDepositLog', () => ({
  useDepositLog: () => ({ data: state.log, isLoading: false }),
  useDepositLogDates: () => ({ data: state.recordDates, isError: false }),
  useSaveDepositLog: () => ({ mutate: state.save, isPending: false }),
  depositChecks: (log: { checks: number[] }) => log.checks,
}));
vi.mock('@/hooks/useOrgBranding', () => ({ useOrgBranding: () => ({}), useOrgDepositSettings: () => ({}) }));
vi.mock('@/hooks/useOfficeDays', () => ({ useOfficeDays: () => ({ data: state.calendar, isError: state.calendarError }) }));
vi.mock('@/hooks/useScheduleIntelligence', () => ({
  useLayoutProfiles: () => ({ data: state.profiles, isPending: state.pending, isError: state.error, refetch: state.retry }),
  usePhraseRules: () => ({ data: [] }), useProviderDayMetrics: () => ({ data: [] }),
  useSaveScheduleMetrics: () => ({ mutateAsync: state.metricsSave }),
  toLayoutProfile: vi.fn(), toClassifierRules: vi.fn(),
}));
vi.mock('@/hooks/useEmployees', () => ({ useOrgEmployees: () => ({ data: [] }) }));
vi.mock('@/hooks/usePracticeSettings', () => ({ usePracticeSettings: () => ({ data: {} }) }));
vi.mock('@/components/close-day/CloseDayCoachCard', () => ({ default: () => null }));
vi.mock('@/components/close-day/SealDayCard', () => ({ default: () => null }));
vi.mock('@/components/close-day/StaffingRealityCard', () => ({ EMPTY_STAFFING: {}, default: () => <p>Staffing questions</p> }));
vi.mock('@/components/DailyVitalsCard', () => ({ default: () => null, parseCountAnswer: (s: string) => s === '' ? null : Number(s) }));

function SetupDestination() {
  const location = useLocation();
  return <><p>{location.pathname}{location.search}{location.hash}</p><Link to={scheduleReturnUrl(new URLSearchParams(location.search).get('closingDate')!)}>Return</Link></>;
}
function mount(step = 2) {
  return render(<MemoryRouter initialEntries={[`/deposit-log?date=2026-06-08&step=${step}`]}><Routes>
    <Route path="/deposit-log" element={<DepositLog />} />
    <Route path="/settings/schedule-intelligence" element={<SetupDestination />} />
  </Routes></MemoryRouter>);
}
beforeEach(() => {
  state.role = 'owner'; state.profiles = []; state.pending = false; state.error = false;
  state.log = { id: 'day', cash_cents: 1200, checks: [15140], new_patients_scheduled_count: 7, new_patients_seen_count: 3, schedule_capture_status: 'none' };
  state.calendar = { closedDates: new Set(), openDates: new Set() }; state.calendarError = false; state.recordDates = new Set();
  vi.clearAllMocks();
});
afterEach(() => vi.useRealTimers());
describe('Schedule setup navigation', () => {
  it('keeps a dollar prefix on every Money input without changing the amount', () => {
    mount(0);
    for (const input of screen.getAllByRole('textbox').filter(el => el.tagName === 'INPUT')) {
      expect(input.parentElement).toHaveTextContent('$');
    }
    expect(screen.getByDisplayValue('151.40')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Cash'), { target: { value: '123.45' } });
    expect(screen.getByLabelText('Cash')).toHaveValue('123.45');
    expect(screen.getByLabelText('Cash').parentElement).toHaveTextContent('$');
  });
  it.each(['owner', 'manager'])('offers setup to %s and returns to the saved date and step', role => {
    state.role = role; mount();
    fireEvent.click(screen.getByRole('button', { name: 'Set up Schedule Intelligence' }));
    expect(screen.getByText('/settings/schedule-intelligence?closingDate=2026-06-08')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Return' }));
    expect(screen.getByText('Privacy View Capture')).toBeInTheDocument();
    expect(screen.getByText(/Mon, Jun 8, 2026/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1. Money/ }));
    expect(screen.getByLabelText('Cash')).toHaveValue('12.00');
    expect(state.save).not.toHaveBeenCalled();
  });
  it('asks employees to contact an owner or manager', () => {
    state.role = 'employee'; mount();
    expect(screen.queryByRole('button', { name: 'Set up Schedule Intelligence' })).not.toBeInTheDocument();
    expect(screen.getByText(/Ask an owner or manager/)).toBeInTheDocument();
  });
  it('skips without saving or changing capture status', () => {
    mount(); fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('Staffing questions')).toBeInTheDocument();
    expect(state.save).not.toHaveBeenCalled(); expect(state.metricsSave).not.toHaveBeenCalled();
    expect(state.log.schedule_capture_status).toBe('none');
  });
  it('waits for a successful save, preserving the draft on failure', () => {
    mount(0); fireEvent.change(screen.getByLabelText('Cash'), { target: { value: '42.50' } });
    fireEvent.click(screen.getByRole('button', { name: /3. Schedule/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up Schedule Intelligence' }));
    const [payload, callbacks] = state.save.mock.calls[0];
    expect(payload).toMatchObject({ depositDate: '2026-06-08', cashCents: 4250, checksCents: [15140], newPatientsScheduledCount: 7 });
    expect(payload).not.toHaveProperty('schedule_capture_status');
    act(() => callbacks.onError(new Error('offline')));
    expect(screen.getByText('Privacy View Capture')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /1. Money/ }));
    expect(screen.getByLabelText('Cash')).toHaveValue('42.50');
    fireEvent.click(screen.getByRole('button', { name: /3. Schedule/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Set up Schedule Intelligence' }));
    state.log = { ...state.log, cash_cents: payload.cashCents };
    act(() => state.save.mock.calls[1][1].onSuccess());
    fireEvent.click(screen.getByRole('link', { name: 'Return' }));
    fireEvent.click(screen.getByRole('button', { name: /1. Money/ }));
    expect(screen.getByLabelText('Cash')).toHaveValue('42.50');
  });
  it('offers capture after configuration rather than setup', () => {
    state.profiles = [{ id: 'profile', is_default: true }]; mount();
    expect(screen.getByRole('button', { name: /Capture Today's Schedule/ })).toBeEnabled();
    expect(screen.queryByText('Set up Schedule Intelligence')).not.toBeInTheDocument();
  });
  it('distinguishes loading and failed setup checks from missing setup', () => {
    state.pending = true; const view = mount();
    expect(screen.getByRole('status')).toHaveTextContent('Checking');
    expect(screen.queryByText('Set up Schedule Intelligence')).not.toBeInTheDocument();
    view.unmount(); state.pending = false; state.error = true; mount();
    expect(screen.getByRole('alert')).toHaveTextContent('Could not check');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(state.retry).toHaveBeenCalled();
  });
  it('rejects invalid date and redirect input', () => {
    expect(closingDate('2026-02-31')).toBe(getToday());
    expect(scheduleReturnUrl('https://example.com')).toBe(`/deposit-log?date=${getToday()}&step=2`);
  });
});

function Location() {
  const location = useLocation();
  return <p>{location.search}</p>;
}
function mountAt(entry: string) {
  return render(<MemoryRouter initialEntries={[entry]}><Routes>
    <Route path="/deposit-log" element={<><DepositLog /><Location /></>} />
    <Route path="/office-calendar" element={<p>Calendar page</p>} />
  </Routes></MemoryRouter>);
}
describe('Office days', () => {
  const previous = () => fireEvent.click(screen.getByRole('button', { name: 'Previous office day' }));
  const next = () => screen.getByRole('button', { name: 'Next office day' });
  const sundayJune14 = () => vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-06-14T15:00:00Z') });
  it('steps over the weekend in both directions', () => {
    mountAt('/deposit-log?date=2026-06-08');
    previous();
    expect(screen.getByText(/Fri, Jun 5, 2026/)).toBeInTheDocument();
    fireEvent.click(next());
    expect(screen.getByText(/Mon, Jun 8, 2026/)).toBeInTheDocument();
  });
  it('skips a full-day closure and offers a Saturday marked open', () => {
    state.calendar = { closedDates: new Set(['2026-06-05']), openDates: new Set(['2026-06-06']) };
    mountAt('/deposit-log?date=2026-06-08');
    previous();
    expect(screen.getByText(/Sat, Jun 6, 2026/)).toBeInTheDocument();
    previous();
    expect(screen.getByText(/Thu, Jun 4, 2026/)).toBeInTheDocument();
  });
  it('lands a closed date on the office day before it, keeping the step', () => {
    mountAt('/deposit-log?date=2026-06-07&step=3');
    expect(screen.getByText(/Fri, Jun 5, 2026/)).toBeInTheDocument();
    expect(screen.getByText('?date=2026-06-05&step=3')).toBeInTheDocument();
    expect(screen.queryByText(/Jun 7, 2026/)).not.toBeInTheDocument();
  });
  it('never hides a day that holds a record', () => {
    state.recordDates = new Set(['2026-06-07']);
    mountAt('/deposit-log?date=2026-06-07');
    expect(screen.getByText(/Sun, Jun 7, 2026/)).toBeInTheDocument();
    previous();
    expect(screen.getByText(/Fri, Jun 5, 2026/)).toBeInTheDocument();
    fireEvent.click(next());
    expect(screen.getByText(/Sun, Jun 7, 2026/)).toBeInTheDocument();
  });
  it('opens on the latest office day when today is closed and tells a manager where to change that', () => {
    sundayJune14();
    mountAt('/deposit-log');
    expect(screen.getByText(/Fri, Jun 12, 2026/)).toBeInTheDocument();
    expect(next()).toBeDisabled();
    expect(screen.getByText(/Today isn't an office day/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Office Calendar' })).toHaveAttribute('href', '/office-calendar');
    expect(screen.getByRole('link', { name: 'Office settings' })).toHaveAttribute('href', '/management/office/settings#office-closures');
    previous();
    expect(screen.getByText(/Thu, Jun 11, 2026/)).toBeInTheDocument();
    expect(next()).toBeEnabled();
    fireEvent.click(next());
    expect(screen.getByText(/Fri, Jun 12, 2026/)).toBeInTheDocument();
    expect(next()).toBeDisabled();
  });
  it('tells a member to ask a manager, and says nothing on an office day', () => {
    sundayJune14(); state.role = 'employee';
    const view = mountAt('/deposit-log');
    expect(screen.getByText(/ask an owner or manager to mark it open/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Office Calendar' })).not.toBeInTheDocument();
    view.unmount(); state.calendar = { closedDates: new Set(), openDates: new Set(['2026-06-14']) };
    mountAt('/deposit-log');
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.queryByText(/isn't an office day/)).not.toBeInTheDocument();
  });
  it('steps plain days and says so when the office calendar cannot be loaded', () => {
    state.calendar = undefined; state.calendarError = true;
    mountAt('/deposit-log?date=2026-06-08');
    expect(screen.getByRole('status')).toHaveTextContent('could not be loaded');
    previous();
    expect(screen.getByText(/Sun, Jun 7, 2026/)).toBeInTheDocument();
  });
});

vi.mock('@/hooks/useProviders', () => ({ useProviders: () => ({ data: [] }) }));
