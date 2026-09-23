/**
 * A tardy belongs to one person on one day. The payroll report used to key
 * tardies by date alone, so one person's late arrival was printed on every
 * employee's row for that date.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Reports from '@/pages/Reports';

const punch = (entryId: string, id: string, seq: number, punch_type: 'in' | 'out', punch_time: string) => ({
  id, time_entry_id: entryId, seq, punch_type, punch_time, source: 'import', raw_text: null, created_at: '',
  low_confidence: false, location_lat: null, location_lng: null, is_edited: false, original_punch_time: null,
  edited_at: null, edited_by: null, voided_at: null, voided_by: null, void_reason: null,
});
const entry = (id: string, employee_id: string, user_id: string | null, inIso: string, outIso: string) => {
  const punches = [punch(id, `${id}-in`, 0, 'in', inIso), punch(id, `${id}-out`, 1, 'out', outIso)];
  return {
    id, user_id, employee_id, entry_date: '2026-09-17', total_minutes: 540, source: 'import',
    notes: null, created_at: '', updated_at: '', is_remote: false, location_status: 'onsite', entry_comment: null, punches, all_punches: punches,
  };
};
// Lucia (no login) arrived at 8:13; Jill arrived at 9:34, 29 minutes late.
const entries = [
  entry('entry-lucia', 'emp-lucia', null, '2026-09-17T12:13:00Z', '2026-09-17T21:18:00Z'),
  entry('entry-jill', 'emp-jill', 'user-jill', '2026-09-17T13:34:00Z', '2026-09-17T21:00:00Z'),
];
const tardies = [{
  id: 'tardy-jill', user_id: 'user-jill', employee_id: 'emp-jill', time_entry_id: 'entry-jill', entry_date: '2026-09-17',
  expected_start_time: '09:00:00', actual_start_time: '2026-09-17T13:34:00Z', minutes_late: 29, reason_text: null,
  approval_status: 'unreviewed', approved_by: null, approved_at: null, resolved: false, timezone_suspect: false, created_at: '', updated_at: '',
}];

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'manager-login' } }) }));
vi.mock('@/hooks/usePayrollSettings', () => ({ usePayrollSettings: () => ({ data: { week_start_day: 1 } }) }));
vi.mock('@/hooks/useTimeEntries', () => ({ useTimeEntries: () => ({ data: entries }) }));
vi.mock('@/hooks/useDaysOff', () => ({ useDaysOff: () => ({ data: [] }) }));
vi.mock('@/hooks/useTardies', () => ({ useTardies: () => ({ data: tardies }) }));
vi.mock('@/hooks/useAttendanceExceptions', () => ({ useAttendanceExceptions: () => ({ data: [] }) }));
vi.mock('@/hooks/useAttendanceDayStatus', () => ({ useAttendanceDayStatus: () => ({ data: [] }) }));
vi.mock('@/hooks/useWorkedHourAdjustments', () => ({ useWorkedHourAdjustments: () => ({ data: [] }) }));
vi.mock('@/hooks/useEmployees', () => ({ useOrgEmployees: () => ({ data: [] }) }));
vi.mock('@/hooks/useOrgAttendanceSnapshot', () => ({ useOwnerUserIds: () => ({ data: new Set() }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'office', employee_id: 'emp-manager', user_id: 'manager-login', role: 'manager', org_name: 'Office' } }) }));
vi.mock('@/hooks/useOrgBranding', () => ({ useOrgBranding: () => ({ data: { displayName: 'Northfield Dental Group', legalName: 'Northfield Dental Group, LLC', logoUrl: '', brandColor: '#53406e', brandTint: '#f3f0f8' } }) }));
vi.mock('@/hooks/useStaffCodes', () => ({
  useOrgStaff: () => ({ data: [
    { employeeId: 'emp-lucia', userId: null, displayName: 'Bizarro, Lucia', code: 'HY10', employmentStatus: 'active', membershipStatus: 'pending', kind: 'active', isActiveActor: true },
    { employeeId: 'emp-jill', userId: 'user-jill', displayName: 'Craveiro, Jill', code: 'HY03', employmentStatus: 'active', membershipStatus: 'active', kind: 'active', isActiveActor: true },
  ] }),
}));
vi.mock('@/components/accountability/AccountabilityHistory', () => ({ default: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => { const q = { select: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }) }; return q; } },
}));

afterEach(cleanup);

describe('payroll report tardies', () => {
  it("marks only the person who was late; a colleague's same-day row stays clean", () => {
    render(<MemoryRouter><Reports /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
    // Once on screen and once on the printed sheet, both for Jill. Keyed by
    // date alone, Lucia's row carried it too and there were four.
    expect(screen.getAllByText('29m late')).toHaveLength(2);
    expect(screen.getAllByText(/Bizarro, Lucia/).length).toBeGreaterThan(0);
  });
});
