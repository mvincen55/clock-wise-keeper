import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import InviteEmployeeModal from '@/components/InviteEmployeeModal';
const invoke = vi.hoisted(() => vi.fn(async () => ({ data: { emailed: true, link: 'https://example.com/invite' }, error: null })));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke } } }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'org' } }) }));
vi.mock('@/hooks/usePendingInvites', () => ({ usePendingInvites: () => ({ refetch: vi.fn() }) }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
afterEach(cleanup);
describe('inviting an existing roster member', () => {
  it('keeps their email fixed and sends no replacement starting schedule or PTO', async () => {
    render(<InviteEmployeeModal open defaults={{ email: 'alex@example.com', invited_name: 'Alex', role: 'employee', operational_role: 'front_desk', secondary_roles: [], start_date: null, initial_pto_hours: null, weekly_schedule: [] }} />);
    expect((screen.getByDisplayValue('alex@example.com') as HTMLInputElement).readOnly).toBe(true);
    expect(screen.queryByText('Onboarding details (optional)')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Send Invite Email' }));
    await waitFor(() => expect(invoke).toHaveBeenCalled());
    expect(invoke.mock.calls[0]).toEqual(['send-org-invite', { body: {
      email: 'alex@example.com', role: 'employee', name: 'Alex', operationalRole: 'front_desk', secondaryRoles: [],
      startDate: null, initialPtoHours: null, schedule: [], origin: window.location.origin,
    } }]);
    expect(await screen.findByRole('button', { name: 'Done' })).toBeTruthy();
  });
});
