import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AcceptInvite from '@/pages/AcceptInvite';

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  signUp: vi.fn(),
  signInWithPassword: vi.fn(),
  toast: vi.fn(),
  authState: {
    user: null as { email?: string | null } | null,
    loading: true,
  },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    auth: {
      signUp: mocks.signUp,
      signInWithPassword: mocks.signInWithPassword,
    },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => mocks.authState,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(res => {
    resolve = res;
  });
  return { promise, resolve };
}

const renderInvite = () => render(
  <MemoryRouter initialEntries={['/accept-invite?token=valid-test-token-12345']}>
    <AcceptInvite />
  </MemoryRouter>,
);

describe('AcceptInvite', () => {
  beforeEach(() => {
    mocks.invoke.mockReset();
    mocks.signUp.mockReset();
    mocks.signInWithPassword.mockReset();
    mocks.toast.mockReset();
    mocks.authState.user = null;
    mocks.authState.loading = true;
  });

  afterEach(() => cleanup());

  it('looks up a token once even when auth settles before the lookup finishes', async () => {
    const lookup = deferred<{
      data: {
        invite: {
          email: string;
          role: string;
          invited_name: string;
          expires_at: string;
          accepted_at: null;
          orgs: { name: string };
        };
      };
      error: null;
    }>();
    mocks.invoke.mockReturnValueOnce(lookup.promise);

    const view = renderInvite();
    await waitFor(() => expect(mocks.invoke).toHaveBeenCalledTimes(1));

    mocks.authState.loading = false;
    view.rerender(
      <MemoryRouter initialEntries={['/accept-invite?token=valid-test-token-12345']}>
        <AcceptInvite />
      </MemoryRouter>,
    );

    expect(mocks.invoke).toHaveBeenCalledTimes(1);

    await act(async () => {
      lookup.resolve({
        data: {
          invite: {
            email: 'team@example.com',
            role: 'employee',
            invited_name: 'Test Teammate',
            expires_at: '2099-01-01T00:00:00.000Z',
            accepted_at: null,
            orgs: { name: 'Test Office' },
          },
        },
        error: null,
      });
      await lookup.promise;
    });

    expect(await screen.findByText('Join Test Office')).toBeInTheDocument();
    expect(screen.queryByText('Loading invite...')).not.toBeInTheDocument();
    expect(mocks.invoke).toHaveBeenCalledTimes(1);
  });
});
