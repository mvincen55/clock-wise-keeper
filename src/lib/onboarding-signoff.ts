/**
 * Onboarding dual sign-off — the completion and verification rules, as pure
 * functions shared by the instance view, the print sheet, and the tests.
 *
 * The rules ("both signatures" is the load-bearing one):
 *  - an item is COMPLETE only when BOTH the trainer and the trainee slot
 *    are signed — one side alone is progress, never completion;
 *  - a slot is VERIFIED only when its signature carries an attestation
 *    reference (PIN verified server-side). Initials-fallback signatures
 *    have none and must always be labeled unverified;
 *  - an item is fully verified only when BOTH slots are verified.
 */

export interface SignoffSlot {
  initials: string;
  signed_at: string | null;
  attestation_id: string | null;
}

export interface SignoffItemState {
  trainer: SignoffSlot;
  trainee: SignoffSlot;
}

/** Row shape shared with Tables<'onboarding_instance_items'>. */
export interface SignoffItemRow {
  trainer_initials: string;
  trainer_signed_at: string | null;
  trainer_attestation_id: string | null;
  trainee_initials: string;
  trainee_signed_at: string | null;
  trainee_attestation_id: string | null;
}

export function toSignoffState(row: SignoffItemRow): SignoffItemState {
  return {
    trainer: {
      initials: row.trainer_initials,
      signed_at: row.trainer_signed_at,
      attestation_id: row.trainer_attestation_id,
    },
    trainee: {
      initials: row.trainee_initials,
      signed_at: row.trainee_signed_at,
      attestation_id: row.trainee_attestation_id,
    },
  };
}

export function slotSigned(slot: SignoffSlot): boolean {
  return !!slot.signed_at;
}

/** PIN-verified: the signature references a server-written attestation. */
export function slotVerified(slot: SignoffSlot): boolean {
  return !!slot.signed_at && !!slot.attestation_id;
}

/** Complete = BOTH slots signed. Never one. */
export function isItemComplete(state: SignoffItemState): boolean {
  return slotSigned(state.trainer) && slotSigned(state.trainee);
}

export function isItemFullyVerified(state: SignoffItemState): boolean {
  return slotVerified(state.trainer) && slotVerified(state.trainee);
}

export type SlotLabel = 'verified' | 'unverified' | 'unsigned';

/** How a slot reads on screens and the printed record. */
export function slotLabel(slot: SignoffSlot): SlotLabel {
  if (!slotSigned(slot)) return 'unsigned';
  return slotVerified(slot) ? 'verified' : 'unverified';
}

export interface SignoffProgress {
  total: number;
  complete: number;
}

export function progressOf(states: readonly SignoffItemState[]): SignoffProgress {
  return {
    total: states.length,
    complete: states.filter(isItemComplete).length,
  };
}

/** Fallback initials rule — mirrors the SQL check in the fallback RPC. */
export function validateFallbackInitials(input: string): { ok: boolean; reason?: string } {
  const clean = (input ?? '').trim().toUpperCase();
  if (!clean) return { ok: false, reason: 'Enter initials.' };
  if (!/^[A-Z0-9]{2,8}$/.test(clean)) {
    return { ok: false, reason: 'Initials are 2-8 letters or digits.' };
  }
  return { ok: true };
}
