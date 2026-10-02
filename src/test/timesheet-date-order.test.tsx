import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Timesheet from '@/pages/Timesheet';
import type { PunchRow, TimeEntryRow } from '@/hooks/useTimeEntries';
import { formatDate } from '@/lib/time-utils';

const exported = vi.hoisted(() => ({ rows: vi.fn((_rows: { Date: string }[]) => ({})), writeFile: vi.fn() }));
const dates = ['2026-10-02', '2026-09-30', '2026-09-29', '2026-09-28'];
const entry = (date: string, incomplete = false): TimeEntryRow => {
  const punches: PunchRow[] = (incomplete ? ['in'] : ['in', 'out']).map((type, seq) => ({
    id: `${date}-${seq}`, time_entry_id: date, seq, punch_type: type as 'in' | 'out',
    punch_time: `${date}T${seq === 0 ? '13' : '21'}:00:00Z`, source: 'manual', raw_text: null,
    created_at: '', low_confidence: false, location_lat: null, location_lng: null, is_edited: false,
    original_punch_time: null, edited_at: null, edited_by: null, voided_at: null, voided_by: null, void_reason: null,
  }));
  return {
    id: date, user_id: 'user', employee_id: 'employee', entry_date: date, total_minutes: incomplete ? 0 : 480,
    source: 'manual', notes: null, created_at: '', updated_at: '', is_remote: false,
    location_status: 'onsite', entry_comment: null, punches, all_punches: punches,
  };
};
// The screenshot's mixed statuses, deliberately supplied out of date order.
const entries = [entry(dates[3]), entry(dates[0], true), entry(dates[1], true), entry(dates[2])];
const tardies = [dates[3], dates[1]].map(date => ({
  id: `late-${date}`, user_id: 'user', entry_date: date, minutes_late: 19,
  approval_status: 'unreviewed', resolved: false, timezone_suspect: false,
  acknowledged_at: null, excuse_requested_at: null,
}));

vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'user' } }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: 'employee', employee_id: 'employee' } }) }));
vi.mock('@/hooks/useTimeEntries', () => ({ useTimeEntries: () => ({ data: entries, isLoading: false }), useUpdateEntry: () => ({ mutateAsync: vi.fn() }) }));
vi.mock('@/hooks/useTardies', () => ({ useTardies: () => ({ data: tardies }) }));
vi.mock('@/hooks/useMissingShifts', () => ({ useMissingShifts: () => [] }));
vi.mock('@/hooks/usePayrollSettings', () => ({ usePayrollSettings: () => ({ data: { week_start_day: 0 } }) }));
vi.mock('@/components/LateArrivalPrompt', () => ({ LateArrivalPrompt: () => null }));
vi.mock('@/components/PunchEditorModal', () => ({ PunchEditorModal: () => null }));
vi.mock('@/components/AuditHistoryModal', () => ({ AuditHistoryModal: () => null }));
vi.mock('@/components/CorrectionRequestModal', () => ({ CorrectionRequestModal: () => null }));
vi.mock('xlsx', () => ({ utils: { json_to_sheet: exported.rows, book_new: () => ({}), book_append_sheet: vi.fn() }, writeFile: exported.writeFile }));

const displayedDates = () => within(screen.getByRole('table')).getAllByRole('row')
  .slice(1).map(row => within(row).getAllByRole('cell')[1].textContent);
const mount = () => render(<MemoryRouter><Timesheet /></MemoryRouter>);
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('timesheet date order', () => {
  it('keeps newer completed days above older late days, regardless of attention status', () => {
    mount();
    expect(displayedDates()).toEqual(dates.map(formatDate));
    expect(screen.queryByRole('button', { name: 'Attention First' })).not.toBeInTheDocument();
  });

  it('lists late arrivals waiting on an answer newest first', () => {
    mount();
    const notice = screen.getByRole('region', { name: 'Late arrivals waiting on your answer' });
    expect(within(notice).getAllByRole('listitem').map(row => row.textContent))
      .toEqual([dates[1], dates[3]].map(date => `${formatDate(date)} · 19 min lateAnswer`));
  });

  it('exports newest first without changing the table order when it renders again', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Export Excel' }));
    await waitFor(() => expect(exported.writeFile).toHaveBeenCalled());
    expect(exported.rows.mock.calls[0][0].map((row: { Date: string }) => row.Date)).toEqual(dates);
    // Force a parent render after export; sorting the export must not mutate UI state.
    fireEvent.change(screen.getAllByDisplayValue(/2026-/)[0], { target: { value: '2026-09-01' } });
    expect(displayedDates()).toEqual(dates.map(formatDate));
  });
});
