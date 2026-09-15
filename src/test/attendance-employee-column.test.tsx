import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import DaysOff from '@/pages/DaysOff';

const state = vi.hoisted(() => ({ role: 'manager' as 'manager' | 'employee' }));

const day = (overrides: Record<string, unknown>) => ({
  id: 'row', user_id: 'login-megan', employee_id: 'emp-megan', entry_date: '2026-09-14',
  schedule_expected_start: '08:25', schedule_expected_end: '17:00', is_scheduled_day: true,
  office_closed: false, has_punches: true, is_remote: false, is_absent: false, is_incomplete: false,
  is_late: false, minutes_late: 0, tardy_approval_status: 'unreviewed', has_edits: false,
  has_day_comment: false, has_day_off: false, timezone_suspect: false, status_code: 'ok',
  status_reasons: {}, recompute_version: 1, computed_at: '2026-09-15T00:00:00Z', ...overrides,
});
// Two people, one date: the manager's own worked day and another employee's no-show.
const rows = [
  day({ id: 'megan-14' }),
  day({ id: 'sam-14', user_id: 'login-sam', employee_id: 'emp-sam', schedule_expected_start: '08:20', has_punches: false, is_absent: true, status_code: 'absent' }),
];
const employees = [
  { id: 'emp-megan', user_id: 'login-megan', display_name: 'Megan Vincent', preferred_name: null },
  { id: 'emp-sam', user_id: 'login-sam', display_name: 'Samantha Ortiz', preferred_name: 'Sam' },
];

vi.mock('react-router-dom', () => ({ useNavigate: () => vi.fn() }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'login-megan' } }) }));
vi.mock('@/hooks/useOrgContext', () => ({
  useOrgContext: () => ({ data: { org_id: 'office', employee_id: 'emp-megan', user_id: 'login-megan', role: state.role, org_name: 'Office' } }),
}));
vi.mock('@/hooks/usePayrollSettings', () => ({ usePayrollSettings: () => ({ data: null }) }));
vi.mock('@/hooks/useDaysOff', () => ({
  useDaysOff: () => ({ data: [], isLoading: false }),
  useAddDayOff: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDeleteDayOff: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useTardies', () => ({
  useTardies: () => ({ data: [], isLoading: false }),
  useUpdateTardy: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useAttendanceExceptions', () => ({ useAttendanceExceptions: () => ({ data: [] }) }));
vi.mock('@/hooks/useAttendanceDayStatus', () => ({
  useAttendanceDayStatus: () => ({ data: state.role === 'manager' ? rows : rows.filter(r => r.user_id === 'login-megan'), isLoading: false }),
  useRecomputeAttendance: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useOfficeClosures', () => ({
  useOfficeClosures: () => ({ data: [] }),
  useAddClosure: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useEmployeeNames', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useEmployeeNames')>()),
  useOrgEmployeeNames: () => ({ data: state.role === 'manager' ? employees : employees.slice(0, 1) }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/PtoRequestModal', () => ({ PtoRequestModal: () => null }));
vi.mock('@/components/TardyReviewModal', () => ({ TardyReviewModal: () => null }));
vi.mock('@/components/AttendanceActions', () => ({ AttendanceActions: () => null }));
vi.mock('@/components/PersonalCalendar', () => ({ default: () => null }));
afterEach(cleanup);

const rowContaining = (text: string) => screen.getAllByRole('row').find(row => within(row).queryByText(text));

describe('attendance page names the employee on each row', () => {
  it('shows a manager whose day each row is, marking their own', () => {
    state.role = 'manager';
    render(<DaysOff />);
    expect(screen.getByRole('columnheader', { name: 'Employee' })).toBeInTheDocument();
    const absent = rowContaining('Absent')!;
    expect(within(absent).getByText('Sam')).toBeInTheDocument();
    expect(within(absent).queryByText('(you)')).not.toBeInTheDocument();
    const arrived = rowContaining('Arrived')!;
    expect(within(arrived).getByText('Megan Vincent')).toBeInTheDocument();
    expect(within(arrived).getByText('(you)')).toBeInTheDocument();
    expect(screen.getByText('All employees')).toBeInTheDocument();
  });

  it('keeps the column off an employee’s own-only view', () => {
    state.role = 'employee';
    render(<DaysOff />);
    expect(screen.queryByRole('columnheader', { name: 'Employee' })).not.toBeInTheDocument();
    expect(screen.queryByText('All employees')).not.toBeInTheDocument();
    expect(rowContaining('Absent')).toBeUndefined();
    expect(rowContaining('Arrived')).toBeDefined();
  });
});
