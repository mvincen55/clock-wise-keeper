/**
 * The payroll (timesheet) report prints what payroll needs to see: every
 * clock-in and clock-out of each day with the breaks between them, and the
 * worked-hour adjustments dated in the range — listed with their reason
 * and counted in the employee's total, the weekly total, and the report
 * total. Printing is the generated card, so what renders here prints.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Reports from '@/pages/Reports';

const state = vi.hoisted(() => ({ adjustments: [] as Record<string, unknown>[] }));

const punch = (id: string, seq: number, punch_type: 'in' | 'out', punch_time: string) => ({
  id, time_entry_id: 'entry-1', seq, punch_type, punch_time, source: 'manual', raw_text: null, created_at: '',
  low_confidence: false, location_lat: null, location_lng: null, is_edited: false, original_punch_time: null,
  edited_at: null, edited_by: null, voided_at: null, voided_by: null, void_reason: null,
});
// 8:29 AM – 12:01 PM, lunch, 12:31 PM – 6:27 PM Eastern: 212 + 356 = 568 minutes.
const punches = [
  punch('p1', 0, 'in', '2026-09-14T12:29:00Z'), punch('p2', 1, 'out', '2026-09-14T16:01:00Z'),
  punch('p3', 2, 'in', '2026-09-14T16:31:00Z'), punch('p4', 3, 'out', '2026-09-14T22:27:00Z'),
];
const entries = [{
  id: 'entry-1', user_id: 'user-a', employee_id: 'emp-a', entry_date: '2026-09-14', total_minutes: 568, source: 'manual',
  notes: null, created_at: '', updated_at: '', is_remote: false, location_status: 'onsite', entry_comment: null, punches, all_punches: punches,
}];

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user-a' } }) }));
vi.mock('@/hooks/usePayrollSettings', () => ({ usePayrollSettings: () => ({ data: { week_start_day: 1 } }) }));
vi.mock('@/hooks/useTimeEntries', () => ({ useTimeEntries: () => ({ data: entries }) }));
vi.mock('@/hooks/useDaysOff', () => ({ useDaysOff: () => ({ data: [] }) }));
vi.mock('@/hooks/useTardies', () => ({ useTardies: () => ({ data: [] }) }));
vi.mock('@/hooks/useAttendanceExceptions', () => ({ useAttendanceExceptions: () => ({ data: [] }) }));
vi.mock('@/hooks/useAttendanceDayStatus', () => ({ useAttendanceDayStatus: () => ({ data: [] }) }));
vi.mock('@/hooks/useWorkedHourAdjustments', () => ({ useWorkedHourAdjustments: () => ({ data: state.adjustments }) }));
vi.mock('@/hooks/useEmployees', () => ({ useOrgEmployees: () => ({ data: [] }) }));
vi.mock('@/hooks/useOrgAttendanceSnapshot', () => ({ useOwnerUserIds: () => ({ data: new Set() }) }));
vi.mock('@/hooks/useStaffCodes', () => ({
  useOrgStaff: () => ({ data: [{ employeeId: 'emp-a', userId: 'user-a', displayName: 'Doe, Jane', code: 'JD01', employmentStatus: 'active', membershipStatus: 'active', kind: 'active', isActiveActor: true }] }),
}));
vi.mock('@/components/accountability/AccountabilityHistory', () => ({ default: () => null }));
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: () => { const q = { select: () => q, gte: () => q, lte: () => q, order: () => q, limit: () => Promise.resolve({ data: [] }) }; return q; } },
}));

function generate() {
  render(<MemoryRouter><Reports /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Generate' }));
}

afterEach(() => { cleanup(); state.adjustments = []; });

describe('payroll report', () => {
  it('lists every clock-in and clock-out of the day with the break between them', () => {
    generate();
    for (const time of ['08:29 AM', '12:01 PM', '12:31 PM', '06:27 PM']) {
      expect(screen.getByText(time)).toBeInTheDocument();
    }
    expect(screen.getByText('30m break')).toBeInTheDocument();
    expect(screen.queryByText('HOURS ADJUSTMENT')).toBeNull();
    // Recorded time alone: 568 minutes.
    expect(screen.getAllByText('09:28').length).toBeGreaterThanOrEqual(3);
  });

  it('prints an hour adjustment with its reason and counts it in every total', () => {
    state.adjustments = [{
      id: 'adj-1', org_id: 'office', employee_id: 'emp-a', entry_date: '2026-09-19', hours_delta: -7.28,
      reason: 'Scheduled installment 2 of 2: remaining 7.28 hours of the 14.57 excess estimated hours paid for August 30–September 5.',
      entered_by: 'user-a', created_at: '',
    }];
    generate();
    expect(screen.getByText('HOURS ADJUSTMENT')).toBeInTheDocument();
    expect(screen.getByText(/Scheduled installment 2 of 2/)).toBeInTheDocument();
    // The row itself, and the weekly total's note.
    expect(screen.getAllByText(/-7\.28h/).length).toBeGreaterThanOrEqual(2);
    // 568 recorded − 437 adjusted = 131 minutes, in the summary, the
    // employee's group, the weekly total, and the footer.
    expect(screen.getAllByText('02:11').length).toBeGreaterThanOrEqual(4);
    expect(screen.getByText('09:28 recorded − 07:17 adjustments')).toBeInTheDocument();
    // It sits under the employee's staff code (group header and weekly
    // total), dated where it is paid.
    expect(screen.getAllByText('JD01').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Sat, Sep 19, 2026')).toBeInTheDocument();
  });
});
