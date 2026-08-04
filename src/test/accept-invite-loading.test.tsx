import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const invoke = vi.fn();
const authState = { user: null as any, loading: true };

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: (...args: any[]) => invoke(...args) },
    auth: { signUp: vi.fn(), signInWithPassword: vi.fn() },
  },
}));

vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => authState,
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

import AcceptInvite from '@/pages/AcceptInvite';

const invite = {
  email: 'person@example.com',
  role: 'employee',
  invited_name: 'Person',
  expires_at: new Date(Date.now() + 86400000).toISOString(),
  accepted_at: null,
  org_id: 'org-1',
  orgs: { name: 'Test Office' },
};

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/accept-invite?token=abcdef123456']}>
      <AcceptInvite />
    </MemoryRouter>,
  );
}

describe('AcceptInvite loading behaviour', () => {
  beforeEach(() => {
    invoke.mockReset();
    authState.user = null;
    authState.loading = true;
  });

  it('does not fire the lookup until auth has settled, then renders the join form once', async () => {
    invoke.mockResolvedValue({ data: { invite }, error: null });

    const view = renderPage();
    expect(invoke).not.toHaveBeenCalled();
    expect(screen.getByText(/Loading invite/i)).toBeTruthy();

    // Auth settles (slow-auth case)
    authState.loading = false;
    view.rerender(
      <MemoryRouter initialEntries={['/accept-invite?token=abcdef123456']}>
        <AcceptInvite />
      </MemoryRouter>,
    );

    await waitFor(() => expect(screen.getByText(/Join Test Office/i)).toBeTruthy());
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('stays off the spinner when re-renders overlap a slow lookup', async () => {
    authState.loading = false;
    let resolveLookup: (v: any) => void = () => {};
    invoke.mockImplementation(
      () => new Promise((res) => { resolveLookup = res; }),
    );

    const view = renderPage();
    // Extra renders while the first lookup is still in flight must not
    // start additional lookups.
    view.rerender(
      <MemoryRouter initialEntries={['/accept-invite?token=abcdef123456']}>
        <AcceptInvite />
      </MemoryRouter>,
    );
    expect(invoke).toHaveBeenCalledTimes(1);

    resolveLookup({ data: { invite }, error: null });

    await waitFor(() => expect(screen.getByText(/Join Test Office/i)).toBeTruthy());
    expect(screen.queryByText(/Loading invite/i)).toBeNull();
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('shows an error state when the lookup throws', async () => {
    authState.loading = false;
    invoke.mockRejectedValue(new Error('network down'));

    renderPage();

    await waitFor(() => expect(screen.getByText(/Invite Error/i)).toBeTruthy());
    expect(screen.queryByText(/Loading invite/i)).toBeNull();
  });
});
