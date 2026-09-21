/**
 * Today's Team on the Management hub: a late arrival still counts as in,
 * names read Last, First, everyone who needs attention is listed first, the
 * off-today crowd is folded, and every chip opens Team Attendance on that
 * person.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { OrgSnapshotPanel } from '@/components/OrgSnapshotPanel';
import { snapshotCounts, statusBucket } from '@/lib/team-snapshot';
import type { EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';

const person = (over: Partial<EmployeeSnapshot>): EmployeeSnapshot => ({
  employee_id: 'e', user_id: 'u', display_name: 'Doe, Jane', status_code: 'ok', is_late: false, is_absent: false,
  is_incomplete: false, has_punches: false, is_remote: false, minutes_late: 0, has_day_off: false, office_closed: false,
  is_scheduled_day: true, schedule_expected_start: '08:25:00', schedule_expected_end: '17:00:00', tardy_approval_status: null, ...over,
});

const today: EmployeeSnapshot[] = [
  person({ employee_id: 'megan', display_name: 'Megan Vincent', has_punches: true, is_late: true, minutes_late: 25 }),
  person({ employee_id: 'alize', display_name: 'Furtado, Alize A', is_absent: true }),
  person({ employee_id: 'jill', display_name: 'Craveiro, Jill', is_absent: true }),
  person({ employee_id: 'sam', display_name: 'Sam Ortiz', has_punches: true }),
  ...['Barbosa, Jen L', 'Bizarro, Lucia', 'Dore, Karen J'].map((n, i) => person({ employee_id: `u${i}`, display_name: n, is_scheduled_day: false })),
];

vi.mock('@/hooks/useOrgAttendanceSnapshot', () => ({ useOrgAttendanceSnapshot: () => ({ data: today, isLoading: false }) }));

afterEach(cleanup);

describe('statusBucket and snapshotCounts', () => {
  it('a late arrival is in, and in the late count too', () => {
    expect(statusBucket(today[0])).toBe('late');
    expect(snapshotCounts(today)).toEqual({ total: 7, in: 2, late: 1, notIn: 2 });
  });

  it('scheduled with no punches is "not in yet" until the engine marks it absent', () => {
    expect(statusBucket(person({}))).toBe('not_started');
    expect(statusBucket(person({ is_absent: true }))).toBe('absent');
    expect(statusBucket(person({ has_punches: true, is_incomplete: true }))).toBe('incomplete');
  });
});

describe('OrgSnapshotPanel', () => {
  it('counts a clocked-in late arrival as in, reads names one way, and folds the off-today crowd', () => {
    render(<MemoryRouter><OrgSnapshotPanel /></MemoryRouter>);
    const chip = (label: string) => screen.getByText(label, { selector: 'p.uppercase' }).parentElement!;
    expect(chip('In')).toHaveTextContent('2In');
    expect(chip('Late')).toHaveTextContent('1Late');
    expect(chip('Not in')).toHaveTextContent('2Not in');
    expect(screen.getByRole('link', { name: /Furtado, Alize A/ })).toHaveAttribute('href', '/management/attendance?employee=alize');
    expect(screen.getByRole('link', { name: /Vincent, Megan \+25m/ })).toHaveAttribute('href', '/management/attendance?employee=megan');
    // Not-scheduled names stay folded until asked for.
    expect(screen.queryByRole('link', { name: 'Barbosa, Jen L' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Off today \(3\)/ }));
    expect(screen.getByRole('link', { name: 'Barbosa, Jen L' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Team Attendance →' })).toHaveAttribute('href', '/management/attendance');
  });
});
