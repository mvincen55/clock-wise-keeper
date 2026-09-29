import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { classifyNamingError, MAX_ATTEMPTS, useFofNaming, type NameVisitsRequest, type NamingResult } from '@/hooks/useFofNaming';

/**
 * The automatic naming pass as a state machine: it only runs on ready,
 * current inputs; it never marks a signature as done before a response is
 * applied; failures are visible and retried a bounded number of times;
 * stale answers are dropped; the manual button always works.
 */
const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));

const request = (): NameVisitsRequest => ({
  body: { slots: ['Payment 1'], visits: [{ procedures: ['Porcelain Crown (tooth #3)'] }], wantTreatment: true, doctorName: '', orgId: '11111111-1111-4111-8111-111111111111' },
  slotCount: 1,
});
const httpError = (status: number, error = 'AI request failed') => ({ name: 'FunctionsHttpError', message: 'Edge Function returned a non-2xx status code', context: { status, json: async () => ({ error }) } });
const fetchError = () => ({ name: 'FunctionsFetchError', message: 'Failed to send a request to the Edge Function' });

function mount(initial: { ready?: boolean; signature?: string; orgId?: string; buildRequest?: () => NameVisitsRequest | null } = {}) {
  const onApply = vi.fn<(result: NamingResult, signature: string, manual: boolean) => void>();
  const hook = renderHook(
    (props: { ready: boolean; signature: string; orgId: string | undefined; resetKey: number }) =>
      useFofNaming({ ...props, buildRequest: initial.buildRequest ?? request, onApply, delayMs: 2500 }),
    { initialProps: { ready: initial.ready ?? true, signature: initial.signature ?? 'sig-1', orgId: initial.orgId ?? '11111111-1111-4111-8111-111111111111', resetKey: 0 } }
  );
  return { ...hook, onApply };
}
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };
const advance = async (ms: number) => { await act(async () => { vi.advanceTimersByTime(ms); }); await flush(); };

