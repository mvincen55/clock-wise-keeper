import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { Link, MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import DepositLog from '@/pages/DepositLog';
import { closingDate, scheduleReturnUrl } from '@/lib/close-day-navigation';
import { getToday } from '@/lib/time-utils';

const state = vi.hoisted(() => ({
  role: 'owner', profiles: [] as object[], pending: false, error: false,
  log: { id: 'day', cash_cents: 1200, checks: [15140], new_patients_scheduled_count: 7, new_patients_seen_count: 3, schedule_capture_status: 'none' },
  save: vi.fn(), metricsSave: vi.fn(), retry: vi.fn(),
}));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: state.role } }) }));
vi.mock('@/hooks/useDepositLog', () => ({
  useDepositLog: () => ({ data: state.log, isLoading: false }),
  useSaveDepositLog: () => ({ mutate: state.save, isPending: false }),
  depositChecks: (log: { checks: number[] }) => log.checks,
}));
vi.mock('@/hooks/useOrgBranding', () => ({ useOrgBranding: () => ({}), useOrgDepositSettings: () => ({}) }));
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
  vi.clearAllMocks();
});
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
