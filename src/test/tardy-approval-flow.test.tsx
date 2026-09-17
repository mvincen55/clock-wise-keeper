import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const rpc = vi.hoisted(() => vi.fn(async () => ({ data: 'req-1', error: null })));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'login' } }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'office', employee_id: 'emp', user_id: 'login', role: 'employee' } }) }));

import { useRequestTardyApproval, useDecideTardyApprovalRequest, useReviewTardy } from '@/hooks/useTardyApprovalRequests';
import { TardyApprovalRequestModal } from '@/components/TardyApprovalRequestModal';

afterEach(() => { cleanup(); rpc.mockClear(); });

function wrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('tardy approval RPCs', () => {
  it('asks through request_tardy_approval with a trimmed reason', async () => {
    const { result } = renderHook(() => useRequestTardyApproval(), { wrapper: wrapper() });
    await result.current.mutateAsync({ tardyId: 't-1', reason: '  Bank run first  ' });
    expect(rpc).toHaveBeenCalledWith('request_tardy_approval', { p_tardy_id: 't-1', p_reason: 'Bank run first' });
  });

  it('decides through decide_tardy_approval_request, sending no note when blank', async () => {
    const { result } = renderHook(() => useDecideTardyApprovalRequest(), { wrapper: wrapper() });
    await result.current.mutateAsync({ id: 'r-1', approve: true, note: '  ' });
    expect(rpc).toHaveBeenCalledWith('decide_tardy_approval_request', { p_request_id: 'r-1', p_approve: true, p_note: undefined });
    await result.current.mutateAsync({ id: 'r-2', approve: false, note: 'Third time' });
    expect(rpc).toHaveBeenLastCalledWith('decide_tardy_approval_request', { p_request_id: 'r-2', p_approve: false, p_note: 'Third time' });
  });

  it('reviews straight from the tardy through review_tardy', async () => {
    const { result } = renderHook(() => useReviewTardy(), { wrapper: wrapper() });
    await result.current.mutateAsync({ tardyId: 't-1', status: 'unapproved', reason: 'Noted' });
    expect(rpc).toHaveBeenCalledWith('review_tardy', { p_tardy_id: 't-1', p_status: 'unapproved', p_reason: 'Noted' });
  });

  it('surfaces the database refusal', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'A request for this late arrival is already waiting on a manager' } } as never);
    const { result } = renderHook(() => useRequestTardyApproval(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync({ tardyId: 't-1', reason: 'Again' })).rejects.toMatchObject({ message: /already waiting/ });
  });
});

describe('TardyApprovalRequestModal', () => {
  const tardy = { entry_date: '2026-09-14', minutes_late: 84, expected_start_time: '09:00:00', actual_start_time: '2026-09-14T14:29:00.000Z' };

  it('explains the policy and only sends once a reason is written', async () => {
    const onSubmit = vi.fn(async () => {});
    render(<TardyApprovalRequestModal open tardy={tardy} onSubmit={onSubmit} onClose={() => {}} />);
    expect(screen.getByText('Request approval — Mon, Sep 14, 2026')).toBeTruthy();
    expect(screen.getByText(/84 minutes late \(Expected: 9:00 AM, Actual: 10:29 AM\)/)).toBeTruthy();
    const send = screen.getByRole('button', { name: 'Send to manager' }) as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('What happened? (required)'), { target: { value: '  Ran the deposit first ' } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Ran the deposit first'));
  });
});
