import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import EditEmployeeDialog from '@/components/team/EditEmployeeDialog';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('@/hooks/useEmployees', () => ({
  useUpdateEmployeeDetails: () => ({ mutateAsync, isPending: false }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

const employee = { id: 'employee-1', display_name: 'Jane Smith', email: null };
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
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Janet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: employee.id, title: '', first_name: 'Janet', middle_initial: '', last_name: 'Smith', email: null, contact: expect.any(Object) }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('can add an email later', async () => {
    mutateAsync.mockResolvedValue({ id: employee.id });
    openEditor();
    fireEvent.change(screen.getByLabelText('Email (optional)'), { target: { value: 'jane@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ id: employee.id, title: '', first_name: 'Jane', middle_initial: '', last_name: 'Smith', email: 'jane@example.com', contact: expect.any(Object) }));
  });

  it('discards canceled edits and prevents blank names', () => {
    openEditor();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: '   ' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getByLabelText('First name')).toHaveValue('Jane');
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('requires a surname and accepts an optional middle initial', async () => {
    mutateAsync.mockResolvedValue(employee.id);
    openEditor();
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: '' } });
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Smith' } });
    fireEvent.change(screen.getByLabelText('Middle initial (optional)'), { target: { value: 'A' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ middle_initial: 'A' })));
  });

  it('loads and updates address and both phone numbers', async () => {
    mutateAsync.mockResolvedValue(employee.id);
    render(<EditEmployeeDialog employee={{ ...employee, phone: '202-555-0100', address_line1: '10 Example Street' }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getByLabelText('Phone number')).toHaveValue('202-555-0100');
    expect(screen.getByLabelText('Street address')).toHaveValue('10 Example Street');
    fireEvent.change(screen.getByLabelText('Alternate phone number'), { target: { value: '202-555-0101' } });
    fireEvent.change(screen.getByLabelText('Street address'), { target: { value: '20 Example Street' } });
    fireEvent.change(screen.getByLabelText('Contact name'), { target: { value: 'Alex Smith' } });
    fireEvent.change(screen.getByLabelText('Relationship'), { target: { value: 'Sibling' } });
    fireEvent.change(screen.getByLabelText('Emergency contact phone'), { target: { value: '202-555-0102' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({
      contact: expect.objectContaining({ phone: '202-555-0100', alternate_phone: '202-555-0101', address_line1: '20 Example Street', emergency_contact_name: 'Alex Smith', emergency_contact_relationship: 'Sibling', emergency_contact_phone: '202-555-0102' }),
    })));
  });

  it('keeps a doctor as "Dr." plus first name while the full name stays editable', async () => {
    mutateAsync.mockResolvedValue('employee-2');
    render(<EditEmployeeDialog employee={{ id: 'employee-2', display_name: 'Dr. Robert', title: 'Dr.', first_name: 'Robert', middle_initial: null, last_name: 'Harelick', email: null }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit details' }));
    expect(screen.getByLabelText('Title (optional)')).toHaveValue('Dr.');
    expect(screen.getByLabelText('First name')).toHaveValue('Robert');
    expect(screen.getByLabelText('Last name')).toHaveValue('Harelick');
    expect(screen.getByText('Dr. Robert')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Last name'), { target: { value: 'Harelick-Smith' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ id: 'employee-2', title: 'Dr.', first_name: 'Robert', last_name: 'Harelick-Smith' })));
  });

  it('offers Dr. as a title for anyone and previews the name the office will see', async () => {
    mutateAsync.mockResolvedValue(employee.id);
    openEditor();
    expect(screen.getByLabelText('Title (optional)')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Title (optional)'), { target: { value: 'Dr.' } });
    expect(screen.getByText('Dr. Jane')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith(expect.objectContaining({ title: 'Dr.', first_name: 'Jane', last_name: 'Smith' })));
  });

  it('keeps edits available when saving fails', async () => {
    mutateAsync.mockRejectedValue(new Error('Save failed'));
    openEditor();
    fireEvent.change(screen.getByLabelText('First name'), { target: { value: 'Janet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Save failed');
    expect(screen.getByLabelText('First name')).toHaveValue('Janet');
  });
});
