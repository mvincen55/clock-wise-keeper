// Close the Day status — the deterministic layer behind the Home status line
// and the closeout follow-ups. (The old intervention queue left with the old
// Home: Attention is the one queue, see src/lib/attention.)
//
// Everything is a pure function of recorded data. No AI, no invented urgency:
// a closed office with nobody clocked in is calm, not a crisis, and a missing
// closeout is stated as missing, never rendered as $0.

import type { DepositLog } from '@/hooks/useDepositLog';
import type { OfficePhase } from '@/components/dashboard/staffing';
import type { PulseTone } from '@/lib/owner-pulse';

/* --------------------------- close the day ----------------------------- */

export type CloseDayState =
  | 'not_started'
  | 'in_progress'
  | 'saved_unsealed'
  | 'sealed'
  | 'sealed_needs_review';

export type CloseDayStatus = {
  state: CloseDayState;
  label: string;
  detail: string;
  /** Deep link to the exact Close the Day record. */
  href: string;
  tone: PulseTone;
};

/**
 * Where today's closeout stands, from the deposit_logs row itself.
 * "In progress" means a row exists but the practice-vitals questions are not
 * answered yet; "saved, unsealed" means the record is complete but unsealed.
 */
export function closeDayStatus(log: DepositLog | null, officePhase: OfficePhase): CloseDayStatus {
  const href = '/deposit-log';
  if (!log) {
    const stillWorking =
      officePhase === 'open' || officePhase === 'before_open' || officePhase === 'unknown_hours';
    return {
      state: 'not_started',
      label: 'Not started',
      detail: stillWorking
        ? 'Nothing saved yet — normal while the office is still working.'
        : "Today's closeout has not been started.",
      href,
      tone: stillWorking ? 'calm' : 'attention',
    };
  }
  if (log.sealed_at) {
    if (log.needs_manager_review) {
      return {
        state: 'sealed_needs_review',
        label: 'Sealed — items need review',
        detail: 'The day is sealed, but low-confidence items are flagged for manager review.',
        href,
        tone: 'attention',
      };
    }
    return {
      state: 'sealed',
      label: 'Sealed',
      detail: 'The record is complete and sealed.',
      href,
      tone: 'steady',
    };
  }
  const vitalsAnswered =
    log.production_cents !== null &&
    log.new_patients_scheduled_count !== null &&
    log.new_patients_seen_count !== null;
  if (!vitalsAnswered) {
    return {
      state: 'in_progress',
      label: 'In progress',
      detail: 'Saved, but the practice-vitals questions are not all answered yet.',
      href,
      tone: 'calm',
    };
  }
  return {
    state: 'saved_unsealed',
    label: 'Saved, not sealed',
    detail: 'The record is filled in — it still needs the seal.',
    href,
    tone: 'attention',
  };
}