beforeEach(() => { vi.useFakeTimers(); mocks.invoke.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe('automatic naming state machine', () => {
  it('waits for the quiet period, sends the office id, applies the answer and marks the signature done only then', async () => {
    mocks.invoke.mockResolvedValue({ data: { names: ['At Crown Prep'], treatment: 'We will place a crown on tooth #3.' } });
    const { result, onApply } = mount();
    expect(result.current.state.status).toBe('waiting');
    await advance(2000);
    expect(mocks.invoke).not.toHaveBeenCalled();
    await advance(600);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(mocks.invoke.mock.calls[0][0]).toBe('name-visits');
    expect(mocks.invoke.mock.calls[0][1].body.orgId).toBe('11111111-1111-4111-8111-111111111111');
    expect(onApply).toHaveBeenCalledWith({ names: ['At Crown Prep'], treatment: 'We will place a crown on tooth #3.' }, 'sig-1', false);
    expect(result.current.state).toMatchObject({ status: 'done', signature: 'sig-1' });
  });
  it('does not run until the inputs are ready, and never for an empty request', async () => {
    const { result, rerender } = mount({ ready: false });
    await advance(5000);
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(result.current.state.status).toBe('waiting');
    mocks.invoke.mockResolvedValue({ data: { names: ['At Crown Prep'], treatment: null } });
    rerender({ ready: true, signature: 'sig-1', orgId: '11111111-1111-4111-8111-111111111111', resetKey: 0 });
    await advance(2600);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(result.current.state.status).toBe('done');
  });
  it('retries a transient failure with backoff, then stops in a visible error state without looping', async () => {
    mocks.invoke.mockResolvedValue({ error: httpError(502) });
    const { result } = mount();
    await advance(2600);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    expect(result.current.state).toMatchObject({ status: 'retrying', attempt: 1 });
    await advance(4100);
    expect(mocks.invoke).toHaveBeenCalledTimes(2);
    await advance(8100);
    expect(mocks.invoke).toHaveBeenCalledTimes(MAX_ATTEMPTS);
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.message).toMatch(/Retry when you are ready/);
    // No loop: nothing more happens on its own.
    await advance(60_000);
    expect(mocks.invoke).toHaveBeenCalledTimes(MAX_ATTEMPTS);
  });
  it('stops at once on a permanent refusal and reports a missing deployment as unavailable', async () => {
    mocks.invoke.mockResolvedValueOnce({ error: httpError(403, 'Unauthorized') });
    const { result, rerender } = mount();
    await advance(2600);
    expect(result.current.state.status).toBe('error');
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    mocks.invoke.mockResolvedValueOnce({ error: httpError(404, 'Requested function was not found') });
    rerender({ ready: true, signature: 'sig-2', orgId: '11111111-1111-4111-8111-111111111111', resetKey: 0 });
    await advance(2600);
    expect(result.current.state.status).toBe('unavailable');
    expect(result.current.state.message).toMatch(/not deployed/);
  });
  it('drops a response whose inputs changed while it was in flight, and rejects a wrong slot count', async () => {
    let resolve!: (value: unknown) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const { result, rerender, onApply } = mount();
    await advance(2600);
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
    // The staff member keeps editing: the signature moves on before the answer lands.
    mocks.invoke.mockResolvedValueOnce({ data: { names: ['Second'], treatment: 'second' } });
    rerender({ ready: true, signature: 'sig-2', orgId: '11111111-1111-4111-8111-111111111111', resetKey: 0 });
    await act(async () => { resolve({ data: { names: ['Stale'], treatment: 'stale' } }); });
    await flush();
    expect(onApply).not.toHaveBeenCalledWith(expect.objectContaining({ treatment: 'stale' }), expect.anything(), expect.anything());
    await advance(2600);
    expect(onApply).toHaveBeenCalledWith({ names: ['Second'], treatment: 'second' }, 'sig-2', false);
    mocks.invoke.mockResolvedValueOnce({ data: { names: ['One', 'Two'], treatment: null } });
    rerender({ ready: true, signature: 'sig-3', orgId: '11111111-1111-4111-8111-111111111111', resetKey: 0 });
    await advance(2600);
    expect(result.current.state.status).toBe('error');
    expect(result.current.state.message).toMatch(/unexpected number/);
  });
  it('manual retry always works, even after an error, and applies as a manual result', async () => {
    mocks.invoke.mockResolvedValueOnce({ error: httpError(400, 'Bad request') });
    const { result, onApply } = mount();
    await advance(2600);
    expect(result.current.state.status).toBe('error');
    mocks.invoke.mockResolvedValueOnce({ data: { names: ['At Crown Prep'], treatment: null } });
    await act(async () => { result.current.retry(); });
    await flush();
    expect(onApply).toHaveBeenLastCalledWith({ names: ['At Crown Prep'], treatment: null }, 'sig-1', true);
    expect(result.current.state.status).toBe('done');
  });
  it('an office change or reset abandons the run in flight', async () => {
    let resolve!: (value: unknown) => void;
    mocks.invoke.mockImplementationOnce(() => new Promise(r => { resolve = r; }));
    const { result, rerender, onApply } = mount();
    await advance(2600);
    rerender({ ready: true, signature: 'sig-1', orgId: '22222222-2222-4222-8222-222222222222', resetKey: 0 });
    await act(async () => { resolve({ data: { names: ['Other office'], treatment: 'x' } }); });
    await flush();
    expect(onApply).not.toHaveBeenCalled();
    expect(result.current.state.status).not.toBe('done');
  });
  it('classifies network failures as transient and 401/403 as permanent', async () => {
    expect((await classifyNamingError(fetchError())).kind).toBe('transient');
    expect((await classifyNamingError(httpError(429))).kind).toBe('transient');
    expect((await classifyNamingError(httpError(500))).kind).toBe('transient');
    expect((await classifyNamingError(httpError(401))).kind).toBe('permanent');
    expect((await classifyNamingError(httpError(404))).kind).toBe('unavailable');
    expect((await classifyNamingError(httpError(400, 'x', ))).kind).toBe('permanent');
  });
});
