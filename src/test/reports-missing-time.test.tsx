/**
 * The payroll report's missing-time banner names what payroll cannot send:
 * a scheduled day with no punches, or a day whose punches do not pair. A
 * day the office already recorded as a callout or time off is explained,
 * not missing — the attendance engine marks a callout absent for
 * attendance, and the report must not chase it. Each flag is a link to
 * that person's day on Team Attendance, where the fix is made.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Reports from '@/pages/Reports';

const state = vi.hoisted(() => ({
  status: [] as Record<string, unknown>[],
  entries: [] as Record<string, unknown>[],
}));

/** One attendance_day_status row: Jill, scheduled on Mon Sep 21, no punches. */
const day = (over: Record<string, unknown> = {}) => ({
  id: 'st-1', user_id: 'user-jill', employee_id: 'emp-jill', entry_date: '2026-09-21',
  schedule_expected_start: '09:45:00', schedule_expected_end: '13:45:00', is_scheduled_day: true, office_closed: false,
  has_punches: false, is_remote: false, is_absent: true, is_incomplete: false, is_late: false, minutes_late: 0,
  tardy_approval_status: 'unreviewed', has_edits: false, has_day_comment: false, has_day_off: false, timezone_suspect: false,
  status_code: 'absent', status_reasons: {}, recompute_version: 5, computed_at: '', ...over,
});

const punch = (id: string, seq: number, punch_type: 'in' | 'out', punch_time: string) => ({
  id, time_entry_id: 'entry-1', seq, punch_type, punch_time, source: 'manual', raw_text: null, created_at: '',
  low_confidence: false, location_lat: null, location_lng: null, is_edited: false, original_punch_time: null,
  edited_at: null, edited_by: null, voided_at: null, voided_by: null, void_reason: null,
});

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/hooks/usePayrollSettings', () => ({ usePayrollSettings: () => ({ data: { week_start_day: 0 } }) }));
vi.mock('@/hooks/useTimeEntries', () => ({ useTimeEntries: () => ({ data: state.entries }) }));
vi.mock('@/hooks/useDaysOff', () => ({ useDaysOff: () => ({ data: [] }) }));
vi.mock('@/hooks/useTardies', () => ({ useTardies: () => ({ data: [] }) }));
vi.mock('@/hooks/useAttendanceExceptions', () => ({ useAttendanceExceptions: () => ({ data: [] }) }));
vi.mock('@/hooks/useAttendanceDayStatus', () => ({ useAttendanceDayStatus: () => ({ data: state.status }) }));
vi.mock('@/hooks/useWorkedHourAdjustments', () => ({ useWorkedHourAdjustments: () => ({ data: [] }) }));
vi.mock('@/hooks/useEmployees', () => ({ useOrgEmployees: () => ({ data: [] }) }));
vi.mock('@/hooks/useOrgAttendanceSnapshot', () => ({ useOwnerUserIds: () => ({ data: new Set() }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'office', employee_id: 'emp-a', user_id: 'user-a', role: 'manager', org_name: 'Office' } }) }));
vi.mock('@/hooks/useOrgBranding', () => ({ useOrgBranding: () => ({ data: { displayName: 'Northfield Dental Group', legalName: 'Northfield Dental Group, LLC', logoUrl: '', brandColor: '#53406e', brandTint: '#f3f0f8' } }) }));
vi.mock('@/hooks/useStaffCodes', () => ({
  useOrgStaff: () => ({ data: [
    { employeeId: 'emp-a', userId: 'user-a', displayName: 'Doe, Jane', code: 'JD01', employmentStatus: 'active', membershipStatus: 'active', kind: 'active', isActiveActor: true },
    { employeeId: 'emp-jill', userId: 'user-jill', displayName: 'Jill Craveiro', code: 'AA15', employmentStatus: 'active', membershipStatus: 'active', kind: 'active', isActiveActor: true },
  ] }),
}));
vi.mock('@/components/accountability/AccountabilityHistory', () => ({ default: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => { const q = { select: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }) }; return q; } },
}));

function generate() {
  render(<MemoryRouter><Reports /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
}

afterEach(() => { cleanup(); state.status = []; state.entries = []; });

describe('payroll report missing-time flags', () => {
  it('does not flag a day the office recorded as a callout or time off', () => {
    // The engine keeps a callout (days_off type "unscheduled") absent for
    // attendance; payroll has nothing to chase, so no banner.
    state.status = [day({ has_day_off: true })];
    generate();
    expect(screen.queryByText(/missing or incomplete time/)).toBeNull();
    expect(screen.queryByText('MISSING DAY')).toBeNull();
  });

  it('flags an unexplained scheduled day and links it to that person on Team Attendance', () => {
    state.status = [day()];
    generate();
    expect(screen.getByText('1 employee has missing or incomplete time')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /Craveiro, Jill · AA15/ });
    expect(link).toHaveAttribute('href', '/management/attendance?employee=emp-jill&date=2026-09-21');
    expect(link.textContent).toContain('MISSING DAY');
    expect(link.textContent).toContain('Mon, Sep 21, 2026');
  });

  it('links a day with an unpaired punch the same way', () => {
    const punches = [punch('p1', 0, 'in', '2026-09-21T12:29:00Z')];
    state.entries = [{
      id: 'entry-1', user_id: 'user-a', employee_id: 'emp-a', entry_date: '2026-09-21', total_minutes: 0, source: 'manual',
      notes: null, created_at: '', updated_at: '', is_remote: false, location_status: 'onsite', entry_comment: null, punches, all_punches: punches,
    }];
    generate();
    const link = screen.getByRole('link', { name: /Doe, Jane · JD01/ });
    expect(link).toHaveAttribute('href', '/management/attendance?employee=emp-a&date=2026-09-21');
    expect(link.textContent).toContain('MISSING PUNCH');
  });
});
