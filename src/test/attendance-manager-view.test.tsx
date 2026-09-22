/**
 * Attendance in two places. Management → Team Attendance: every row says
 * whose it is, one person can be focused, a person's own days off explain
 * only their own absences, every punch of the day is on the row, rows sort
 * by attention, person, or date, and the row actions target the row's
 * employee. Workplace → Attendance stays personal for everyone, managers
 * included.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import DaysOff from '@/pages/DaysOff';
import TeamAttendance from '@/pages/TeamAttendance';
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';

const state = vi.hoisted(() => ({
  role: 'manager' as string,
  /** The day-status rows the page reads; a test may add days. */
  rows: null as unknown[] | null,
  /** How Rick's Monday absence was recorded. */
  rickAbsence: 'scheduled_with_notice' as string,
  recompute: vi.fn().mockResolvedValue(3),
  toast: vi.fn(),
}));

const day = (over: Partial<AttendanceDayStatusRow>): AttendanceDayStatusRow => ({
  id: 'row', user_id: 'login', employee_id: 'emp', entry_date: '2026-09-21',
  schedule_expected_start: '08:25:00', schedule_expected_end: '17:00:00', is_scheduled_day: true,
  office_closed: false, has_punches: false, is_remote: false, is_absent: false, is_incomplete: false,
  is_late: false, minutes_late: 0, tardy_approval_status: 'unreviewed', has_edits: false,
  has_day_comment: false, has_day_off: false, timezone_suspect: false, status_code: 'ok',
  status_reasons: {}, recompute_version: 1, computed_at: '2026-09-22T00:00:00Z', ...over,
});

const rows: AttendanceDayStatusRow[] = [
  // Jane (the signed-in manager) missed Monday with nothing to explain it.
  day({ id: 'jane-0921', user_id: 'manager-login', employee_id: 'emp-jane', is_absent: true, status_code: 'absent', schedule_expected_start: '09:00:00', schedule_expected_end: '13:45:00' }),
  // Rick missed Monday too, but he has a day off recorded for it.
  day({ id: 'rick-0921', user_id: 'rick-login', employee_id: 'emp-rick', is_absent: true, has_day_off: true, status_code: 'absent' }),
  // Jane on Tuesday: arrived late, never clocked out.
  day({ id: 'jane-0922', user_id: 'manager-login', employee_id: 'emp-jane', entry_date: '2026-09-22', has_punches: true, is_incomplete: true, is_late: true, minutes_late: 25, status_code: 'incomplete' }),
];

