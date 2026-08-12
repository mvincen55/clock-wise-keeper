/**
 * The clock-out guard, exercised as the UI drives it.
 *
 * The regression this pins: going to lunch with open checklist items used to
 * open the end-of-day bypass dialog — and a confirm there recorded a bypass,
 * notified the manager and the doctor, and started escalation. A break must
 * write its punch and NOTHING else; only an explicit end of shift may consult
 * the checklist, and the bypass machinery runs only from that dialog.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createElement, type ReactNode } from 'react';
import { useGuardedClockAction } from '@/hooks/useGuardedClockAction';

const mutate = vi.fn();
let incompleteCount = 0;
let openSharedCount = 0;
const invoke = vi.fn(async () => ({ data: { recorded: true, escalation_level: 1 }, error: null }));
const toastInfo = vi.fn();
const toastWarning = vi.fn();

vi.mock('@/hooks/useTimeEntries', () => ({
  useClockAction: () => ({ mutate, isPending: false }),
}));

vi.mock('@/hooks/useChecklistGating', () => ({
  useChecklistGating: () => ({
    data: { incompleteCount, incompleteTitles: [], openSharedCount },
  }),
}));

vi.mock('@/hooks/useMessagingSettings', () => ({
  useMessagingSettings: () => ({ settings: { doctor_recipient_label: 'the doctor' } }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invoke(...(a as [])) } },
}));

vi.mock('sonner', () => ({
  toast: {
    info: (...a: unknown[]) => toastInfo(...(a as [])),
    warning: (...a: unknown[]) => toastWarning(...(a as [])),
  },
}));

function wrapper({ children }: { children: ReactNode }) {
  return createElement(QueryClientProvider, { client: new QueryClient() }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  incompleteCount = 0;
  openSharedCount = 0;
  invoke.mockResolvedValue({ data: { recorded: true, escalation_level: 1 }, error: null });
});

describe('starting a break', () => {
  it('with 8 items open: punches straight out as a break — no dialog, no bypass call, no notification (regression 1)', () => {
    incompleteCount = 8;
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('break_start'));

    expect(mutate).toHaveBeenCalledWith('break_start');
    expect(result.current.dialogOpen).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
    expect(toastInfo).not.toHaveBeenCalled();
    expect(toastWarning).not.toHaveBeenCalled();
  });

  it('open shared/team items change nothing about a break (regression 1)', () => {
    incompleteCount = 8;
    openSharedCount = 3;
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('break_start'));

    expect(mutate).toHaveBeenCalledWith('break_start');
    expect(result.current.dialogOpen).toBe(false);
  });
});

describe('coming back and clocking in', () => {
  it('returning from lunch punches straight in (regression 2)', () => {
    incompleteCount = 8;
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('break_end'));

    expect(mutate).toHaveBeenCalledWith('break_end');
    expect(result.current.dialogOpen).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('first clock-in of the day is never gated', () => {
    incompleteCount = 8;
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('clock_in'));

    expect(mutate).toHaveBeenCalledWith('clock_in');
    expect(result.current.dialogOpen).toBe(false);
  });
});

describe('ending the shift', () => {
  it('with required items open: holds the punch and opens the dialog (regression 3)', () => {
    incompleteCount = 8;
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('shift_end'));

    expect(result.current.dialogOpen).toBe(true);
    expect(mutate).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('with everything complete: clean end of shift, no dialog (regression 4)', () => {
    incompleteCount = 0;
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('shift_end'));

    expect(mutate).toHaveBeenCalledWith('shift_end');
    expect(result.current.dialogOpen).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it('with only shared items open: never gated (regression 5)', () => {
    incompleteCount = 0;
    openSharedCount = 4;
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('shift_end'));

    expect(mutate).toHaveBeenCalledWith('shift_end');
    expect(result.current.dialogOpen).toBe(false);
  });
});

describe('a deliberate bypass at end of shift', () => {
  it('records via the checklist-bypass function, then writes a shift_end punch (regression 7)', async () => {
    incompleteCount = 8;
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('shift_end'));
    expect(result.current.dialogOpen).toBe(true);

    await act(() => result.current.bypassAndEndShift('running to school pickup'));

    expect(invoke).toHaveBeenCalledWith('checklist-bypass', {
      body: { reason: 'running to school pickup' },
    });
    expect(mutate).toHaveBeenCalledWith('shift_end');
    expect(result.current.dialogOpen).toBe(false);
    expect(toastInfo).toHaveBeenCalled();
  });

  it('repeat unanswered bypasses keep escalating (regression 7)', async () => {
    incompleteCount = 3;
    invoke.mockResolvedValue({ data: { recorded: true, escalation_level: 2 }, error: null });
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('shift_end'));
    await act(() => result.current.bypassAndEndShift(''));

    expect(mutate).toHaveBeenCalledWith('shift_end');
    expect(toastWarning).toHaveBeenCalled();
    expect(String(toastWarning.mock.calls[0][0])).toContain('2nd');
  });

  it('a failing bypass recorder never traps anyone — the punch still writes', async () => {
    incompleteCount = 2;
    invoke.mockRejectedValue(new Error('edge function down'));
    const { result } = renderHook(() => useGuardedClockAction(), { wrapper });

    act(() => result.current.run('shift_end'));
    await act(() => result.current.bypassAndEndShift('note'));

    expect(mutate).toHaveBeenCalledWith('shift_end');
  });
});
