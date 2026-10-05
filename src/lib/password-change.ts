import type { User } from '@supabase/supabase-js';

export const CHOOSE_PASSWORD_PATH = '/choose-password';
export const MIN_PASSWORD_LENGTH = 8;

/**
 * A login the office set up with a temporary password carries
 * `must_change_password: true` in its user metadata (written when the account
 * is provisioned, never by the app). Until the person picks a password of their
 * own the app stays closed: every signed-in route sends them to
 * /choose-password first. The flag lives in user metadata on purpose: the
 * person clears it themselves the moment their new password saves, with no
 * server round trip beyond the password change itself.
 */
export function needsPasswordChange(user: Pick<User, 'user_metadata'> | null | undefined): boolean {
  const flag = user?.user_metadata?.must_change_password;
  return flag === true || flag === 'true';
}

/** The metadata patch that lifts the gate once a password of the person's own is saved. */
export function passwordChangedMetadata(): Record<string, unknown> {
  return { must_change_password: false, password_changed_at: new Date().toISOString() };
}

/** Client-side reasons a submission cannot go to the server yet; null when it can. */
export function passwordProblem(password: string, confirm: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (password !== confirm) return 'The two passwords do not match.';
  return null;
}
