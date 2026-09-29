/**
 * Where a number on the Financial Options Form came from.
 *
 * Every amount the builder shows carries one of these sources so staff can
 * see at a glance whether a figure is the office schedule, the selected
 * carrier's contracted rate, a saved plan default (an unverified estimate),
 * a patient-specific value they typed, an office policy rule, or a manual
 * override — and so a stale value from a previous code or carrier can be
 * recognised and cleared rather than silently reused.
 *
 * Memory-only vocabulary: nothing here is persisted or sent anywhere.
 */

export type ValueSource =
  /** The active office fee schedule. */
  | 'office'
  /** The selected carrier schedule's contracted rate. */
  | 'carrier'
  /** A saved insurance plan's default (an estimate, not the patient's verified benefit). */
  | 'plan'
  /** Typed for this patient (remaining deductible, benefits, credit). */
  | 'patient'
  /** An office policy rule (payment policy, discount rules, categories). */
  | 'policy'
  /** Staff overrode the computed value on this form. */
  | 'manual'
  /** Read off an imported treatment plan (screenshot or pasted text). */
  | 'import'
  /** The form's generic default, used when nothing more specific exists. */
  | 'default'
  /** Nothing on file: the value is missing and needs a decision. */
  | 'missing';

export const SOURCE_LABELS: Record<ValueSource, string> = {
  office: 'Office schedule',
  carrier: 'Carrier rate',
  plan: 'Plan default (unverified)',
  patient: 'Entered for this patient',
  policy: 'Office policy',
  manual: 'Manual override',
  import: 'Imported plan',
  default: 'Form default',
  missing: 'Not on file',
};

/** Short chip wording for the builder rows. */
export const SOURCE_SHORT: Record<ValueSource, string> = {
  office: 'office',
  carrier: 'carrier',
  plan: 'plan default',
  patient: 'patient',
  policy: 'policy',
  manual: 'manual',
  import: 'imported',
  default: 'default',
  missing: 'missing',
};

/**
 * The office-fee source for a builder line, from how its fee input relates
 * to the office schedule. A typed fee that happens to equal the schedule
 * still reads as the schedule; anything else staff typed is manual, and an
 * empty fee is missing.
 */
export function feeSourceFor(
  feeInputCents: number | null,
  scheduleFeeCents: number | null | undefined,
  imported: boolean
): ValueSource {
  if (feeInputCents === null) return 'missing';
  if (scheduleFeeCents !== null && scheduleFeeCents !== undefined && feeInputCents === scheduleFeeCents) return 'office';
  return imported ? 'import' : 'manual';
}
