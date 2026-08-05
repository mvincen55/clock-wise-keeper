import { describe, expect, it } from 'vitest';
import {
  classifyInviteSignUp,
  inviteAcceptancePath,
  isInviteCompletionRoute,
  safeInviteNext,
} from '@/lib/invite-auth';

describe('invite authentication helpers', () => {
  it('recognizes Supabase email-enumeration response for an existing account', () => {
    expect(classifyInviteSignUp({ identities: [] }, false)).toBe('existing_account');
  });

  it('recognizes a signup that immediately created a session', () => {
    expect(classifyInviteSignUp({ identities: [{}] }, true)).toBe('signed_in');
  });

  it('recognizes a genuinely new account awaiting confirmation', () => {
    expect(classifyInviteSignUp({ identities: [{}] }, false)).toBe('confirmation_requested');
  });

  it('retains auth only on a token-bearing invitation route', () => {
    expect(isInviteCompletionRoute('/accept-invite', '?token=1234567890')).toBe(true);
    expect(isInviteCompletionRoute('/accept-invite', '?token=short')).toBe(false);
    expect(isInviteCompletionRoute('/team', '?token=1234567890')).toBe(false);
  });

  it('allows recovery only when it returns to a token-bearing invitation', () => {
    const next = encodeURIComponent(inviteAcceptancePath('1234567890'));
    expect(isInviteCompletionRoute('/reset-password', `?next=${next}`)).toBe(true);
    expect(isInviteCompletionRoute('/reset-password', '?next=%2Fteam')).toBe(false);
  });

  it('rejects external or protocol-relative recovery destinations', () => {
    expect(safeInviteNext('https://example.com')).toBe('/auth');
    expect(safeInviteNext('//example.com')).toBe('/auth');
    expect(safeInviteNext('/accept-invite?token=1234567890')).toBe('/accept-invite?token=1234567890');
  });
});
