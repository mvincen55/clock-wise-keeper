import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// A non-manager going through onboarding must NOT be able to create or change
// their canonical staff code. This proves the onboarding Basics step neither
// exposes an editable code nor writes employees.tag.

const mutateAsync = vi.fn().mockResolvedValue(undefined);
const myStaffCode = { code: null as string | null, isLoading: false };

vi.mock('@/hooks/useOnboarding', () => ({
  useSaveBasics: () => ({ mutateAsync, isPending: false, isReady: true }),
}));

vi.mock('@/hooks/useStaffCodes', () => ({
  useMyStaffCode: () => myStaffCode,
}));

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { error: vi.fn(), success: vi.fn() }) }));

import { BasicsStep } from '@/pages/Onboarding';

describe('Onboarding Basics — staff code is manager-assigned only', () => {
  beforeEach(() => {
    mutateAsync.mockClear();
    myStaffCode.code = null;
  });

  it('shows a read-only assigned code and never an editable staff-code field', () => {
    myStaffCode.code = 'MEG';
    render(<BasicsStep onDone={() => {}} />);

    // The assigned code is shown read-only.
    expect(screen.getByText('MEG')).toBeTruthy();
    // There is no editable tag/staff-code input (only "What should we call you?").
    const inputs = screen.getAllByRole('textbox');
    expect(inputs).toHaveLength(1);
    expect((inputs[0] as HTMLInputElement).id).toBe('preferred');
  });

  it('prompts to wait for a manager when no code is assigned', () => {
    render(<BasicsStep onDone={() => {}} />);
    expect(screen.getByText(/office manager still needs to assign your staff code/i)).toBeTruthy();
  });

  it('saving never writes a staff code (tag) from onboarding', async () => {
    const onDone = vi.fn();
    render(<BasicsStep onDone={onDone} />);

    fireEvent.change(screen.getByLabelText(/what should we call you/i), { target: { value: 'Sol' } });
    fireEvent.click(screen.getByRole('button', { name: /continue/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const payload = mutateAsync.mock.calls[0][0];
    expect(payload).not.toHaveProperty('tag');
    expect(payload).toMatchObject({ preferred_name: 'Sol', markStep: true });
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});
