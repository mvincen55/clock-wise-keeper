/**
 * Canonical office-assigned staff code — ONE source of truth for staff
 * attribution across Purple Envelope (Forms & Consents, Broken Appointments,
 * reports, version history, and future modules).
 *
 * The code is `employees.tag`: org-scoped, permanently registered, and assigned
 * by a manager/owner. The office rule is 3-4 uppercase letters/digits. Existing
 * 2-char tags are grandfathered (legacy) and must be updated when next edited.
 *
 * Attribution never falls back to email, full name, or name-derived initials.
 * When a code is missing we say so explicitly, so managers assign one rather
 * than leaking a person's name onto operational surfaces.
 */

/** The office rule for all new/edited codes. */
export const STAFF_CODE_PATTERN = /^[A-Z0-9]{3,4}$/;
/** What the database currently still accepts (includes grandfathered 2-char). */
export const LEGACY_STAFF_CODE_PATTERN = /^[A-Z0-9]{2,4}$/;

/** Shown wherever a person acted but has no assigned code yet. */
export const UNASSIGNED_STAFF_CODE = 'Unassigned';

export function normalizeStaffCode(input: string | null | undefined): string {
  return (input ?? '').trim().toUpperCase();
}

/** True only for codes that satisfy the current 3-4 office rule. */
export function isValidStaffCode(input: string | null | undefined): boolean {
  return STAFF_CODE_PATTERN.test(normalizeStaffCode(input));
}

/** A grandfathered 2-char code: still stored, but must be updated when edited. */
export function isLegacyStaffCode(input: string | null | undefined): boolean {
  const code = normalizeStaffCode(input);
  return LEGACY_STAFF_CODE_PATTERN.test(code) && !STAFF_CODE_PATTERN.test(code);
}

/**
 * Validation result for an editor. `ok` means it satisfies the 3-4 rule;
 * anything else returns a reason suitable for inline display.
 */
export function validateStaffCodeInput(input: string): { ok: boolean; reason?: string } {
  const code = normalizeStaffCode(input);
  if (!code) return { ok: false, reason: 'Enter a staff code.' };
  if (/[^A-Z0-9]/.test(code)) return { ok: false, reason: 'Use letters and numbers only.' };
  if (code.length < 3) return { ok: false, reason: 'Staff codes are 3-4 characters.' };
  if (code.length > 4) return { ok: false, reason: 'Staff codes are 3-4 characters.' };
  return { ok: true };
}

/** A resolved actor: the canonical code, or null when none is assigned. */
export type ResolvedActor = { code: string | null };

/**
 * Resolves the staff code for an actor from an org-scoped map keyed by
 * authenticated user id. Returns `{ code: null }` when unknown/unassigned —
 * callers must display `UNASSIGNED_STAFF_CODE`, never a name or email.
 */
export function resolveStaffCode(
  map: ReadonlyMap<string, string>,
  userId: string | null | undefined,
): ResolvedActor {
  if (!userId) return { code: null };
  const code = map.get(userId);
  return { code: code ? normalizeStaffCode(code) : null };
}

/** Display form of a resolved code, e.g. "MEGV" or "Unassigned". */
export function staffCodeLabel(code: string | null | undefined): string {
  const c = normalizeStaffCode(code);
  return c || UNASSIGNED_STAFF_CODE;
}

/**
 * Official attribution label, e.g. `attributionLabel('Published', 'MEGV')`
 * → "Published by MEGV". Used identically everywhere so no module invents its
 * own wording or fallback.
 */
export function attributionLabel(action: string, code: string | null | undefined): string {
  return `${action} by ${staffCodeLabel(code)}`;
}