const punch = (id: string, seq: number, punch_type: 'in' | 'out', punch_time: string) => ({
  id, time_entry_id: 'entry-jane-0922', seq, punch_type, punch_time, source: 'manual' as const, raw_text: null, created_at: '',
  low_confidence: false, location_lat: null, location_lng: null, is_edited: false, original_punch_time: null,
  edited_at: null, edited_by: null, voided_at: null, voided_by: null, void_reason: null,
});
const janePunches = [
  punch('p1', 0, 'in', '2026-09-22T12:50:00Z'), punch('p2', 1, 'out', '2026-09-22T16:00:00Z'), punch('p3', 2, 'in', '2026-09-22T16:30:00Z'),
];

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'manager-login' } }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'office', employee_id: 'emp-jane', user_id: 'manager-login', role: state.role, org_name: 'Office' }, isLoading: false }) }));
vi.mock('@/hooks/usePayrollSettings', () => ({ usePayrollSettings: () => ({ data: { week_start_day: 1 } }) }));
vi.mock('@/hooks/useStaffCodes', () => ({
  useOrgStaff: () => ({ data: [
    { employeeId: 'emp-jane', userId: 'manager-login', displayName: 'Doe, Jane', code: 'JD01', employmentStatus: 'active', membershipStatus: 'active', kind: 'active', isActiveActor: true },
    { employeeId: 'emp-rick', userId: 'rick-login', displayName: 'Roe, Rick', code: 'RR02', employmentStatus: 'active', membershipStatus: 'active', kind: 'active', isActiveActor: true },
  ] }),
}));
// The office clock the day rule reads: Tuesday Sep 22 at 10:00 AM.
vi.mock('@/lib/time-utils', async importOriginal => ({
  ...(await importOriginal<typeof import('@/lib/time-utils')>()),
  getToday: () => '2026-09-22',
  easternWallMinutes: () => 10 * 60,
}));
vi.mock('@/hooks/useAttendanceDayStatus', () => ({
  useAttendanceDayStatus: () => ({ data: state.rows ?? rows, isLoading: false }),
  useRecomputeAttendance: () => ({ mutateAsync: state.recompute, mutate: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/useDaysOff', () => ({
  useDaysOff: () => ({ data: [], isLoading: false }),
  useOrgDaysOff: () => ({ data: [
    { id: 'off-rick', user_id: 'rick-login', employee_id: 'emp-rick', date_start: '2026-09-21', date_end: '2026-09-21', type: state.rickAbsence, hours: 8, notes: 'Vacation', created_at: '' },
  ], isLoading: false }),
  useAddDayOff: () => ({ mutateAsync: vi.fn(), isPending: false, isReady: true }),
  useDeleteDayOff: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/useTardies', () => ({
  useTardies: () => ({ data: [
    { id: 'tardy-jane', user_id: 'manager-login', employee_id: 'emp-jane', time_entry_id: 'entry-jane-0922', entry_date: '2026-09-22', expected_start_time: '08:25:00', actual_start_time: '2026-09-22T12:50:00Z', minutes_late: 25, reason_text: null, approval_status: 'unreviewed', approved_by: null, approved_at: null, resolved: false, timezone_suspect: false, created_at: '', updated_at: '' },
  ], isLoading: false }),
  useUpdateTardy: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('@/hooks/useOfficeClosures', () => ({ useOfficeClosures: () => ({ data: [] }) }));
vi.mock('@/hooks/useTimeEntries', () => ({
  useTimeEntries: () => ({ data: [
    { id: 'entry-jane-0922', user_id: 'manager-login', employee_id: 'emp-jane', entry_date: '2026-09-22', total_minutes: 190, source: 'manual', notes: null, created_at: '', updated_at: '', is_remote: false, location_status: 'onsite', entry_comment: null, punches: janePunches, all_punches: janePunches },
  ] }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: state.toast }) }));
vi.mock('@/components/PersonalCalendar', () => ({ default: () => <div>calendar grid</div> }));
vi.mock('@/components/PtoRequestModal', () => ({ PtoRequestModal: () => null }));
vi.mock('@/components/AttendanceActions', () => ({
  AttendanceActions: ({ row, editButton, employeeName }: { row: AttendanceDayStatusRow; editButton?: boolean; employeeName?: string }) => (
    <button>actions {employeeName} {editButton ? 'edit' : ''} {row.entry_date}</button>
  ),
}));

/** Management → Team Attendance, at its real route. */
function mount(path = '/management/attendance') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/management/attendance" element={<TeamAttendance />} />
        <Route path="/days-off" element={<DaysOff />} />
        <Route path="/" element={<div>home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}
const counter = (label: string) => screen.getByText(label, { selector: 'p.text-xs' }).parentElement!;

afterEach(() => { cleanup(); state.role = 'manager'; state.rickAbsence = 'scheduled_with_notice'; state.rows = null; state.recompute.mockClear(); state.toast.mockClear(); });

describe('Team Attendance (Management)', () => {
  it('names every row and explains an absence only with that person’s own day off', () => {
    mount();
    expect(screen.getAllByRole('button', { name: 'Doe, Jane' })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Roe, Rick' })).toHaveLength(1);
    // Rick's day off covers Rick's Monday; Jane's Monday is still missing.
    expect(counter('Absent')).toHaveTextContent('1Absent');
    expect(counter('Time off')).toHaveTextContent('1Time off');
    expect(screen.getByRole('tab', { name: /Absences/ })).toHaveTextContent('1');
    // Rick's day reads as what it is, not as an absence.
    const rickRow = screen.getByRole('button', { name: 'Roe, Rick' }).closest('tr')!;
    expect(within(rickRow).getByText('Time off')).toBeInTheDocument();
    expect(within(rickRow).queryByText('Absent')).toBeNull();
  });

  it('a callout is an absence with a reason — counted absent, listed as an absence, today or in the future', () => {
    state.rickAbsence = 'unscheduled';
    mount();
    const rickRow = screen.getByRole('button', { name: 'Roe, Rick' }).closest('tr')!;
    expect(within(rickRow).getByText('Callout')).toBeInTheDocument();
    expect(within(rickRow).queryByText(/Time off|Day Off/)).toBeNull();
    expect(counter('Absent')).toHaveTextContent('2Absent');
    expect(counter('Time off')).toHaveTextContent('0Time off');
    expect(screen.getByRole('tab', { name: /Absences/ })).toHaveTextContent('2');
  });

  it('a day that has not ended is never absent: ahead reads Scheduled, today reads Not in yet, and neither is counted', () => {
    state.rows = [
      ...rows,
      // The engine flags a scheduled day the moment it has no punches, Friday included.
      day({ id: 'rick-0925', user_id: 'rick-login', employee_id: 'emp-rick', entry_date: '2026-09-25', is_absent: true, status_code: 'absent' }),
      // Rick today at 10:00 AM: his 8:25 shift has started and has not ended.
      day({ id: 'rick-0922', user_id: 'rick-login', employee_id: 'emp-rick', entry_date: '2026-09-22', is_absent: true, status_code: 'absent' }),
    ];
    mount();
    const rick = screen.getAllByRole('button', { name: 'Roe, Rick' }).map(b => b.closest('tr')!);
    const byDate = (d: string) => rick.find(r => r.textContent!.includes(d))!;
    expect(within(byDate('Sep 25, 2026')).getByText('Scheduled')).toBeInTheDocument();
    expect(within(byDate('Sep 22, 2026')).getByText('Not in yet')).toBeInTheDocument();
    expect(screen.queryAllByText('Absent', { selector: 'span' }).map(el => el.closest('tr')!.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('Sep 21, 2026')]),
    );
    expect(screen.queryAllByText('Absent', { selector: 'span' })).toHaveLength(1);
    // Only Jane's Monday counts; the days ahead do not.
    expect(counter('Absent')).toHaveTextContent('1Absent');
    expect(screen.getByRole('tab', { name: /Absences/ })).toHaveTextContent('1');
  });

  it('an open punch pair today is In, not a missing clock-out, until the day ends', () => {
    mount();
    // Jane at 10:00 AM with an open pair since 8:50: clocked in.
    const jane = screen.getAllByRole('button', { name: 'Doe, Jane' }).map(b => b.closest('tr')!).find(r => r.textContent!.includes('Sep 22, 2026'))!;
    expect(within(jane).getByText('In')).toBeInTheDocument();
    expect(counter('Missing clock-out')).toHaveTextContent('0Missing clock-out');
  });

  it('has no calendar of its own — the office calendar is its own page', () => {
    mount();
    expect(screen.queryByRole('tab', { name: /Calendar/ })).toBeNull();
    expect(screen.getByRole('tab', { name: 'Time off & callouts' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Record absence' })).toBeInTheDocument();
  });

  it('shows every clock-in and clock-out of the day, with the break between them', () => {
    mount();
    expect(screen.getByText('08:50 AM')).toBeInTheDocument();
    expect(screen.getByText('12:00 PM')).toBeInTheDocument();
    expect(screen.getByText('12:30 PM')).toBeInTheDocument();
    expect(screen.getByText('no clock out')).toBeInTheDocument();
    expect(screen.getByText('30m break ·')).toBeInTheDocument();
    expect(screen.getByText('03:10 total')).toBeInTheDocument();
  });

  it('row actions target the row’s employee and offer the punch editor directly', () => {
    mount();
    expect(screen.getAllByRole('button', { name: /^actions Doe, Jane edit/ })).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'actions Roe, Rick edit 2026-09-21' })).toBeInTheDocument();
  });

  it('clicking a name focuses that person; Show everyone widens it again', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Roe, Rick' }));
    expect(screen.queryByRole('button', { name: 'Doe, Jane' })).toBeNull();
    expect(screen.getByRole('button', { name: 'actions Roe, Rick edit 2026-09-21' })).toBeInTheDocument();
    expect(counter('Absent')).toHaveTextContent('0Absent');
    expect(screen.getByRole('tab', { name: /Absences/ })).not.toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
    expect(screen.getAllByRole('button', { name: 'Doe, Jane' })).toHaveLength(2);
  });

  it('a link that names a team member opens focused on them', () => {
    mount('/management/attendance?employee=emp-rick');
    expect(screen.queryByRole('button', { name: 'Doe, Jane' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Show everyone' })).toBeInTheDocument();
    // The Days Off tab is scoped to them too (Radix tabs activate on mouse down).
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Time off & callouts' }));
    expect(screen.getByText(/Roe, Rick's time off from/)).toBeInTheDocument();
    expect(screen.getByText('Vacation')).toBeInTheDocument();
  });

  it('the tardy review says whose tardy it is', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: '1 Unreviewed tardy' }));
    const tardyRow = (await screen.findByText('Review')).closest('tr')!;
    expect(within(tardyRow).getByText('Doe, Jane')).toBeInTheDocument();
    fireEvent.click(within(tardyRow).getByText('Review'));
    expect(await screen.findByText(/Review Tardy — Doe, Jane — /)).toBeInTheDocument();
  });

  it('Recompute covers everyone in the office when no one is focused', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Recompute' }));
    await waitFor(() => expect(state.recompute).toHaveBeenCalledTimes(2));
    expect(state.recompute).toHaveBeenCalledWith(expect.objectContaining({ userId: 'manager-login' }));
    expect(state.recompute).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rick-login' }));
    expect(state.toast).toHaveBeenCalledWith(expect.objectContaining({ title: 'Recomputed 6 days for 2 team members' }));
  });

  it('with a person focused, Recompute is theirs alone', async () => {
    mount('/management/attendance?employee=emp-rick');
    fireEvent.click(screen.getByRole('button', { name: 'Recompute' }));
    await waitFor(() => expect(state.recompute).toHaveBeenCalledTimes(1));
    expect(state.recompute).toHaveBeenCalledWith(expect.objectContaining({ userId: 'rick-login' }));
  });
});

describe('Workplace → Attendance for a manager', () => {
  it('is their own attendance, with their tools, and points at Team Attendance', () => {
    mount('/days-off');
    expect(screen.getByRole('heading', { name: 'Attendance' })).toBeInTheDocument();
    expect(screen.getByText('Your days off, tardies, absences, and closures')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'actions Roe, Rick edit 2026-09-21' })).toBeNull();
    expect(screen.getAllByRole('button', { name: /^actions Doe, Jane edit/ })).toHaveLength(2);
    expect(screen.queryByText('Team member')).toBeNull();
    expect(screen.queryByRole('group', { name: 'Sort' })).toBeNull();
    expect(screen.getByRole('tab', { name: 'My Calendar' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Team Attendance is under Management/ })).toHaveAttribute('href', '/management/attendance');
  });

  it('Recompute there is the manager’s own', async () => {
    mount('/days-off');
    fireEvent.click(screen.getByRole('button', { name: 'Recompute' }));
    await waitFor(() => expect(state.recompute).toHaveBeenCalledTimes(1));
    expect(state.recompute).toHaveBeenCalledWith(expect.objectContaining({ userId: 'manager-login' }));
  });

  it('a Timesheet link to a date opens their own attendance on that day', () => {
    mount('/days-off?date=2026-09-01');
    expect(screen.getByRole('heading', { name: 'Attendance' })).toBeInTheDocument();
    expect(screen.getByLabelText('Start Date')).toHaveValue('2026-09-01');
  });

  it('Record absence there is for themselves — no picker', () => {
    mount('/days-off');
    fireEvent.click(screen.getByRole('button', { name: 'Record absence' }));
    expect(screen.queryByText('Team member')).toBeNull();
  });
});

describe('Team Attendance — sorting', () => {
  const dataRows = () => screen.getAllByRole('row').filter(r => /Sep \d+, 2026/.test(r.textContent || ''));

  it('Needs attention puts the missed days first, and an explained day off last', () => {
    mount();
    const rows = dataRows();
    expect(rows[0]).toHaveTextContent('Mon, Sep 21, 2026');
    expect(rows[0]).toHaveTextContent('Absent');
    // Jane's late Tuesday outranks Rick's Monday, which his time off explains.
    expect(rows[1]).toHaveTextContent('Tue, Sep 22, 2026');
    expect(rows[2]).toHaveTextContent('Roe, Rick');
    expect(rows[2]).toHaveTextContent('Time off');
  });

  it('By date is newest first', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'By date' }));
    expect(dataRows()[0]).toHaveTextContent('Tue, Sep 22, 2026');
  });

  it('By person groups each person’s days under one header', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'By person' }));
    // The name lives in a header row now, not repeated on every row.
    expect(screen.queryByRole('columnheader', { name: 'Employee' })).toBeNull();
    const rows = screen.getAllByRole('row');
    const janeHeader = rows.findIndex(r => (r.textContent || '').trim() === 'Doe, Jane');
    const rickHeader = rows.findIndex(r => (r.textContent || '').trim() === 'Roe, Rick');
    expect(janeHeader).toBeGreaterThan(0);
    expect(rickHeader).toBeGreaterThan(janeHeader);
    expect(rows[janeHeader + 1]).toHaveTextContent('Tue, Sep 22, 2026');
    expect(rows[janeHeader + 2]).toHaveTextContent('Mon, Sep 21, 2026');
    expect(rows[rickHeader + 1]).toHaveTextContent('Mon, Sep 21, 2026');
    // A header is also the way to focus that person.
    fireEvent.click(screen.getByRole('button', { name: 'Roe, Rick' }));
    expect(screen.getByRole('button', { name: 'Show everyone' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^actions Doe, Jane/ })).toBeNull();
  });
});

describe('Workplace → Attendance for an employee', () => {
  it('keeps the personal layout: no picker, no manager actions, a link into the Timesheet', () => {
    state.role = 'employee';
    mount('/days-off');
    expect(screen.queryByText('Team member')).toBeNull();
    expect(screen.queryByRole('button', { name: /^actions/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Record absence' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Request Time Off' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View in Timesheet' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'My Calendar' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Team Attendance/ })).toBeNull();
  });

  it('is sent home from Team Attendance', () => {
    state.role = 'employee';
    mount('/management/attendance');
    expect(screen.getByText('home')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Team Attendance' })).toBeNull();
  });
});
