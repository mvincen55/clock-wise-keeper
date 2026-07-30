// Client side of the Integrity & Safety layer.
//
// The app can never write security events directly (RLS blocks it) — it hands
// the signal to the integrity-report function, which records it with the
// service role.
//
// RULE: only counters, record ids, and signal names go through here. Never
// message content, never AI conversation text, never patient data.

import { supabase } from '@/integrations/supabase/client';

export type IntegrityKind =
  | 'auth_abuse'
  | 'function_abuse'
  | 'time_anomaly'
  | 'deposit_discrepancy'
  | 'destructive_action';

interface ReportInput {
  kind: IntegrityKind;
  signal: string;
  summary: string;
  severity?: 'watch' | 'elevated';
  detail?: Record<string, string | number | boolean>;
  /** auth_abuse only — masked server-side before it is stored. */
  email?: string;
}

/** Fire-and-forget. Fails open: a reporting failure never blocks the user. */
export function reportIntegritySignal(input: ReportInput): void {
  void supabase.functions
    .invoke('integrity-report', { body: input })
    .catch(() => {
      /* fail open — integrity logging is never allowed to break the app */
    });
}

// --- Local counters used to spot patterns, not single events ---------------

function bump(key: string, windowMs: number): number {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(key);
    const hits: number[] = raw ? (JSON.parse(raw) as number[]) : [];
    const kept = hits.filter((t) => now - t < windowMs);
    kept.push(now);
    localStorage.setItem(key, JSON.stringify(kept.slice(-50)));
    return kept.length;
  } catch {
    return 0;
  }
}

export function clearCounter(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** Repeated failed sign-ins from this device — someone probing the door. */
export function noteFailedSignIn(email: string, denied: boolean): void {
  const count = bump('pe_signin_failures', 15 * 60 * 1000);
  if (count < 3) return;
  reportIntegritySignal({
    kind: 'auth_abuse',
    signal: denied ? 'allowlist_bounce_repeated' : 'failed_signin_repeated',
    severity: count >= 6 ? 'elevated' : 'watch',
    summary: denied
      ? `${count} blocked sign-in attempts in 15 minutes from an account that is not on the allow list.`
      : `${count} failed sign-in attempts in 15 minutes for the same account.`,
    detail: { attempts: count, window_minutes: 15, allowlist_bounce: denied },
    email,
  });
}

export const SIGNIN_COUNTER_KEY = 'pe_signin_failures';

/** Punch-edit sprees: many manual time edits in a short window. */
export function notePunchEdit(): void {
  const count = bump('pe_punch_edits', 60 * 60 * 1000);
  if (count < 6) return;
  reportIntegritySignal({
    kind: 'time_anomaly',
    signal: 'punch_edit_spree',
    severity: count >= 12 ? 'elevated' : 'watch',
    summary: `${count} manual time edits in the last hour.`,
    detail: { edits: count, window_minutes: 60 },
  });
}
