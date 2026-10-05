import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import FillSchedule from '@/pages/FillSchedule';
import type { Ledger } from '@/lib/fill-the-schedule';
import { fixture } from './fixtures/fill-schedule';
const state = vi.hoisted(() => ({ data: null as Ledger | null, manager: false, write: vi.fn() }));
vi.mock('@/hooks/useFillSchedule', () => ({
  useFillSchedule: () => ({ data: state.data, ctx: { employee_id: 'staff', org_id: 'org' }, manager: state.manager, isLoading: false, error: null, contextLoading: false, contextError: null, refetch: vi.fn() }),
  useFillScheduleWrite: () => ({ write: state.write, busy: false, error: '', message: '', resultRef: { current: null } }),
}));
const view = (hash = '') => render(<MemoryRouter initialEntries={[`/fill-the-schedule${hash}`]}><FillSchedule /></MemoryRouter>);
beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-10-05T15:00:00Z')); state.manager = false; state.data = fixture(); state.write.mockReset().mockResolvedValue(true); });
afterEach(() => { cleanup(); vi.useRealTimers(); });
describe('revised campaign workflow', () => {
  it('team has only two tabs, point rules stay available, coworker activity never appears, and the first tally is October 9', () => {
    view('#points'); expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Record', 'My points']);
    expect(screen.getByRole('button', { name: 'Point rules' })).toBeVisible(); expect(screen.queryByRole('button', { name: 'Campaign Settings' })).toBeNull();
    expect(screen.queryByText(/OTHER123/)).toBeNull(); expect(screen.getByLabelText('Tally ending')).toHaveValue('2026-10-09');
    expect(screen.queryByRole('option', { name: /October 2 ·/ })).toBeNull(); expect(screen.getByText('Reports awaiting verification')).toBeVisible();
    expect(screen.getByText('1 point if approved.')).toBeVisible();
  });
  it('QR click records the actual occurrence time and preserves it on an ambiguous retry', async () => {
    state.write.mockResolvedValueOnce(false).mockResolvedValueOnce(true); view();
    const ask = screen.getByRole('button', { name: /Asked for a review and handed out the QR card/ });
    vi.setSystemTime(new Date('2026-10-05T15:20:00Z')); fireEvent.click(ask); await waitFor(() => expect(state.write).toHaveBeenCalledTimes(1));
    vi.setSystemTime(new Date('2026-10-05T15:21:00Z')); fireEvent.click(ask); await waitFor(() => expect(state.write).toHaveBeenCalledTimes(2));
    expect(state.write.mock.calls[0][1]).toEqual(state.write.mock.calls[1][1]); expect(state.write.mock.calls[0][1].p_occurred_at).toBe('2026-10-05T15:20:00.000Z');
  });
  it('shows action points, keeps the chairside rate unset, and lists all rules in the drawer', () => {
    view(); expect(screen.getByText('Points not set yet')).toBeVisible(); expect(screen.getByText('2 points')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Point rules' }));
    expect(screen.getByText(/Doctor 3/)).toBeVisible(); expect(screen.getByText(/Hygienist 3/)).toBeVisible(); expect(screen.getByText(/Clerical 5/)).toBeVisible(); expect(screen.getByText(/Assistant 7/)).toBeVisible();
    expect(screen.getByText('1 per date')).toBeVisible(); expect(screen.getByText(/Same-day MaxAssist note and phone code/)).toBeVisible();
  });
  it('manager sees Review and Weekly scorecard, approves a pending entry, and awards a bonus directly on the origin', async () => {
    state.manager = true; state.data!.activities.push({ ...state.data!.activities[0], id: 'approved', entry_code: 'DONE1234', status: 'approved', awarded_points: 1 }); view();
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(['Review', 'Weekly scorecard']);
    fireEvent.click(screen.getByRole('button', { name: 'Verify booking · 1 point' })); await waitFor(() => expect(state.write).toHaveBeenCalledWith('fts_verify', { p_activity_id: 'booking', p_approve: true }, expect.any(String)));
    fireEvent.click(screen.getByRole('button', { name: 'Verify prepayment · +2' }));
    fireEvent.click(screen.getByLabelText(/I verified actual prepayment in the office records/)); fireEvent.click(screen.getByRole('button', { name: 'Confirm verified bonus' }));
    await waitFor(() => expect(state.write).toHaveBeenCalledWith('fts_award_bonus', expect.objectContaining({ p_parent_id: 'approved', p_type: 'prepay_bonus' }), expect.any(String), true));
    expect(screen.queryByLabelText('Original approved action')).toBeNull();
  });
  it('scorecard controls keep received picks disabled until close and manager huddles use a date checklist', async () => {
    state.manager = true; view('#scorecard'); const calls = screen.getByText('Documented calls').closest('li')!; expect(within(calls).getByText('0 of 0 clerical totals entered')).toBeVisible();
    expect(screen.getAllByRole('combobox').filter(c => c.getAttribute('aria-label')?.includes('received')).length).toBe(0);
    const huddles = screen.getByText('Huddles', { selector: 'p' }).closest('li')!; fireEvent.click(within(huddles).getByRole('button', { name: 'Review' }));
    const form = screen.getByRole('heading', { name: 'On time for huddle' }).closest('section')!; fireEvent.click(within(form).getByLabelText('Test Assistant')); fireEvent.click(within(form).getByRole('button', { name: 'Save huddle attendance' }));
    await waitFor(() => expect(state.write).toHaveBeenCalledWith('fts_save_huddle', { p_campaign_id: 'campaign', p_date: '2026-10-05', p_on_time: ['staff'] }, expect.any(String)));
    expect(screen.getByLabelText('Prize picks received by Test Assistant')).toBeDisabled();
  });
});
