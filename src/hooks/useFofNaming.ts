import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { NameVisitsPayload } from '@/lib/fof/ai';

/**
 * The name-visits pass for the Financial Options Form: plain-language
 * treatment wording and friendlier payment names.
 *
 * One state machine serves both the automatic run (after the treatment
 * settles) and the manual "Suggest names" button:
 *
 *   idle → waiting (inputs not ready) → working → done | error
 *                                        ↳ retrying (transient failure, bounded)
 *
 * Rules the machine enforces:
 * - It only runs on READY inputs (fees loaded, policy loaded, nothing
 *   importing) and for the CURRENT form: every response is checked against
 *   the signature, the office and the mount state it was requested for,
 *   and a stale answer is dropped rather than applied.
 * - A signature is marked as run only when a response was applied. A
 *   failure never hides: it becomes a visible error state with a Retry.
 * - Transient failures (network, gateway 5xx, 429) retry with backoff, at
 *   most MAX_ATTEMPTS per signature; anything else stops at once. There is
 *   no loop: after the last attempt the machine waits for new inputs or a
 *   manual retry, which always works.
 *
 * HIPAA: the request body is built by the caller from CDT codes only (see
 * src/lib/fof/ai.ts); this hook never sees the form's patient fields.
 */

export type NamingStatus = 'idle' | 'waiting' | 'working' | 'retrying' | 'done' | 'error' | 'unavailable';

export interface NamingResult {
  names: string[];
  treatment: string | null;
}

export interface NamingState {
  status: NamingStatus;
  /** Signature the current status refers to. */
  signature: string;
  attempt: number;
  /** Staff-facing explanation for error/unavailable states. */
  message: string;
}

export interface NameVisitsRequest {
  body: NameVisitsPayload & { wantTreatment: boolean; doctorName: string; orgId: string };
  slotCount: number;
}

export interface UseFofNamingOptions {
  /** True when every input the request depends on has loaded and is current. */
  ready: boolean;
  /** Changes whenever the inputs to the request change. */
  signature: string;
  orgId: string | undefined;
  /** Builds the de-identified request from the CURRENT inputs; null when there is nothing to name. */
  buildRequest: () => NameVisitsRequest | null;
  /** Receives a result that is still current; decides how to apply it. */
  onApply: (result: NamingResult, signature: string, manual: boolean) => void;
  /** Quiet period after the last edit before the automatic run (ms). */
  delayMs?: number;
  /** Bumped by Clear/Start Over to abandon any run in flight. */
  resetKey?: number;
  /** Automatic runs happen only when this is true (manual runs always may). */
  autoEnabled?: boolean;
}

export const MAX_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [4000, 8000];

type Classified = { kind: 'transient' | 'permanent' | 'unavailable'; message: string };

/** Sort a failed invoke into "try again later", "stop", or "not deployed". */
export async function classifyNamingError(error: unknown): Promise<Classified> {
  const err = error as { name?: string; message?: string; context?: { status?: number; json?: () => Promise<unknown> } };
  const status = err?.context?.status;
  let detail = '';
  try {
    const body = (await err?.context?.json?.()) as { error?: string; code?: string } | undefined;
    if (body?.error) detail = body.error;
    if (body?.code === 'OFFICE_REQUIRED') return { kind: 'permanent', message: 'The office could not be determined for this form. Reload the page and try again.' };
  } catch { /* the generic message stands */ }
  if (err?.name === 'FunctionsFetchError' || (!status && /fetch|network|Failed to send/i.test(err?.message ?? ''))) {
    return { kind: 'transient', message: 'The wording service could not be reached. It will retry.' };
  }
  if (status === 404 || /NOT_FOUND|Requested function was not found/i.test(detail)) {
    return { kind: 'unavailable', message: 'The wording service (name-visits) is not deployed for this app. The form prints the procedure list instead; ask an administrator to deploy it.' };
  }
  if (status === 401 || status === 403) {
    return { kind: 'permanent', message: `The wording service refused this request${detail ? ` (${detail})` : ''}. Sign in again or ask a manager to check your office membership.` };
  }
  if (status === 429 || (status !== undefined && status >= 500)) {
    return { kind: 'transient', message: detail ? `${detail}. It will retry.` : 'The wording service is busy. It will retry.' };
  }
  if (status === 400 || status === 422) {
    return { kind: 'permanent', message: detail || 'The wording service rejected this treatment plan. The form prints the procedure list instead.' };
  }
  return { kind: 'transient', message: detail || err?.message || 'The wording service failed. It will retry.' };
}

