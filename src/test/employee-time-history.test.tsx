import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import EmployeeTimeHistory from '@/components/team/EmployeeTimeHistory';
import { setAppTimezone } from '@/lib/time-utils';

const state = vi.hoisted(() => ({ role: 'manager', query: vi.fn(), editor: vi.fn(), audit: vi.fn() }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: state.role } }) }));
vi.mock('@/hooks/useEmployees', () => ({ useEmployeeTimeEntries: (...args: unknown[]) => state.query(...args) }));
vi.mock('@/components/PunchEditorModal', () => ({ PunchEditorModal: (props: unknown) => { state.editor(props); return <div>Editor ready</div>; } }));
vi.mock('@/components/AuditHistoryModal', () => ({ AuditHistoryModal: (props: unknown) => { state.audit(props); return <div>Audit ready</div>; } }));

const attendance = Array.from({ length: 14 }, (_, i) => ({
  id: `day-${i}`, entry_date: `2026-09-${String(i + 1).padStart(2, '0')}`,
  status_code: i === 0 ? 'absent' : 'ok', schedule_expected_start: '09:00', minutes_late: 0,
}));
function entry(date: string, time: string | null, voidTime?: string) {
  return {
    id: date, entry_date: date, total_minutes: 60,
    punches: [time && { id: `${date}-in`, seq: 1, punch_type: 'in', punch_time: `${date}T${time}:00Z`, voided_at: null },
      voidTime && { id: `${date}-void`, seq: 0, punch_type: 'in', punch_time: `${date}T${voidTime}:00Z`, voided_at: '2026-09-16T00:00:00Z' }].filter(Boolean),
  };
}
function setup(overrides = {}) {
  return render(<EmployeeTimeHistory employeeId="target-employee" employeeName="Test Teammate"
    attendance={attendance} entries={[]} entriesLoading={false} entriesError={false} {...overrides} />);
}
beforeEach(() => {
  state.role = 'manager'; state.editor.mockClear(); state.audit.mockClear(); state.query.mockReset();
  state.query.mockReturnValue({ data: [], isSuccess: true }); setAppTimezone('America/New_York');
});
afterEach(cleanup);

describe('employee time history', () => {
  it('shows ten recent days and pages through preserved older records', () => {
    setup();
    expect(screen.getAllByRole('button', { name: /^Edit punches for/ })).toHaveLength(10);
    expect(screen.queryByRole('button', { name: 'Edit punches for 2026-09-01' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next attendance page' }));
    expect(screen.getAllByRole('button', { name: /^Edit punches for/ })).toHaveLength(4);
    expect(screen.getByRole('button', { name: 'Edit punches for 2026-09-01' })).toBeInTheDocument();
  });
  it('sorts the whole date range before pagination and resets the page', () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Next attendance page' }));
    fireEvent.change(screen.getByLabelText('Attendance sort direction'), { target: { value: 'asc' } });
    expect(screen.getAllByRole('button', { name: /^Edit punches for/ })[0]).toHaveAccessibleName('Edit punches for 2026-09-01');
    expect(screen.getByRole('button', { name: 'Previous attendance page' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Attendance rows per page'), { target: { value: '25' } });
    expect(screen.getAllByRole('button', { name: /^Edit punches for/ })).toHaveLength(14);
  });
  it('sorts weekdays in calendar order, starting Monday, with newest dates first within a day', () => {
    setup(); fireEvent.change(screen.getByLabelText('Attendance sort by'), { target: { value: 'day' } });
    const buttons = screen.getAllByRole('button', { name: /^Edit punches for/ });
    expect(buttons[0]).toHaveAccessibleName('Edit punches for 2026-09-14');
    expect(buttons[1]).toHaveAccessibleName('Edit punches for 2026-09-07');
  });
  it('sorts clock-in by office time of day across dates, ignoring voids and keeping missing values last', () => {
    setup({ attendance: [], entries: [entry('2026-09-03', '13:00'), entry('2026-09-02', '12:00'), entry('2026-09-01', '14:00', '10:00'), entry('2026-09-04', null)] });
    fireEvent.change(screen.getByLabelText('Clock-ins and clock-outs sort by'), { target: { value: 'in' } });
    expect(screen.getAllByRole('button', { name: /^Edit punches for/ }).map(b => b.getAttribute('aria-label'))).toEqual([
      'Edit punches for 2026-09-02', 'Edit punches for 2026-09-03', 'Edit punches for 2026-09-01', 'Edit punches for 2026-09-04',
    ]);
  });
  it.each(['owner', 'manager'])('lets a %s add a fully missed day for the selected employee', role => {
    state.role = role; setup();
    fireEvent.change(screen.getByLabelText('Date to correct'), { target: { value: '2026-08-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add clock-in/out' }));
    expect(state.query).toHaveBeenCalledWith('target-employee', { start: '2026-08-01', end: '2026-08-01' });
    expect(state.editor).toHaveBeenCalledWith(expect.objectContaining({ entryId: null, employeeId: 'target-employee', entryDate: '2026-08-01', allowScheduleQuickFixes: false }));
  });
  it('reuses an existing entry and includes voided punches in the editor history', () => {
    const existing = entry('2026-09-14', '13:00', '12:00');
    state.query.mockReturnValue({ data: [existing], isSuccess: true }); setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit punches for 2026-09-14' }));
    expect(state.editor).toHaveBeenCalledWith(expect.objectContaining({ entryId: existing.id, punches: expect.arrayContaining(existing.punches) }));
  });
  it('opens the selected employee and date audit trail', () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'View audit trail for 2026-09-14' }));
    expect(state.audit).toHaveBeenCalledWith(expect.objectContaining({ employeeId: 'target-employee', entryDate: '2026-09-14' }));
  });
  it('does not treat a failed day lookup as an empty day', () => {
    state.query.mockReturnValue({ isSuccess: false, isError: true }); setup();
    fireEvent.click(screen.getByRole('button', { name: 'Edit punches for 2026-09-14' }));
    expect(within(screen.getByRole('dialog')).getByRole('alert')).toHaveTextContent('Could not load');
    expect(state.editor).not.toHaveBeenCalled();
  });
  it('does not expose manager controls to an employee', () => {
    state.role = 'employee'; setup(); expect(screen.queryByRole('button')).toBeNull();
  });
});
