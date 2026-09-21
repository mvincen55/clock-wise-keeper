/**
 * The pencil on an attendance row edits THAT row's employee and day: the
 * editor opens for the row's person, with the row's own shift for its
 * quick fixes — never the signed-in manager's timesheet or schedule.
 * Employees get no menu at all: every action here is a manager-only
 * record change.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AttendanceActions } from '@/components/AttendanceActions';
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';

const state = vi.hoisted(() => ({
  role: 'manager' as string,
  editor: [] as Record<string, unknown>[],
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'manager-login' } }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'office', employee_id: 'manager-emp', role: state.role } }) }));
vi.mock('@/hooks/useDaysOff', () => ({ useAddDayOff: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('@/hooks/useOfficeClosures', () => ({ useAddClosure: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock('@/hooks/useAttendanceExceptions', () => ({ useCreateException: () => ({ mutateAsync: vi.fn() }), useResolveException: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/useAttendanceDayStatus', () => ({ useRecomputeAttendance: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/PunchEditorModal', () => ({
  PunchEditorModal: (props: Record<string, unknown>) => {
    state.editor.push(props);
    return props.open ? <div>Editor for {String(props.employeeName)} on {String(props.entryDate)}</div> : null;
  },
}));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const rows: Record<string, unknown[]> = {
        employees: [{ id: 'emp-rick', display_name: 'Roe, Rick' }],
        time_entries: [{ id: 'entry-rick-0921' }],
        punches: [{ id: 'p1', punch_type: 'in', punch_time: '2026-09-21T12:50:00Z', seq: 0, source: 'manual', voided_at: null }],
      };
      const q = {
        select: () => q, eq: () => q, limit: () => q, order: () => q,
        maybeSingle: () => Promise.resolve({ data: rows[table]?.[0] ?? null, error: null }),
        then: (resolve: (v: unknown) => void) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(resolve),
      };
      return q;
    },
  },
}));

const row: AttendanceDayStatusRow = {
  id: 'row-1', user_id: 'rick-login', employee_id: 'emp-rick', entry_date: '2026-09-21',
  schedule_expected_start: '08:25:00', schedule_expected_end: '17:00:00', is_scheduled_day: true,
  office_closed: false, has_punches: true, is_remote: false, is_absent: false, is_incomplete: true,
  is_late: true, minutes_late: 25, tardy_approval_status: 'unreviewed', has_edits: false,
  has_day_comment: false, has_day_off: false, timezone_suspect: false, status_code: 'incomplete',
  status_reasons: {}, recompute_version: 1, computed_at: '2026-09-21T22:00:00Z',
};

afterEach(() => { cleanup(); state.role = 'manager'; state.editor = []; });

describe('AttendanceActions', () => {
  it("the pencil opens the punch editor for the row's employee, with the row's shift for quick fixes", async () => {
    render(<AttendanceActions row={row} alwaysShow editButton employeeName="Rick Roe" />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit punches' }));
    await screen.findByText('Editor for Rick Roe on 2026-09-21');
    const opened = state.editor.find(p => p.open)!;
    expect(opened.employeeId).toBe('emp-rick');
    expect(opened.entryId).toBe('entry-rick-0921');
    expect(opened.scheduleWindow).toEqual({ start_time: '08:25:00', end_time: '17:00:00' });
    expect((opened.punches as unknown[]).length).toBe(1);
  });

  it('looks the name up from the roster when the caller does not know it, surname first', async () => {
    render(<AttendanceActions row={row} alwaysShow editButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit punches' }));
    await screen.findByText('Editor for Roe, Rick on 2026-09-21');
  });

  it('an unscheduled day hands the editor no shift, so quick fixes cannot invent one', async () => {
    render(<AttendanceActions row={{ ...row, is_scheduled_day: false, is_absent: true, has_punches: false }} alwaysShow editButton employeeName="Rick Roe" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add punches' }));
    await screen.findByText('Editor for Rick Roe on 2026-09-21');
    expect(state.editor.find(p => p.open)!.scheduleWindow).toBeNull();
  });

  it('renders nothing for an employee — no dead-end actions', () => {
    state.role = 'employee';
    const { container } = render(<AttendanceActions row={row} alwaysShow editButton employeeName="Rick Roe" />);
    expect(container.innerHTML).toBe('');
  });
});
