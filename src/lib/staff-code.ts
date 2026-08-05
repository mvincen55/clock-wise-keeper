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

/**
 * Normalizes a collection of codes into an uppercased, deduped reserved set.
 * Callers feed BOTH the current `employees.tag` values AND the permanent
 * `employee_tags` registry so a code retired to a former employee is never
 * suggested for or assigned to someone else. Case differences never bypass it.
 */
export function buildReservedSet(codes: Iterable<string | null | undefined>): Set<string> {
  const set = new Set<string>();
  for (const c of codes) {
    const n = normalizeStaffCode(c);
    if (n) set.add(n);
  }
  return set;
}

/**
 * A suggested 3-4 char code from a display name, avoiding any codes already
 * `taken` (uppercased). This is only ever a suggestion — a manager confirms or
 * edits it before it is saved; the system never persists a generated code on
 * its own.
 */
export function suggestStaffCode(
  name: string | null | undefined,
  taken: ReadonlySet<string> = new Set(),
): string {
  const alnum = (name ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  let base = alnum.slice(0, 3);
  while (base.length < 3) base += 'X';
  if (!taken.has(base)) return base;
  for (let i = 2; i < 100; i++) {
    const suffix = String(i);
    const candidate = base.slice(0, 4 - suffix.length) + suffix; // stays 3-4 chars
    if (!taken.has(candidate)) return candidate;
  }
  return base;
}
