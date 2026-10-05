import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import {
  CHOOSE_PASSWORD_PATH,
  needsPasswordChange,
  passwordChangedMetadata,
  passwordProblem,
} from '@/lib/password-change';

const updateUser = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { auth: { updateUser: (...args: unknown[]) => updateUser(...args) } },
}));

const authState: { user: Record<string, unknown> | null; signOut: ReturnType<typeof vi.fn> } = { user: null, signOut: vi.fn() };
vi.mock('@/hooks/useAuth', () => ({
  useAuth: () => ({
    user: authState.user, session: null, loading: false, isAllowed: true,
    signIn: vi.fn(), signOut: authState.signOut, privacyLock: vi.fn(),
    sessionTimeoutMinutes: 0, setSessionTimeoutMinutes: vi.fn(),
  }),
}));

const toast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast }) }));

import ChoosePassword from '@/pages/ChoosePassword';
import { PasswordGate } from '@/components/PasswordGate';

const temporaryLogin = { id: 'u-1', email: 'lucia@example.com', user_metadata: { must_change_password: true } };
const settledLogin = { id: 'u-2', email: 'jill@example.com', user_metadata: { must_change_password: false } };

function WhereAmI() {
  const location = useLocation();
  return <div>at:{location.pathname}</div>;
}

function renderGate(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WhereAmI />
      <Routes>
        <Route path="*" element={<PasswordGate><div>the app</div></PasswordGate>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('temporary-password helpers', () => {
  it('reads the provisioning flag from user metadata only', () => {
    expect(needsPasswordChange(temporaryLogin)).toBe(true);
    expect(needsPasswordChange({ user_metadata: { must_change_password: 'true' } })).toBe(true);
    expect(needsPasswordChange(settledLogin)).toBe(false);
    expect(needsPasswordChange({ user_metadata: {} })).toBe(false);
    expect(needsPasswordChange(null)).toBe(false);
    expect(needsPasswordChange(undefined)).toBe(false);
  });

  it('refuses short or mismatched passwords before any request', () => {
    expect(passwordProblem('short', 'short')).toMatch(/at least 8/);
    expect(passwordProblem('longenough1', 'longenough2')).toMatch(/do not match/);
    expect(passwordProblem('longenough1', 'longenough1')).toBeNull();
  });

  it('clears the flag in the metadata patch that rides with the password change', () => {
    const patch = passwordChangedMetadata();
    expect(patch.must_change_password).toBe(false);
    expect(typeof patch.password_changed_at).toBe('string');
  });
});

describe('PasswordGate', () => {
  it('sends a login on its temporary password to /choose-password before the app opens', () => {
    authState.user = temporaryLogin;
    renderGate('/timesheet');
    expect(screen.getByText(`at:${CHOOSE_PASSWORD_PATH}`)).toBeTruthy();
  });

  it('lets a settled login straight through', () => {
    authState.user = settledLogin;
    renderGate('/timesheet');
    expect(screen.getByText('at:/timesheet')).toBeTruthy();
    expect(screen.getByText('the app')).toBeTruthy();
  });
});

describe('ChoosePassword page', () => {
  beforeEach(() => {
    updateUser.mockReset();
    toast.mockReset();
    authState.user = temporaryLogin;
    authState.signOut = vi.fn();
  });

  function fill(password: string, confirm: string) {
    fireEvent.change(screen.getByLabelText('New password'), { target: { value: password } });
    fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: confirm } });
    fireEvent.click(screen.getByRole('button', { name: 'Save password' }));
  }

  it('saves the new password and clears the flag in the same request', async () => {
    updateUser.mockResolvedValue({ data: {}, error: null });
    render(<MemoryRouter><ChoosePassword /></MemoryRouter>);
    expect(screen.getByText('Choose your password')).toBeTruthy();
    fill('longenough1', 'longenough1');
    await waitFor(() => expect(updateUser).toHaveBeenCalledTimes(1));
    expect(updateUser).toHaveBeenCalledWith({
      password: 'longenough1',
      data: expect.objectContaining({ must_change_password: false }),
    });
    await waitFor(() => expect(screen.getByText('Password saved')).toBeTruthy());
    expect(toast).not.toHaveBeenCalled();
  });

  it('never sends a mismatched pair to the server', async () => {
    render(<MemoryRouter><ChoosePassword /></MemoryRouter>);
    fill('longenough1', 'longenough2');
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('shows the server refusal (for example, reusing the temporary password) and stays on the form', async () => {
    updateUser.mockResolvedValue({ data: {}, error: new Error('New password should be different from the old password.') });
    render(<MemoryRouter><ChoosePassword /></MemoryRouter>);
    fill('longenough1', 'longenough1');
    await waitFor(() => expect(toast).toHaveBeenCalledTimes(1));
    expect(toast.mock.calls[0][0].description).toMatch(/different from the old password/);
    expect(screen.getByRole('button', { name: 'Save password' })).toBeTruthy();
  });

  it('offers a way out for the wrong person', () => {
    render(<MemoryRouter><ChoosePassword /></MemoryRouter>);
    fireEvent.click(screen.getByRole('button', { name: 'Not you? Sign out' }));
    expect(authState.signOut).toHaveBeenCalledTimes(1);
  });
});
