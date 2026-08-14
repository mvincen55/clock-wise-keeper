/**
 * Server-authoritative punching: the clock action is a single RPC.
 *
 * Guards the Phase 1 contract (Time Clock Legitimacy Hardening):
 *  - useClockAction sends nothing but the action — no client timestamp,
 *    no entry creation, no seq computation, no client-side audit insert.
 *  - Alternation rejections surface as person-readable toasts, not raw
 *    Postgres errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect } from 'react';

const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const fromCalls: string[] = [];
let rpcResult: { data: unknown; error: { message: string } | null } = { data: null, error: null };

const toastError = vi.fn();

vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/hooks/useOrgContext', () => ({
  useOrgContext: () => ({ data: { org_id: 'org-1', employee_id: 'emp-1' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return Promise.resolve(rpcResult);
    },
    // The clock path must never write tables directly anymore. Any
    // .from() during a clock action is a regression to client-side
    // punching — fail loudly.
    from: (table: string) => {
      fromCalls.push(table);
      throw new Error(`useClockAction must not touch table "${table}" directly`);
    },
  },
}));

import { useClockAction, friendlyPunchError } from '@/hooks/useTimeEntries';

function ClockOnce({
  action,
  onSettled,
}: {
  action: 'clock_in' | 'clock_out';
  onSettled: (outcome: 'ok' | 'err') => void;
}) {
  const clockAction = useClockAction();
  useEffect(() => {
    clockAction.mutate(action, {
      onSuccess: () => onSettled('ok'),
      onError: () => onSettled('err'),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function renderClock(action: 'clock_in' | 'clock_out') {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const outcomes: ('ok' | 'err')[] = [];
  render(
    <QueryClientProvider client={qc}>
      <ClockOnce action={action} onSettled={o => outcomes.push(o)} />
    </QueryClientProvider>,
  );
  return outcomes;
}

beforeEach(() => {
  rpcCalls.length = 0;
  fromCalls.length = 0;
  toastError.mockClear();
  rpcResult = { data: null, error: null };
});

describe('useClockAction (server-authoritative)', () => {
  it('clocks in via the record_punch RPC and sends only the action', async () => {
    rpcResult = {
      data: { entry_id: 'e1', punch_id: 'p1', seq: 0, punch_time: '2026-08-14T14:00:00+00:00' },
      error: null,
    };
    const outcomes = renderClock('clock_in');

    await waitFor(() => expect(outcomes).toEqual(['ok']));
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].fn).toBe('record_punch');
    // The client contributes no timestamp, no seq, no entry id — the
    // server owns time. p_action must be the ONLY argument.
    expect(Object.keys(rpcCalls[0].args)).toEqual(['p_action']);
    expect(rpcCalls[0].args.p_action).toBe('clock_in');
    expect(fromCalls).toEqual([]);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('passes clock_out through as p_action', async () => {
    rpcResult = {
      data: { entry_id: 'e1', punch_id: 'p2', seq: 1, punch_time: '2026-08-14T22:00:00+00:00' },
      error: null,
    };
    const outcomes = renderClock('clock_out');

    await waitFor(() => expect(outcomes).toEqual(['ok']));
    expect(rpcCalls[0].args.p_action).toBe('clock_out');
    expect(fromCalls).toEqual([]);
  });

  it('surfaces a double clock-in as a clear toast, not a raw error', async () => {
    rpcResult = { data: null, error: { message: 'PUNCH_ALREADY_IN: already clocked in' } };
    const outcomes = renderClock('clock_in');

    await waitFor(() => expect(outcomes).toEqual(['err']));
    expect(toastError).toHaveBeenCalledWith("You're already clocked in.");
  });

  it('surfaces an out-with-nothing-open as a clear toast', async () => {
    rpcResult = { data: null, error: { message: 'PUNCH_NO_OPEN_IN: no open clock-in to close' } };
    const outcomes = renderClock('clock_out');

    await waitFor(() => expect(outcomes).toEqual(['err']));
    expect(toastError).toHaveBeenCalledWith('No open clock-in to close.');
  });

  it('falls back to a generic toast for unexpected failures', async () => {
    rpcResult = { data: null, error: { message: 'connection reset' } };
    const outcomes = renderClock('clock_in');

    await waitFor(() => expect(outcomes).toEqual(['err']));
    expect(toastError).toHaveBeenCalledWith('Clock action failed. Please try again.');
  });
});

describe('friendlyPunchError', () => {
  it('maps every structured rejection the RPC can raise', () => {
    expect(friendlyPunchError('PUNCH_ALREADY_IN: already clocked in')).toBe("You're already clocked in.");
    expect(friendlyPunchError('PUNCH_NO_OPEN_IN: no open clock-in to close')).toBe('No open clock-in to close.');
    expect(friendlyPunchError('PUNCH_NO_EMPLOYEE: no employee record for this account')).toBe(
      'No employee record is linked to your account.',
    );
    expect(friendlyPunchError('PUNCH_UNLINKED_EMPLOYEE: employee has no linked account')).toBe(
      'No employee record is linked to your account.',
    );
  });

  it('returns null for anything unstructured so callers show the generic copy', () => {
    expect(friendlyPunchError('TypeError: fetch failed')).toBeNull();
    expect(friendlyPunchError('')).toBeNull();
  });
});
