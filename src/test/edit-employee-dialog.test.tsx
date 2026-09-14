import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditEmployeeDialog from '@/components/team/EditEmployeeDialog';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('@/hooks/useEmployees', () => ({
  useUpdateEmployeeDetails: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const employee = { id: 'employee-1', display_name: 'Jane', email: null };
beforeEach(() => { mutateAsync.mockReset(); });
afterEach(cleanup);

function openEditor() {
  render(<EditEmployeeDialog employee={employee} />);
  fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
}

describe('editing team contact details', () => {
  it('saves a corrected name with no email', async () => {
    mutateAsync.mockResolvedValue({ id: employee.id });
    openEditor();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jane Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: employee.id, display_name: 'Jane Smith', email: null }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('can add an email later', async () => {
    mutateAsync.mockResolvedValue({ id: employee.id });
    openEditor();
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'jane@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: employee.id, display_name: 'Jane', email: 'jane@example.com' }));
  });

  it('discards canceled edits and prevents blank names', () => {
    openEditor();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getByLabelText('Name')).toHaveValue('Jane');
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('keeps edits available when saving fails', async () => {
    mutateAsync.mockRejectedValue(new Error('Save failed'));
    openEditor();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Jane Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.getByLabelText('Name')).toHaveValue('Jane Smith');
  });
});