export function useFofNaming(options: UseFofNamingOptions) {
  const { ready, signature, orgId, buildRequest, onApply, delayMs = 2500, resetKey = 0, autoEnabled = true } = options;
  const [state, setState] = useState<NamingState>({ status: 'idle', signature: '', attempt: 0, message: '' });
  const requestId = useRef(0);
  const latestSignature = useRef(signature);
  const latestOrg = useRef(orgId);
  const mounted = useRef(true);
  const appliedSignature = useRef<string>('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const buildRef = useRef(buildRequest);
  const applyRef = useRef(onApply);
  buildRef.current = buildRequest;
  applyRef.current = onApply;
  latestSignature.current = signature;
  latestOrg.current = orgId;

  const clearTimer = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; clearTimer(); requestId.current += 1; };
  }, []);

  // A reset or an office change abandons anything in flight and starts over.
  useEffect(() => {
    clearTimer();
    requestId.current += 1;
    appliedSignature.current = '';
    setState({ status: 'idle', signature: '', attempt: 0, message: '' });
  }, [resetKey, orgId]);

  const run = useCallback(async (attempt: number, manual: boolean) => {
    clearTimer();
    const request = buildRef.current();
    const runSignature = latestSignature.current;
    const runOrg = latestOrg.current;
    if (!request || !runOrg) {
      setState({ status: 'idle', signature: runSignature, attempt: 0, message: '' });
      return;
    }
    const id = ++requestId.current;
    const stillCurrent = () =>
      mounted.current && id === requestId.current && runSignature === latestSignature.current && runOrg === latestOrg.current;
    setState({ status: attempt > 1 ? 'retrying' : 'working', signature: runSignature, attempt, message: '' });
    let outcome: { ok: true; result: NamingResult } | { ok: false; classified: Classified };
    try {
      const { data, error } = await supabase.functions.invoke('name-visits', { body: request.body });
      if (error) {
        outcome = { ok: false, classified: await classifyNamingError(error) };
      } else if (data?.error) {
        outcome = { ok: false, classified: { kind: 'permanent', message: String(data.error) } };
      } else {
        const names: unknown = data?.names;
        if (!Array.isArray(names) || names.length !== request.slotCount || names.some(n => typeof n !== 'string' || !n.trim())) {
          outcome = { ok: false, classified: { kind: 'permanent', message: 'The wording service returned an unexpected number of payment names. The form keeps its current wording.' } };
        } else {
          const treatment = typeof data?.treatment === 'string' && data.treatment.trim() !== '' ? data.treatment.trim() : null;
          outcome = { ok: true, result: { names: names.map((n: string) => n.trim()), treatment } };
        }
      }
    } catch (error) {
      outcome = { ok: false, classified: await classifyNamingError(error) };
    }
    // Anything that changed while the request was out makes the answer stale.
    if (!stillCurrent()) return;
    if (outcome.ok) {
      appliedSignature.current = runSignature;
      applyRef.current(outcome.result, runSignature, manual);
      setState({ status: 'done', signature: runSignature, attempt, message: '' });
      return;
    }
    const { classified } = outcome as { ok: false; classified: Classified };
    if (classified.kind === 'transient' && attempt < MAX_ATTEMPTS) {
      setState({ status: 'retrying', signature: runSignature, attempt, message: classified.message });
      timer.current = setTimeout(() => { void run(attempt + 1, manual); }, RETRY_DELAYS_MS[attempt - 1] ?? RETRY_DELAYS_MS.at(-1));
      return;
    }
    setState({
      status: classified.kind === 'unavailable' ? 'unavailable' : 'error',
      signature: runSignature,
      attempt,
      message: classified.kind === 'transient' ? `${classified.message.replace(/ It will retry\.$/, '')} Retry when you are ready.` : classified.message,
    });
  }, []);

  // Automatic run: once the inputs are ready and quiet, and only for a
  // signature that has not been applied yet. An error state for the same
  // signature is not retried automatically (no loop); new inputs or the
  // manual button start the next attempt.
  useEffect(() => {
    if (!autoEnabled) return;
    if (!ready || !orgId) {
      clearTimer();
      setState(previous => previous.status === 'working' || previous.status === 'retrying'
        ? previous
        : { status: 'waiting', signature, attempt: 0, message: '' });
      return;
    }
    if (appliedSignature.current === signature) return;
    if (!buildRef.current()) {
      clearTimer();
      setState({ status: 'idle', signature, attempt: 0, message: '' });
      return;
    }
    clearTimer();
    // A new signature supersedes any attempt or error for the previous one.
    requestId.current += 1;
    setState({ status: 'waiting', signature, attempt: 0, message: '' });
    timer.current = setTimeout(() => { void run(1, false); }, delayMs);
    return clearTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, signature, orgId, delayMs, autoEnabled]);

  /** Manual retry/suggest: always allowed, restarts the attempt count. */
  const retry = useCallback(() => { void run(1, true); }, [run]);

  return { state, retry, appliedSignature: appliedSignature.current };
}
