import type { StaffSignatureMeta } from './types';

/**
 * Signature-use authorization — the ONE client-side rule for whose stored
 * ink may print on a letter, mirrored by the storage RLS policy
 * ("Members read authorized staff signatures"):
 *
 *   - your own stored signature always renders for you
 *   - a teammate's renders ONLY while their allow_office_use flag is on
 *
 * The client rule decides what the UI offers; the storage policy enforces
 * the same rule server-side, so a modified client cannot fetch
 * unauthorized ink either. A stored signature must never become an
 * accidental impersonation mechanism.
 */
export function authorizedSignatureUser(
  signature: Pick<StaffSignatureMeta, 'userId' | 'allowOfficeUse'> | undefined,
  viewerUserId: string | null,
): string | null {
  if (!signature) return null;
  if (signature.userId === viewerUserId) return signature.userId;
  return signature.allowOfficeUse ? signature.userId : null;
}
