import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';

const rpc = vi.fn();
const signOut = vi.fn();
let authCallback: ((event: string, session: Session | null) => void) | null = null;
let initialSession: Session | null = null;

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: (...args: any[]) => rpc(...args),
    auth: {
      onAuthStateChange: (cb: any) => {
        authCallback = cb;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      getSession: () => Promise.resolve({ data: { session: initialSession } }),
      signOut: (...args: any[]) => signOut(...args),
    },
  },
}));

import { AuthProvider, useAuth } from '@/hooks/useAuth';

const makeSession = (userId: string, token: string): Session =>
  ({
    access_token: token,
    user: { id: userId, email: `${userId}@example.com` },
  } as unknown as Session);

// Records unmounts: patient info in FofBuilder / BrokenAppointments lives in
// component state only, so an unmount is exactly the data-loss condition.
const unmountEvents: string[] = [];
function Workspace({ token }: { token: string }) {
  useEffect(() => () => { unmountEvents.push('unmounted'); }, []);
  return <div>workspace:{token}</div>;
}

// Same gate semantics as ProtectedRoute in App.tsx.
function Gate() {
  const { loading, isAllowed, session } = useAuth();
  if (loading) return <div>spinner</div>;
  if (!isAllowed) return <div>signed-out</div>;
  return <Workspace token={session?.access_token ?? 'none'} />;
}

function SignOutButton() {
  const { signOut: doSignOut } = useAuth();
  return <button onClick={() => doSignOut()}>sign out</button>;
}

describe('auth refocus must not remount the workspace', () => {
  beforeEach(() => {
    rpc.mockReset();
    signOut.mockReset();
    signOut.mockResolvedValue({ error: null });
    rpc.mockResolvedValue({ data: true, error: null });
    authCallback = null;
    initialSession = null;
    unmountEvents.length = 0;
  });

  it('re-auth of the vetted user updates the session silently: no spinner, no RPC, no unmount', async () => {
    initialSession = makeSession('user-a', 'token-1');
    render(<AuthProvider><Gate /></AuthProvider>);

    // Cold start runs the allowlist check once.
    await waitFor(() => expect(screen.getByText('workspace:token-1')).toBeTruthy());
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('is_allowed_user');

    // Tab refocus / token refresh: supabase re-emits the session for the same
    // user (event name varies — SIGNED_IN or TOKEN_REFRESHED).
    act(() => authCallback!('SIGNED_IN', makeSession('user-a', 'token-2')));
    act(() => authCallback!('TOKEN_REFRESHED', makeSession('user-a', 'token-3')));

    // The refreshed session is visible immediately, with no loading flip in
    // between (a flip would have unmounted Workspace) and no repeat RPC.
    expect(screen.getByText('workspace:token-3')).toBeTruthy();
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(unmountEvents).toEqual([]);
  });

  it('sign-out still lands on the gate, and a fresh sign-in re-runs the allowlist check', async () => {
    initialSession = makeSession('user-a', 'token-1');
    render(<AuthProvider><Gate /><SignOutButton /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('workspace:token-1')).toBeTruthy());
    expect(rpc).toHaveBeenCalledTimes(1);

    await act(async () => { screen.getByText('sign out').click(); });
    expect(signOut).toHaveBeenCalledTimes(1);
    // supabase fires SIGNED_OUT after its signOut() resolves.
    act(() => authCallback!('SIGNED_OUT', null));
    expect(screen.getByText('signed-out')).toBeTruthy();

    // Signing back in — even as the same user — is a cold start again: the
    // allowlist check must re-run (spinner while it does is expected).
    act(() => authCallback!('SIGNED_IN', makeSession('user-a', 'token-4')));
    expect(screen.getByText('spinner')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('workspace:token-4')).toBeTruthy());
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('a session for a different user goes through the full check', async () => {
    initialSession = makeSession('user-a', 'token-1');
    render(<AuthProvider><Gate /></AuthProvider>);
    await waitFor(() => expect(screen.getByText('workspace:token-1')).toBeTruthy());
    expect(rpc).toHaveBeenCalledTimes(1);

    act(() => authCallback!('SIGNED_IN', makeSession('user-b', 'token-9')));
    await waitFor(() => expect(screen.getByText('workspace:token-9')).toBeTruthy());
    expect(rpc).toHaveBeenCalledTimes(2);
  });
});
