import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import FofBuilder from '@/pages/FofBuilder';
import { LIVE_TEMPLATES, PRACTICE_DEFAULT_BRANDING } from './blank-form-fixtures';
import { harelickPolicyTemplate } from '@/lib/fof/payment-policy';
import { transferableAbortController } from 'node:util';

// Node's Request (used by the data router) needs Node's signal, not jsdom's.
vi.stubGlobal('AbortController', class { constructor() { return transferableAbortController(); } });

const mocks = vi.hoisted(() => ({ invoke: vi.fn(), error: vi.fn(), token: 'one' }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('sonner', () => ({ toast: { error: mocks.error, success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'staff-a' }, session: { access_token: mocks.token } }) }));
vi.mock('@/hooks/useMyProfile', () => ({ useMyProfile: () => ({ data: null }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'org-a', user_id: 'staff-a', role: 'manager' } }) }));
vi.mock('@/hooks/useFofPolicySettings', () => ({ useFofPolicySettings: () => ({ data: { payment_policy: harelickPolicyTemplate() } }), usePaymentClassifications: () => ({ data: { D2740: 'restoration' } }) }));
vi.mock('@/hooks/useFofTemplates', () => ({ useFofTemplates: () => ({ data: LIVE_TEMPLATES }), useFofSettings: () => ({ data: undefined }) }));
vi.mock('@/hooks/useOrgBranding', () => ({ useOrgBranding: () => ({ data: PRACTICE_DEFAULT_BRANDING }) }));
vi.mock('@/hooks/useFeeSchedules', () => ({
  useFeeSchedules: () => ({ data: [] }), useCodeNames: () => ({ data: {} }), useFeeScheduleItems: () => ({ data: [] }),
  useProcedureBundles: () => ({ data: [] }), useSaveProcedureBundle: () => ({}), useDeleteProcedureBundle: () => ({}),
}));
vi.mock('@/components/fof/FofAssistantWidget', () => ({ default: () => null }));
vi.mock('@/components/ScaledPrintPreview', () => ({ default: () => null }));

function mount() {
  const router = createMemoryRouter([
    { path: '/fof', element: <FofBuilder /> },
    { path: '/fof/fees', element: <div>Fees destination</div> },
    { path: '/previous', element: <div>Previous destination</div> },
  ], { initialEntries: ['/previous', '/fof'], initialIndex: 1 });
  render(<RouterProvider router={router} />);
  return router;
}
beforeEach(() => { mocks.invoke.mockReset(); mocks.error.mockReset(); mocks.token = 'one'; mocks.invoke.mockResolvedValue({ data: {} }); });
const leave = () => fireEvent.click(screen.getByRole('link', { name: 'Fees & Plans' }));

describe('memory-only FOF navigation', () => {
  it('allows a clean form to leave without warning', async () => {
    mount(); leave();
    expect(await screen.findByText('Fees destination')).toBeTruthy();
    expect(screen.queryByText('Leave and erase this form?')).toBeNull();
  });
  it('internal link Stay preserves inputs; Leave discards them', async () => {
    mount();
    fireEvent.change(screen.getByLabelText('Patient Name'), { target: { value: 'Synthetic Patient' } });
    leave();
    expect(await screen.findByText('Leave and erase this form?')).toBeTruthy();
    fireEvent.click(screen.getByText('Stay here'));
    expect(screen.getByLabelText('Patient Name')).toHaveValue('Synthetic Patient');
    leave(); fireEvent.click(screen.getByText('Leave and erase'));
    expect(await screen.findByText('Fees destination')).toBeTruthy();
    expect(screen.queryByLabelText('Patient Name')).toBeNull();
  });
  it('browser Back, reset, and reload warnings obey dirty state', async () => {
    const router = mount();
    fireEvent.change(screen.getByLabelText('Patient Name'), { target: { value: 'Synthetic Patient' } });
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload); expect(unload.defaultPrevented).toBe(true);
    await act(async () => { await router.navigate(-1); });
    fireEvent.click(await screen.findByText('Stay here'));
    fireEvent.click(screen.getByRole('button', { name: /Clear form/i }));
    expect(screen.getByLabelText('Patient Name')).toHaveValue('');
    const cleanUnload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanUnload); expect(cleanUnload.defaultPrevented).toBe(false);
    await act(async () => { await router.navigate(-1); });
    expect(await screen.findByText('Previous destination')).toBeTruthy();
  });
  it('payment edits and same-user refresh survive Stay', async () => {
    const router = mount();
    fireEvent.change(screen.getByPlaceholderText('D2740 / crown'), { target: { value: 'D2740' } });
    fireEvent.click(screen.getByText('Amounts & Payment Plan'));
    const paid = screen.getByLabelText(/^Paid /);
    fireEvent.change(paid, { target: { value: '25' } });
    mocks.token = 'refreshed';
    await act(async () => { await router.revalidate(); });
    leave(); fireEvent.click(await screen.findByText('Stay here'));
    expect(screen.getByLabelText(/^Paid /)).toHaveValue('25');
    expect(screen.getByPlaceholderText('D2740 / crown')).toHaveValue('D2740');
  });
});

it('an incomplete extraction cannot enter the successful UI import path; retry can', async () => {
  mount();
  const input = document.querySelector<HTMLInputElement>('input[type=file]')!;
  const file = new File(['synthetic-image'], 'synthetic.png', { type: 'image/png' });
  mocks.invoke.mockResolvedValueOnce({ data: { status: 'incomplete', rows: [{ code: 'D2740' }], error: 'Nothing was imported. Retry.' } });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(mocks.error).toHaveBeenCalledWith('Nothing was imported. Retry.'));
  expect(screen.getByPlaceholderText('D2740 / crown')).toHaveValue('');
  mocks.invoke.mockResolvedValueOnce({ data: { status: 'complete', rows: [{ code: 'D2740', tooth: '3', description: 'Crown', fee: 100, officeFee: null, entryDate: '', visit: 5 }] } });
  fireEvent.change(input, { target: { files: [file] } });
  await waitFor(() => expect(screen.getByPlaceholderText('D2740 / crown')).toHaveValue('D2740'));
});
