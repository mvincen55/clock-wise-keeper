import { render, screen, fireEvent, waitFor, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FillSchedule from '@/pages/FillSchedule';
import type { Campaign, Ledger } from '@/lib/fill-the-schedule';

const state = vi.hoisted(() => ({ manager: false, data: null as Ledger | null, write: vi.fn(), employee: 'staff' }));
vi.mock('@/hooks/useFillSchedule', () => ({
  useFillSchedule: () => ({ data: state.data, ctx: { employee_id: state.employee, org_id: 'org' }, manager: state.manager, isLoading: false, error: null, contextLoading: false, contextError: null, refetch: vi.fn() }),
  useFillScheduleWrite: () => ({ write: state.write, busy: false, error: '', message: '' }),
}));
const campaign: Campaign = { id: 'campaign', org_id: 'org', name: 'Fill the Schedule', starts_on: '2026-10-01', ends_on: '2026-12-31', timezone: 'America/New_York', status: 'active',
  pts_qr_card: 1, pts_unscheduled_booking: 1, pts_operative_handoff: 2, pts_chairside_card: null, pts_call: 1, pts_huddle: 1,
  pts_review_doctor: 3, pts_review_hygienist: 3, pts_review_clerical: 5, pts_review_assistant: 7, pts_attend_bonus: 2, pts_prepay_bonus: 2,
  prize_tier1_points: 20, prize_tier2_points: 30, clerical_min_calls: 10, open_hours_goal: 5, grand_prize_dollars: 100 };
function fixture(): Ledger {
  return { campaign, participants: [{ id: 'p1', employee_id: 'staff', scoring_role: 'assistant', active: true }, { id: 'p2', employee_id: 'other', scoring_role: null, active: true }],
    names: [{ id: 'staff', display_name: 'Test Assistant', employment_status: 'active' }, { id: 'other', display_name: 'Test Teammate', employment_status: 'active' }],
    activities: [{ id: 'booking', entry_code: 'BOOK1234', employee_id: 'staff', activity_type: 'unscheduled_booking', occurred_at: '2026-10-02T14:00:00Z', tally_week: '2026-10-02', quantity: 1, status: 'pending', awarded_points: null, parent_id: null, reason_code: null }, { id: 'otherqr', entry_code: 'OTHER123', employee_id: 'other', activity_type: 'qr_card', occurred_at: '2026-10-02T14:00:00Z', tally_week: '2026-10-02', quantity: 1, status: 'approved', awarded_points: 1, parent_id: null, reason_code: null }],
    calls: [], huddles: [], metrics: [], picks: [], audit: [] };
}
const view = () => render(<MemoryRouter><FillSchedule /></MemoryRouter>);
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T15:00:00Z')); state.manager = false; state.employee = 'staff'; state.data = fixture(); state.write.mockReset().mockResolvedValue(true); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('campaign page workflows', () => {
  it('separates staff reporting from manager verification and never displays coworker records to staff', () => {
    view(); expect(screen.queryByRole('tab', { name: 'Manager verifies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Settings' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Tally ending'), { target: { value: '2026-10-02' } });
    expect(screen.getByText(/Entry BOOK1234/)).toBeInTheDocument(); expect(screen.queryByText(/OTHER123/)).not.toBeInTheDocument();
    expect(screen.getByText('Awaiting verification')).toBeInTheDocument(); expect(screen.getByText('Not recorded')).toBeInTheDocument();
    expect(screen.queryByLabelText(/patient/i)).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'Verify + approve' })).not.toBeInTheDocument();
  });
  it('offers an unambiguous one-click QR ask tally using its actual occurrence time', async () => {
    view(); vi.setSystemTime(new Date('2026-10-05T15:20:00Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 completed QR ask now' }));
    await waitFor(() => expect(state.write).toHaveBeenCalledWith('fts_record_own', { p_campaign_id: 'campaign', p_type: 'qr_card', p_occurred_at: '2026-10-05T15:20:00.000Z', p_quantity: 1 }, expect.any(String), true));
  });
  it('keeps the occurrence timestamp stable when retrying a failed QR write', async () => {
    state.write.mockResolvedValueOnce(false).mockResolvedValueOnce(true); view();
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 completed QR ask now' }));
    await waitFor(() => expect(state.write).toHaveBeenCalledTimes(1)); vi.setSystemTime(new Date('2026-10-05T15:21:00Z'));
    fireEvent.click(screen.getByRole('button', { name: 'Add 1 completed QR ask now' }));
    await waitFor(() => expect(state.write).toHaveBeenCalledTimes(2)); expect(state.write.mock.calls[0][1]).toEqual(state.write.mock.calls[1][1]);
  });
  it('lets managers approve scheduling and records huddles as a replaceable date checklist', async () => {
    state.manager = true; view(); fireEvent.click(screen.getByRole('tab', { name: 'Manager verifies' }));
    fireEvent.click(screen.getByRole('button', { name: 'Verify + approve' }));
    await waitFor(() => expect(state.write).toHaveBeenCalledWith('fts_verify', { p_activity_id: 'booking', p_approve: true }, expect.any(String)));
    const huddle = screen.getByRole('heading', { name: 'On time for huddle' }).closest('section')!;
    fireEvent.click(within(huddle).getByLabelText('Test Assistant')); fireEvent.click(within(huddle).getByRole('button', { name: 'Save huddle attendance' }));
    await waitFor(() => expect(state.write).toHaveBeenCalledWith('fts_save_huddle', { p_campaign_id: 'campaign', p_date: '2026-10-05', p_on_time: ['staff'] }, expect.any(String)));
  });
  it('shows unknown roles as ineligible, blocks chairside approval without a rate, and labels prize picks clearly', () => {
    state.manager = true; state.data!.activities.push({ ...state.data!.activities[0], id: 'card', entry_code: 'CARD1234', activity_type: 'chairside_card' });
    view(); fireEvent.click(screen.getByRole('tab', { name: 'Manager verifies' }));
    const card = screen.getByText(/Entry CARD1234/).closest('li')!;
    expect(within(card).getByRole('button', { name: 'Verify + approve' })).toBeDisabled();
    expect(screen.getByText('Set scoring group')).toBeInTheDocument(); expect(screen.getByText(/A prize pick means one item/)).toBeInTheDocument();
    expect(screen.queryByText(/pulls|\bu h f\b/i)).not.toBeInTheDocument();
  });
  it('shows every point rule including named-review role rates and huddles', () => {
    view(); fireEvent.click(screen.getByRole('tab', { name: 'Point rules' }));
    expect(screen.getByText(/Doctor 3/)).toBeInTheDocument(); expect(screen.getByText(/Hygienist 3/)).toBeInTheDocument();
    expect(screen.getByText(/Clerical 5/)).toBeInTheDocument(); expect(screen.getByText(/Assistant 7/)).toBeInTheDocument();
    expect(screen.getByText('1 per date')).toBeInTheDocument(); expect(screen.getByText(/Same-day MaxAssist note and phone code/)).toBeInTheDocument();
  });
});
