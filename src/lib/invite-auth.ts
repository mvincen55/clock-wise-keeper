export type InviteSignUpOutcome = 'existing_account' | 'signed_in' | 'confirmation_requested';

interface SignUpUserShape {
  identities?: unknown[] | null;
}

export function classifyInviteSignUp(
  user: SignUpUserShape | null,
  hasSession: boolean,
): InviteSignUpOutcome {
  if (hasSession) return 'signed_in';
  if (user && Array.isArray(user.identities) && user.identities.length === 0) {
    return 'existing_account';
  }
  return 'confirmation_requested';
}

export function inviteAcceptancePath(token: string): string {
  return `/accept-invite?token=${encodeURIComponent(token)}`;
}

export function safeInviteNext(raw: string | null): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/auth';
  return raw;
}

/**
 * An authenticated but not-yet-allowlisted user may keep a session only on
 * the narrow routes required to complete a token-backed office invitation.
 * Protected application routes still require isAllowed.
 */
export function isInviteCompletionRoute(pathname: string, search: string): boolean {
  const params = new URLSearchParams(search);

  if (pathname === '/accept-invite') {
    return (params.get('token')?.length ?? 0) >= 10;
  }

  if (pathname === '/reset-password') {
    const next = safeInviteNext(params.get('next'));
    if (!next.startsWith('/accept-invite?')) return false;
    const queryIndex = next.indexOf('?');
    const nextParams = new URLSearchParams(next.slice(queryIndex + 1));
    return (nextParams.get('token')?.length ?? 0) >= 10;
  }

  return false;
}
