/**
 * PIN attestation primitive — client-side vocabulary and pure helpers.
 *
 * An attestation is a server-verified "this specific person confirms this
 * specific action" record. The PIN never proves anything client-side: the
 * `attest` edge function verifies it against the server-held hash and is the
 * only writer of attestation rows (no client insert path exists — migration
 * 20260825120000_pin_attestation.sql).
 *
 * Registry rule: every action type a feature attests is declared here, the
 * way permission keys live in src/lib/permissions.ts — so "what can be
 * attested" stays one greppable list.
 */

export const PIN_PATTERN = /^[0-9]{4,8}$/;

/** Registered attestation action types (features add theirs here). */
export const ATTEST_ACTION_TYPES = [
  /** Onboarding dual sign-off — one attestation per side (trainer/trainee). */
  'onboarding_item_signoff',
] as const;

export type AttestActionType = (typeof ATTEST_ACTION_TYPES)[number];

/** Validation for PIN entry fields, with inline-display reasons. */
export function validatePinInput(pin: string): { ok: boolean; reason?: string } {
  const trimmed = (pin ?? '').trim();
  if (!trimmed) return { ok: false, reason: 'Enter a PIN.' };
  if (/[^0-9]/.test(trimmed)) return { ok: false, reason: 'Digits only.' };
  if (trimmed.length < 4 || trimmed.length > 8) {
    return { ok: false, reason: 'A PIN is 4-8 digits.' };
  }
  return { ok: true };
}

/** Error shape the attest function returns on refusals. */
export type AttestErrorCode = 'wrong_pin' | 'locked' | 'no_pin';

export interface AttestFailure {
  code?: AttestErrorCode | string;
  error?: string;
  attempts_remaining?: number;
  locked_until?: string;
}

export interface AttestSuccess {
  verified: true;
  attestation_id: string;
  attested_at?: string;
  applied?: boolean;
}

/** Whole minutes left on a lock, never negative; 0 = expired/none. */
export function lockRemainingMinutes(lockedUntil: string | null | undefined, now: Date = new Date()): number {
  if (!lockedUntil) return 0;
  const until = new Date(lockedUntil).getTime();
  if (!Number.isFinite(until)) return 0;
  return Math.max(0, Math.ceil((until - now.getTime()) / 60_000));
}

/**
 * One shared mapping from refusal to human copy, so every feature using the
 * primitive says the same thing. Factual, never scolding.
 */
export function attestFailureMessage(failure: AttestFailure, now: Date = new Date()): string {
  switch (failure.code) {
    case 'no_pin':
      return 'No sign-off PIN is set for this team member yet. A manager or owner can set one from their profile.';
    case 'locked': {
      const mins = lockRemainingMinutes(failure.locked_until, now);
      return mins > 0
        ? `Too many wrong attempts — this PIN is locked for another ${mins} minute${mins === 1 ? '' : 's'}.`
        : 'Too many wrong attempts — this PIN is temporarily locked. Try again shortly.';
    }
    case 'wrong_pin': {
      const left = failure.attempts_remaining;
      return typeof left === 'number' && left > 0
        ? `That PIN is not right. ${left} attempt${left === 1 ? '' : 's'} left before a short lock.`
        : 'That PIN is not right.';
    }
    default:
      return failure.error || 'The PIN could not be verified. Try again.';
  }
}
