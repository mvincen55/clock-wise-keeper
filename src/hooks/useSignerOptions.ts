import { useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useMyProfile } from '@/hooks/useMyProfile';
import { useActiveProviders } from '@/hooks/useProviders';
import { useOrgStaff } from '@/hooks/useStaffCodes';
import { useOrgSignatures } from '@/hooks/useStaffSignature';
import { useCorrespondenceSettings } from '@/hooks/useCorrespondenceSettings';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import { DEFAULT_CORRESPONDENCE_SETTINGS } from '@/lib/letters/types';
import type { SignerKind } from '@/lib/letters/types';
import { authorizedSignatureUser } from '@/lib/letters/signing';

/**
 * Who can sign an office letter or school/work note, and whose stored ink
 * may print. Options come from the canonical sources — the signed-in user,
 * the org_providers registry, and the office-level signer from
 * correspondence settings — never a free-for-all of teammate signatures.
 *
 * Ink authorization: your own stored signature always renders for you; a
 * teammate's renders ONLY when they have turned on allow_office_use for
 * themselves (and the storage RLS enforces the same rule server-side, so a
 * modified client cannot fetch unauthorized ink either).
 */

export interface SignerOption {
  key: string;
  kind: SignerKind;
  /** Dropdown label, e.g. "Megan Vincent (you)". */
  label: string;
  /** Typed name printed under the signature line. */
  name: string;
  /** Default typed title (editable per letter). */
  title: string;
  /** Whose stored ink to print, when authorized; null = typed name only. */
  signatureUserId: string | null;
}

export function useSignerOptions(): { options: SignerOption[]; defaultKey: string } {
  const { user } = useAuth();
  const { data: myProfile } = useMyProfile();
  const { data: branding } = useOrgBranding();
  const { data: settings = DEFAULT_CORRESPONDENCE_SETTINGS } = useCorrespondenceSettings();
  const providers = useActiveProviders();
  const { data: staff } = useOrgStaff();
  const { data: signatures } = useOrgSignatures();

  return useMemo(() => {
    const options: SignerOption[] = [];
    const myUserId = user?.id ?? null;
    const signatureByUser = new Map(
      (signatures ?? []).map(s => [s.userId, s] as const),
    );
    const userByEmployee = new Map(
      (staff ?? []).filter(m => m.userId).map(m => [m.employeeId, m.userId!] as const),
    );

    /** Ink prints for yourself always; for others only with their consent. */
    const authorizedInk = (userId: string | null): string | null =>
      userId ? authorizedSignatureUser(signatureByUser.get(userId), myUserId) : null;

    if (myUserId) {
      options.push({
        key: 'self',
        kind: 'self',
        label: `${myProfile?.fullName.trim() || 'Me'} (you)`,
        name: myProfile?.fullName.trim() || '',
        title: '',
        signatureUserId: authorizedInk(myUserId),
      });
    }

    for (const p of providers) {
      const linkedUser = p.employeeId ? userByEmployee.get(p.employeeId) ?? null : null;
      if (linkedUser === myUserId && myUserId) continue; // already listed as "you"
      options.push({
        key: `provider:${p.id}`,
        kind: 'provider',
        label: p.displayName,
        name: p.displayName,
        title: '',
        signatureUserId: authorizedInk(linkedUser),
      });
    }

    const officeName =
      settings.defaultSignerName.trim() ||
      (branding?.legalName.trim() || branding?.displayName.trim() || '');
    if (officeName !== '') {
      // The explicit office-level signer (kept separate from personal
      // signatures on purpose): typed identity only, never borrowed ink.
      const isMe = officeName === (myProfile?.fullName.trim() ?? '');
      if (!isMe || !myUserId) {
        options.push({
          key: 'office',
          kind: 'office',
          label: `${officeName} (office signer)`,
          name: officeName,
          title: settings.defaultSignerTitle,
          signatureUserId: null,
        });
      }
    }

    return { options, defaultKey: options[0]?.key ?? 'self' };
  }, [user?.id, myProfile, providers, staff, signatures, settings, branding]);
}
