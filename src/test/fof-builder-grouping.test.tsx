import { beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import FofBuilder from '@/pages/FofBuilder';
import { LIVE_TEMPLATES, PRACTICE_DEFAULT_BRANDING } from './blank-form-fixtures';
import { harelickPolicyTemplate } from '@/lib/fof/payment-policy';
import { transferableAbortController } from 'node:util';

// Node's Request (used by the data router) needs Node's signal, not jsdom's.
vi.stubGlobal('AbortController', class { constructor() { return transferableAbortController(); } });

const mocks = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@/lib/fof/local-treatment-import', () => ({ readLocalTreatment: vi.fn() }));
vi.mock('@/hooks/useFofOfficeGuidance', () => ({ useFofOfficeGuidance: () => ({ data: { recipes: [], warnings: [] }, isFetching: false, refetch: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'staff-a' }, session: { access_token: 'one' } }) }));
vi.mock('@/hooks/useMyProfile', () => ({ useMyProfile: () => ({ data: null }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { org_id: 'org-a', user_id: 'staff-a', role: 'manager' } }) }));
vi.mock('@/hooks/useFofPolicySettings', () => ({
  useFofPolicySettings: () => ({ data: { payment_policy: harelickPolicyTemplate() } }),
  usePaymentClassifications: () => ({ data: { D0367: 'workup', D0470: 'workup', D6010: 'implant', D6011: 'implant', D6057: 'restoration', D6059: 'restoration' } }),
}));
vi.mock('@/hooks/useFofTemplates', () => ({ useFofTemplates: () => ({ data: LIVE_TEMPLATES }), useFofSettings: () => ({ data: undefined }) }));
vi.mock('@/hooks/useOrgBranding', () => ({ useOrgBranding: () => ({ data: PRACTICE_DEFAULT_BRANDING }) }));
vi.mock('@/hooks/useFeeSchedules', () => ({
  useFeeSchedules: () => ({ data: [] }), useCodeNames: () => ({ data: {} }), useFeeScheduleItems: () => ({ data: [] }),
  useProcedureBundles: () => ({ data: [] }), useSaveProcedureBundle: () => ({}), useDeleteProcedureBundle: () => ({}),
}));
vi.mock('@/components/fof/FofAssistantWidget', () => ({ default: () => null }));
vi.mock('@/components/ScaledPrintPreview', () => ({ default: () => null }));

function mount() {
  const router = createMemoryRouter([{ path: '/fof', element: <FofBuilder /> }], { initialEntries: ['/fof'] });
  render(<RouterProvider router={router} />);
}

/** Type codes and fees without touching the Visit box, as staff usually do. */
function addProcedures(rows: { code: string; fee: string }[]) {
  rows.forEach((row, i) => {
    if (i > 0) fireEvent.click(screen.getByRole('button', { name: /Add Procedure/ }));
    const codes = screen.getAllByPlaceholderText('D2740 / crown');
    fireEvent.change(codes[i], { target: { value: row.code } });
    const fees = screen.getAllByPlaceholderText('$0.00');
    fireEvent.change(fees[i], { target: { value: row.fee } });
  });
}

beforeEach(() => { mocks.invoke.mockReset(); mocks.invoke.mockResolvedValue({ data: {} }); });

describe('payment groups follow the appointment the office copy prints', () => {
  it('groups untyped lines by their suggested visit instead of one group per code', () => {
    mount();
    addProcedures([
      { code: 'D0367', fee: '520' }, { code: 'D0470', fee: '256' },
      { code: 'D6010', fee: '2717' }, { code: 'D6011', fee: '492' },
      { code: 'D6057', fee: '1141' }, { code: 'D6059', fee: '1927' },
    ]);
    fireEvent.click(screen.getByText('Amounts & Payment Plan'));
    // Work-up (visit 1), implant surgery (visit 2), implant restoration (visit 3).
    const groups = screen.getAllByLabelText(/^Treatment name /);
    expect(groups).toHaveLength(3);
    const payments = screen.getAllByLabelText(/^Payment amount /).map(el => (el as HTMLInputElement).value);
    // One work-up payment, implant halves, restoration thirds — and nothing per code.
    expect(payments).toEqual(['776.00', '1604.50', '1604.50', '1022.67', '1022.67', '1022.66']);
    expect(screen.queryByText(/Review required before printing/)).toBeNull();
  });
  it('explains a paused preview and lets staff classify an unregistered code in one click', () => {
    mount();
    addProcedures([{ code: 'D5750', fee: '400' }]);
    // D5750 has no saved classification, so the schedule cannot be built yet.
    expect(screen.getByText(/Preview paused/)).toBeTruthy();
    // The reason is named in the preview notice (the collapsed editor repeats it).
    expect(screen.getAllByText(/Classify payment group/).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Use Denture / partial for this form' }));
    expect(screen.queryByText(/Preview paused/)).toBeNull();
    expect(screen.getByRole('button', { name: /^Print$/ })).toBeEnabled();
    fireEvent.click(screen.getByText('Amounts & Payment Plan'));
    expect(screen.getAllByLabelText(/^Payment amount /).map(el => (el as HTMLInputElement).value)).toEqual(['200.00', '200.00']);
  });
  it('still keeps a typed visit number authoritative', () => {
    mount();
    addProcedures([{ code: 'D6010', fee: '2717' }, { code: 'D6011', fee: '492' }]);
    const visits = screen.getAllByPlaceholderText(/^\d+$/);
    fireEvent.change(visits[1], { target: { value: '4' } });
    fireEvent.click(screen.getByText('Amounts & Payment Plan'));
    expect(screen.getAllByLabelText(/^Treatment name /)).toHaveLength(2);
  });
});
