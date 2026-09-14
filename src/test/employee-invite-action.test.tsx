import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import EmployeeInviteAction from '@/components/team/EmployeeInviteAction';
const state = vi.hoisted(() => ({ invites: [] as any[] }));
vi.mock('@/hooks/usePendingInvites', () => ({ usePendingInvites: () => ({ data: state.invites }) }));
vi.mock('@/hooks/useOperationalRoles', () => ({ useOperationalRoles: () => ({ data: new Map() }) }));
vi.mock('@/components/InviteEmployeeModal', () => ({ default: ({ initial, defaults }: any) => <div role="dialog">{initial ? 'Resending' : 'Inviting'} {defaults.email}</div> }));
const employee = { id: 'e', display_name: 'Alex', email: 'alex@example.com', user_id: null };
afterEach(cleanup);
beforeEach(() => { state.invites = []; });
describe('existing employee invitations', () => {
  it('opens an invite prefilled for the existing employee', () => {
    render(<EmployeeInviteAction employee={employee} />);
    fireEvent.click(screen.getByRole('button', { name: 'Send invite' }));
    expect(screen.getByRole('dialog').textContent).toBe('Inviting alex@example.com');
  });
  it('offers resend for an existing invite including expired invites', () => {
    state.invites = [{ email: 'Alex@Example.com', expires_at: '2020-01-01' }];
    render(<EmployeeInviteAction employee={employee} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resend invite' }));
    expect(screen.getByRole('dialog').textContent).toBe('Resending alex@example.com');
  });
  it('explains how to invite an employee without an email', () => {
    render(<EmployeeInviteAction employee={{ ...employee, email: null }} />);
    expect(screen.getByText(/Add an email in Edit details/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('does not invite a person who already has a login', () => {
    render(<EmployeeInviteAction employee={{ ...employee, user_id: 'u' }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
