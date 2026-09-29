import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import FofBuilder from '@/pages/FofBuilder';
import { LIVE_TEMPLATES, PRACTICE_DEFAULT_BRANDING } from './blank-form-fixtures';
import { harelickPolicyTemplate } from '@/lib/fof/payment-policy';
import { transferableAbortController } from 'node:util';

/**
 * The repaired seams of the Financial Options Form builder, driven through
 * the real page with the office data mocked at the hook boundary:
 * saved-plan hydration and benefits confirmation, fees that load after a
 * code was typed, failed or inactive schedules, code and carrier changes
 * that clear stale values (with a deliberate restore), provenance chips,
 * bounded insurance overrides, negative balances, single courtesies,
 * automatic naming on the policy path, print modes, and the privacy of
 * every request the page makes.
 */
vi.stubGlobal('AbortController', class { constructor() { return transferableAbortController(); } });
Element.prototype.scrollIntoView ??= () => {};
Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.releasePointerCapture ??= () => {};

const ORG = '11111111-1111-4111-8111-111111111111';
type Item = { id: string; scheduleId: string; code: string; description: string; feeCents: number; category: string; isOfficeFee: boolean; notes: string };
const item = (scheduleId: string, code: string, feeCents: number, category = 'major', isOfficeFee = false): Item =>
  ({ id: `${scheduleId}-${code}`, scheduleId, code, description: `${code} description`, feeCents, category, isOfficeFee, notes: '' });
const OFFICE_ITEMS = [item('office', 'D2740', 156_900), item('office', 'D2750', 140_000), item('office', 'D2392', 33_500, 'basic'), item('office', 'D0120', 6_500, 'preventive'), item('office', 'D6010', 271_700), item('office', 'D0367', 52_000, 'workup'), item('office', 'D9999', 0)];
const DELTA_ITEMS = [item('delta', 'D2740', 126_167), item('delta', 'D2750', 120_000), item('delta', 'D2392', 20_069, 'basic'), item('delta', 'D2150', 14_540, 'basic'), item('delta', 'D0120', 4_355, 'preventive'), item('delta', 'D6010', 216_341), item('delta', 'D0367', 52_000, 'workup', true)];
const BCBS_ITEMS = [item('bcbs', 'D2740', 128_690), item('bcbs', 'D2750', 0), item('bcbs', 'D2392', 19_870, 'basic'), item('bcbs', 'D0120', 4_130, 'preventive')];

const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  toast: { error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() },
  schedules: { data: [] as unknown[], isLoading: false, error: null as null | Error, refetch: vi.fn() },
  items: {} as Record<string, { data?: unknown[]; isLoading?: boolean; error?: null | Error; refetch?: () => void }>,
  plans: { data: [] as unknown[], isLoading: false, error: null as null | Error, refetch: vi.fn() },
  policy: { data: { payment_policy: null as unknown, day_of_service_threshold_cents: 100_000, min_standalone_payment_cents: 10_000, downgrade_default_on: false } as Record<string, unknown>, isLoading: false, error: null as null | Error, refetch: vi.fn() },
  templates: [] as unknown[],
  practice: { data: null as unknown, isLoading: false, error: null as null | Error, refetch: vi.fn() },
  org: { org_id: '11111111-1111-4111-8111-111111111111', user_id: 'staff-a', role: 'employee' },
}));
vi.mock('@/lib/fof/local-treatment-import', async importOriginal => ({ ...(await importOriginal<typeof import('@/lib/fof/local-treatment-import')>()), readLocalTreatment: vi.fn() }));
vi.mock('@/hooks/useFofOfficeGuidance', () => ({ useFofOfficeGuidance: () => ({ data: { recipes: [], warnings: [] }, isFetching: false, refetch: vi.fn() }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { functions: { invoke: mocks.invoke } } }));
vi.mock('sonner', () => ({ toast: mocks.toast }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'staff-a' }, session: { access_token: 'one' } }) }));
vi.mock('@/hooks/useMyProfile', () => ({ useMyProfile: () => ({ data: null }) }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: mocks.org }) }));
vi.mock('@/hooks/useFofPolicySettings', () => ({
  useFofPolicySettings: () => mocks.policy,
  usePaymentClassifications: () => ({ data: { D2740: 'restoration', D2750: 'restoration', D6010: 'implant', D0367: 'workup', D2392: 'other', D0120: 'other', D9999: 'other' } }),
}));
vi.mock('@/hooks/useFofTemplates', () => ({ useFofTemplates: () => ({ data: mocks.templates }), useFofSettings: () => mocks.practice }));
vi.mock('@/hooks/useOrgBranding', () => ({ useOrgBranding: () => ({ data: PRACTICE_DEFAULT_BRANDING }) }));
vi.mock('@/hooks/useFeeSchedules', () => ({
  useFeeSchedules: () => mocks.schedules,
  useFeeScheduleItems: (id: string | null) => (id ? mocks.items[id] ?? { data: [] } : { data: undefined }),
  useInsurancePlans: () => mocks.plans,
  useCodeNames: () => ({ data: {} }),
  useProcedureBundles: () => ({ data: [] }), useSaveProcedureBundle: () => ({}), useDeleteProcedureBundle: () => ({}),
}));
vi.mock('@/components/fof/FofAssistantWidget', () => ({ default: () => null }));
vi.mock('@/components/ScaledPrintPreview', () => ({ default: ({ children }: { children: React.ReactNode }) => <div data-testid="preview">{children}</div> }));

const schedule = (id: string, kind: string, name: string, isActive = true, isInNetwork = true) => ({ id, kind, name, isActive, isInNetwork, sortOrder: 0 });
const plan = (overrides: Record<string, unknown> = {}) => ({
  id: 'plan-delta', name: 'DD MA 100/80/50', feeScheduleId: 'delta', preventivePct: 100, basicPct: 80, majorPct: 50, deductibleCents: 5000,
  deductibleWaivedPreventive: true, annualMaxCents: 150_000, writeoffApplies: true, officeFeesAfterMax: false, isInNetwork: true, isActive: true, sortOrder: 0, alternateBenefitDowngrade: null, ...overrides,
});

function resetOffice() {
  mocks.schedules.data = [schedule('office', 'office', 'Office Fee Schedule', true, false), schedule('delta', 'carrier', 'Delta Dental MA'), schedule('bcbs', 'carrier', 'Blue Cross Blue Shield MA'), schedule('old', 'carrier', 'Retired Carrier', false)];
  mocks.schedules.isLoading = false; mocks.schedules.error = null;
  mocks.items = { office: { data: OFFICE_ITEMS }, delta: { data: DELTA_ITEMS }, bcbs: { data: BCBS_ITEMS }, old: { data: [] } };
  mocks.plans.data = [plan()]; mocks.plans.isLoading = false; mocks.plans.error = null;
  mocks.policy.data = { payment_policy: harelickPolicyTemplate(), day_of_service_threshold_cents: 100_000, min_standalone_payment_cents: 10_000, downgrade_default_on: false };
  mocks.policy.isLoading = false; mocks.policy.error = null;
  mocks.templates = [LIVE_TEMPLATES[1], LIVE_TEMPLATES[0], LIVE_TEMPLATES[2]]; // In-Network first
  mocks.practice.data = PRACTICE_DEFAULT_BRANDING; mocks.practice.isLoading = false; mocks.practice.error = null;
  mocks.org = { org_id: ORG, user_id: 'staff-a', role: 'employee' };
}

function mount() {
  const router = createMemoryRouter([{ path: '/fof', element: <FofBuilder /> }], { initialEntries: ['/fof'] });
  render(<RouterProvider router={router} />);
}
/** Drive a Radix Select from the keyboard (jsdom has no pointer events). */
async function pick(triggerName: string | RegExp, optionName: string | RegExp) {
  const trigger = screen.getByRole('combobox', { name: triggerName });
  fireEvent.keyDown(trigger, { key: 'Enter' });
  const listbox = await screen.findByRole('listbox');
  fireEvent.keyDown(within(listbox).getByRole('option', { name: optionName }), { key: 'Enter' });
}
const codeInputs = () => screen.getAllByPlaceholderText('D2740 / crown') as HTMLInputElement[];
const lineOf = (code: string) => document.querySelector(`[data-line-code="${code}"]`) as HTMLElement;
const feeInput = (code: string) => within(lineOf(code)).getAllByPlaceholderText('$0.00')[0] as HTMLInputElement;
const insPaysInput = (code: string) => within(lineOf(code)).getAllByPlaceholderText('$0.00')[1] as HTMLInputElement;
const allowableInput = (code: string) => within(lineOf(code)).getByPlaceholderText(/office fee|auto/) as HTMLInputElement;
const chips = (code: string) => [...lineOf(code).querySelectorAll('[data-source]')].map(el => el.getAttribute('data-source'));
const printButton = () => screen.getByRole('button', { name: /^(Print|Reprint)$/ });
const typeCode = (index: number, code: string) => fireEvent.change(codeInputs()[index], { target: { value: code } });
const settle = async (rounds = 8) => { for (let i = 0; i < rounds; i++) await act(async () => { await Promise.resolve(); }); };
const rerender = () => fireEvent.change(screen.getByLabelText('Patient Name'), { target: { value: `tick ${Math.random()}` } });

beforeEach(() => { resetOffice(); mocks.invoke.mockReset(); mocks.invoke.mockResolvedValue({ data: { names: [], treatment: null } }); Object.values(mocks.toast).forEach(fn => fn.mockReset()); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('saved plans hydrate the form as unverified estimates', () => {
  it('choosing a carrier applies its plan defaults, marks them, and blocks printing until benefits are confirmed', async () => {
    mount();
    typeCode(0, 'D2740');
    await pick('Carrier Fee Schedule', 'Delta Dental MA');
    expect(screen.getByLabelText(/Patient's Remaining Deductible/)).toHaveValue('$50.00');
    expect(screen.getByLabelText(/Patient's Remaining Annual Max/)).toHaveValue('$1,500.00');
    expect(screen.getByLabelText(/Preventive %/)).toHaveValue('100');
    expect(screen.getByLabelText(/Basic %/)).toHaveValue('80');
    expect(screen.getByLabelText(/Major %/)).toHaveValue('50');
    // The chips say where the numbers came from.
    expect(document.querySelectorAll('[data-source="plan"]').length).toBeGreaterThan(0);
    expect(screen.getByText(/unverified estimate, not this patient's eligibility/)).toBeTruthy();
    expect(printButton()).toBeDisabled();
    expect(screen.getByText(/Confirm the patient's remaining deductible and annual maximum/)).toBeTruthy();
    // The carrier rate drove the line estimate: 50% of the $1,261.67 allowable after the $50 deductible.
    expect(insPaysInput('D2740')).toHaveValue('$605.84');
    expect(allowableInput('D2740')).toHaveValue('$1,261.67');
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm benefits as entered' })[0]);
    await waitFor(() => expect(printButton()).toBeEnabled());
    expect(screen.getByText(/Benefits confirmed for this patient by staff/)).toBeTruthy();
  });
  it('typing a patient-specific benefit replaces the plan default and is labelled as the patient\'s', async () => {
    mount();
    typeCode(0, 'D2740');
    await pick('Carrier Fee Schedule', 'Delta Dental MA');
    fireEvent.change(screen.getByLabelText(/Patient's Remaining Annual Max/), { target: { value: '$400.00' } });
    expect(document.querySelectorAll('[data-source="patient"]').length).toBeGreaterThan(0);
    // The remaining max caps the line estimate at once.
    expect(insPaysInput('D2740')).toHaveValue('$400.00');
  });
  it('a carrier with no saved plan gets generic defaults and says so; a plan-less BCBS row with a $0 rate uses the office fee and says so', async () => {
    mount();
    typeCode(0, 'D2750');
    await pick('Carrier Fee Schedule', 'Blue Cross Blue Shield MA');
    expect(screen.getByText(/No saved plan for Blue Cross Blue Shield MA/)).toBeTruthy();
    expect(document.querySelectorAll('[data-source="default"]').length).toBeGreaterThan(0);
    expect(chips('D2750')).toContain('missing');
    expect(allowableInput('D2750')).toHaveValue('');
    // 50% of the office fee ($1,400) since no contracted rate exists: $700.
    expect(insPaysInput('D2750')).toHaveValue('$675.00');
  });
  it('several saved plans for one carrier offer a choice and re-hydrate on change', async () => {
    mocks.plans.data = [plan(), plan({ id: 'plan-delta-2', name: 'DD MA 80/60/40', preventivePct: 80, basicPct: 60, majorPct: 40, deductibleCents: 10_000, annualMaxCents: 100_000 })];
    mount();
    typeCode(0, 'D2740');
    await pick('Carrier Fee Schedule', 'Delta Dental MA');
    expect(screen.getByLabelText(/Major %/)).toHaveValue('50');
    await pick('Saved plan', 'DD MA 80/60/40');
    expect(screen.getByLabelText(/Major %/)).toHaveValue('40');
    expect(screen.getByLabelText(/Patient's Remaining Deductible/)).toHaveValue('$100.00');
    expect(insPaysInput('D2740')).toHaveValue('$464.67'); // 40% of (1261.67 − 100 deductible)
  });
  it('inactive carriers are never offered', async () => {
    mount();
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Carrier Fee Schedule' }), { key: 'Enter' });
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).queryByRole('option', { name: 'Retired Carrier' })).toBeNull();
    expect(within(listbox).getByRole('option', { name: 'Delta Dental MA' })).toBeTruthy();
  });
});

describe('fees load before anything is trusted', () => {
  it('a code typed while the office schedule is loading resolves once it arrives', async () => {
    mocks.items.office = { data: undefined, isLoading: true };
    mount();
    typeCode(0, 'D2740');
    expect(feeInput('D2740')).toHaveValue('');
    expect(chips('D2740')).toContain('pending');
    expect(printButton()).toBeDisabled();
    mocks.items.office = { data: OFFICE_ITEMS, isLoading: false };
    rerender();
    await waitFor(() => expect(feeInput('D2740')).toHaveValue('$1,569.00'));
    expect(chips('D2740')).toContain('office');
  });
  it('a failed fee query is a visible blocker with a retry, never an empty map or a $0 fee', async () => {
    mocks.items.office = { data: undefined, isLoading: false, error: new Error('network down'), refetch: vi.fn() };
    mount();
    typeCode(0, 'D2740');
    expect(screen.getAllByText(/fee schedules could not be loaded \(network down\)/)[0]).toBeTruthy();
    expect(printButton()).toBeDisabled();
    expect(feeInput('D2740')).toHaveValue('');
    fireEvent.click(screen.getByRole('button', { name: 'Try loading again' }));
    expect(mocks.items.office.refetch).toHaveBeenCalled();
  });
  it('an inactive office schedule is not used; a $0 office fee is a no-charge line that says so and never blocks the print', async () => {
    mocks.schedules.data = [schedule('office', 'office', 'Office Fee Schedule', false, false)];
    mocks.templates = [LIVE_TEMPLATES[0]];
    mount();
    expect(screen.getByText(/no active fee schedule/)).toBeTruthy();
    typeCode(0, 'D2740');
    expect(feeInput('D2740')).toHaveValue('');
    cleanup(); resetOffice(); mocks.templates = [LIVE_TEMPLATES[0]];
    mount();
    typeCode(0, 'D2740');
    fireEvent.click(screen.getByRole('button', { name: /Add Procedure/ }));
    typeCode(1, 'D9999');
    // Office decision: a $0 row (post-ops, inserts, adjustments) is a real no-charge fee.
    expect(feeInput('D9999')).toHaveValue('$0.00');
    expect(chips('D9999')).toContain('office');
    expect(chips('D9999')).not.toContain('missing');
    expect(screen.getAllByText(/No charge — \$0.00 on the office fee schedule/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/D9999 has no office fee/)).toBeNull();
    expect(printButton()).toBeEnabled();
    // A code the schedule does not carry is still "no fee on file" and blocks until staff type one.
    typeCode(1, 'D8888');
    expect(chips('D8888')).toContain('missing');
    expect(screen.getByText(/D8888 has no office fee: the office schedule has no fee on file/)).toBeTruthy();
    expect(printButton()).toBeDisabled();
  });
  it('a missing practice identity blocks the print instead of printing a blank header', () => {
    mocks.practice.data = { ...PRACTICE_DEFAULT_BRANDING, practiceName: '' };
    mocks.templates = [LIVE_TEMPLATES[0]];
    mount();
    typeCode(0, 'D2740');
    expect(screen.getAllByText(/practice identity .* not set up/)[0]).toBeTruthy();
    expect(printButton()).toBeDisabled();
  });
  it('an unmatched code stays visibly unmatched and never invents a fee', () => {
    mocks.templates = [LIVE_TEMPLATES[0]];
    mount();
    typeCode(0, 'D4444');
    expect(screen.getByText(/D4444 is not on the office fee schedule/)).toBeTruthy();
    expect(feeInput('D4444')).toHaveValue('');
    expect(printButton()).toBeDisabled();
  });
});

describe('a changed code or carrier never keeps stale values', () => {
  it('changing the code re-evaluates fee, description and estimates, clears overrides, and lets staff restore them deliberately', async () => {
    mount();
    typeCode(0, 'D2740');
    await pick('Carrier Fee Schedule', 'Delta Dental MA');
    fireEvent.change(allowableInput('D2740'), { target: { value: '$1,000.00' } });
    fireEvent.change(insPaysInput('D2740'), { target: { value: '$300.00' } });
    expect(chips('D2740')).toEqual(expect.arrayContaining(['office', 'manual']));
    typeCode(0, 'D2750');
    expect(feeInput('D2750')).toHaveValue('$1,400.00');
    expect(within(lineOf('D2750')).getByPlaceholderText('Description')).toHaveValue('Crown');
    expect(allowableInput('D2750')).toHaveValue('$1,200.00'); // Delta's D2750 rate, not the old typed allowable
    expect(insPaysInput('D2750')).toHaveValue('$575.00');
    expect(screen.getByText(/Code changed from D2740: cleared allowable \$1,000.00, insurance payment \$300.00/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Restore cleared overrides' }));
    expect(allowableInput('D2750')).toHaveValue('$1,000.00');
    expect(insPaysInput('D2750')).toHaveValue('$300.00');
    expect(screen.getByText(/Restored overrides from D2740 on purpose/)).toBeTruthy();
  });
  it('changing the carrier invalidates carrier-derived line and global overrides and re-hydrates the plan', async () => {
    mount();
    typeCode(0, 'D2740');
    await pick('Carrier Fee Schedule', 'Delta Dental MA');
    fireEvent.change(insPaysInput('D2740'), { target: { value: '$500.00' } });
    fireEvent.click(screen.getByText('Amounts & Payment Plan'));
    fireEvent.change(screen.getByPlaceholderText('$500.00'), { target: { value: '$450.00' } }); // global insurance override
    await pick('Carrier Fee Schedule', 'Blue Cross Blue Shield MA');
    expect(insPaysInput('D2740')).toHaveValue('$618.45'); // 50% of BCBS $1,286.90, generic defaults
    expect(screen.getByText(/Carrier changed from Delta Dental MA: cleared insurance payment \$500.00/)).toBeTruthy();
    expect(screen.queryByDisplayValue('$450.00')).toBeNull();
    expect(document.querySelectorAll('[data-source="default"]').length).toBeGreaterThan(0);
  });
  it('a denture code drops the tooth number; a tooth-specific code keeps it', () => {
    mocks.templates = [LIVE_TEMPLATES[0]];
    mount();
    typeCode(0, 'D2740');
    fireEvent.change(within(lineOf('D2740')).getByPlaceholderText('#'), { target: { value: '3' } });
    typeCode(0, 'D2750');
    expect(within(lineOf('D2750')).getByPlaceholderText('#')).toHaveValue('3');
    typeCode(0, 'D5110');
    expect(within(lineOf('D5110')).getByPlaceholderText('#')).toHaveValue('');
  });
});

describe('insurance overrides, balances and courtesies', () => {
  it('a typed insurance payment above the payable basis is bounded and explained; an office exception lifts the basis only', async () => {
    mount();
    typeCode(0, 'D2740');
    await pick('Carrier Fee Schedule', 'Delta Dental MA');
    fireEvent.change(insPaysInput('D2740'), { target: { value: '$1,300.00' } });
    expect(screen.getByText(/Typed \$1,300.00; the plan can pay at most \$1,261.67/)).toBeTruthy();
    fireEvent.click(screen.getByRole('checkbox', { name: /Allow the insurance payment for D2740 to exceed its payable basis/ }));
    // With the exception recorded the typed amount stands, so the bounding note disappears and the note reads the exception.
    expect(screen.queryByText(/Typed \$1,300.00; the plan can pay at most/)).toBeNull();
    expect(chips('D2740')).toContain('manual');
    fireEvent.change(insPaysInput('D2740'), { target: { value: '$1,600.00' } });
    expect(screen.getByText(/the plan can pay at most \$1,500.00 on this line \(remaining annual maximum\)/)).toBeTruthy();
  });
  it('a credit larger than the balance is a visible imbalance that blocks printing, not a $0 portion', () => {
    mocks.templates = [LIVE_TEMPLATES[0]];
    mount();
    typeCode(0, 'D0120');
    fireEvent.click(screen.getByText('Discounts & Credits'));
    fireEvent.change(screen.getByLabelText('Patient Current Credit (optional)'), { target: { value: '$100.00' } });
    expect(screen.getAllByText(/exceed the total by \$35.00/).length).toBeGreaterThan(0);
    expect(printButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Patient Current Credit (optional)'), { target: { value: '$20.00' } });
    expect(screen.queryByText(/exceed the total/)).toBeNull();
    expect(printButton()).toBeEnabled();
  });
  it('an office discount switches the prepay courtesy off until a manager stacks them on purpose', () => {
    mocks.templates = [LIVE_TEMPLATES[0]];
    mount();
    typeCode(0, 'D2740');
    fireEvent.click(screen.getByText('Amounts & Payment Plan'));
    expect(screen.getByText('Prepay Discount (5%)')).toBeTruthy();
    fireEvent.click(screen.getByText('Discounts & Credits'));
    fireEvent.change(screen.getByLabelText('Office Discount (optional)'), { target: { value: '$100.00' } });
    expect(screen.queryByText('Prepay Discount (5%)')).toBeNull();
    expect(screen.getByText(/prepay courtesy .* is off because an office discount is on this form/)).toBeTruthy();
    fireEvent.click(screen.getByRole('switch', { name: /prepay courtesy/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Approved — stack them' }));
    expect(screen.getByText('Prepay Discount (5%)')).toBeTruthy();
    expect(screen.getByText(/Manager-approved: the prepay courtesy is stacked/)).toBeTruthy();
  });
  it('malformed money or percentages are review errors, never zero', async () => {
    mount();
    typeCode(0, 'D2740');
    await pick('Carrier Fee Schedule', 'Delta Dental MA');
    fireEvent.change(screen.getByLabelText(/Major %/), { target: { value: '5O' } });
    expect(screen.getByText(/Major % must be a whole number from 0 to 100/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Major %/), { target: { value: '50' } });
    fireEvent.change(feeInput('D2740'), { target: { value: '1,5x9' } });
    expect(screen.getByText(/office fee for D2740 is not a dollar amount/)).toBeTruthy();
    expect(printButton()).toBeDisabled();
  });
});

describe('automatic naming', () => {
  it('runs after the quiet period with vetted codes only, applies names on the policy path without overwriting staff wording, and retries visibly', async () => {
    vi.useFakeTimers();
    mocks.templates = [LIVE_TEMPLATES[0]];
    mocks.invoke.mockImplementation(async (name: string, options: { body: Record<string, unknown> }) => {
      if (name !== 'name-visits') return { data: {} };
      const slots = options.body.slots as string[];
      return { data: { names: slots.map((_, i) => `Suggested ${i + 1}`), treatment: 'We will place a porcelain crown.' } };
    });
    mount();
    fireEvent.change(screen.getByLabelText('Patient Name'), { target: { value: 'Synthetic Patient' } });
    typeCode(0, 'D2740');
    fireEvent.click(screen.getByRole('button', { name: /Add Procedure/ }));
    typeCode(1, 'Jane Doe');
    fireEvent.change(feeInput('JANE DOE'), { target: { value: '$10.00' } });
    fireEvent.click(screen.getByText('Amounts & Payment Plan'));
    fireEvent.change(screen.getAllByLabelText(/^Payment label /)[0], { target: { value: 'Staff wording stays' } });
    await act(async () => { vi.advanceTimersByTime(2600); });
    await act(async () => { await Promise.resolve(); });
    const call = mocks.invoke.mock.calls.find(c => c[0] === 'name-visits');
    expect(call).toBeTruthy();
    const body = JSON.stringify(call![1].body);
    expect(body).not.toMatch(/Jane|Synthetic|10\.00|1,569/);
    expect(call![1].body.orgId).toBe(ORG);
    expect(call![1].body.visits[0].procedures).toEqual(['Porcelain Crown']);
    await settle();
    expect(screen.getByLabelText('Treatment description (prints on the form)')).toHaveValue('We will place a porcelain crown.');
    const labels = screen.getAllByLabelText(/^Payment label /).map(el => (el as HTMLInputElement).value);
    expect(labels[0]).toBe('Staff wording stays');
    expect(labels.slice(1).every(label => label.startsWith('Suggested'))).toBe(true);
    expect(screen.getByText(/Treatment summary and payment names are current/)).toBeTruthy();
    // A transient failure shows a retry state instead of silence, and the manual button works.
    mocks.invoke.mockResolvedValue({ error: { name: 'FunctionsHttpError', message: 'non-2xx', context: { status: 502, json: async () => ({ error: 'AI request failed' }) } } });
    fireEvent.change(within(lineOf('D2740')).getByPlaceholderText('#'), { target: { value: '3' } });
    await act(async () => { vi.advanceTimersByTime(2600); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/did not answer \(attempt 1 of 3\)/)).toBeTruthy();
    await act(async () => { vi.advanceTimersByTime(4100); });
    await act(async () => { await Promise.resolve(); });
    await act(async () => { vi.advanceTimersByTime(8100); });
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByText(/Retry when you are ready/)).toBeTruthy();
    mocks.invoke.mockImplementation(async (name: string, options: { body: Record<string, unknown> }) => ({ data: { names: (options.body.slots as string[]).map((_, i) => `Manual ${i + 1}`), treatment: 'Manual retry wording.' } }));
    fireEvent.click(screen.getByRole('button', { name: /Retry/ }));
    await act(async () => { await Promise.resolve(); });
    await settle();
    expect(screen.getByLabelText('Treatment description (prints on the form)')).toHaveValue('Manual retry wording.');
  }, 20000);
  it('waits for fees to load and does not run on an unready form', async () => {
    vi.useFakeTimers();
    mocks.templates = [LIVE_TEMPLATES[0]];
    mocks.items.office = { data: undefined, isLoading: true };
    mount();
    typeCode(0, 'D2740');
    await act(async () => { vi.advanceTimersByTime(6000); });
    expect(mocks.invoke).not.toHaveBeenCalled();
    expect(screen.getByText(/Waiting for fees and settings to load/)).toBeTruthy();
  });
});

describe('printing and privacy', () => {
  it('print modes keep the office copy out of a patient-only job, printing does not erase the form, and Clear does', async () => {
    mocks.templates = [LIVE_TEMPLATES[0]];
    const print = vi.fn();
    vi.stubGlobal('print', print);
    window.print = print;
    mount();
    fireEvent.change(screen.getByLabelText('Patient Name'), { target: { value: 'Synthetic Patient' } });
    typeCode(0, 'D2740');
    expect(document.querySelector('.fof-print-root .fof-office-page')).toBeTruthy();
    await pick('What to print', 'Patient form only');
    expect(document.querySelector('.fof-print-root .fof-office-page')).toBeNull();
    expect(document.querySelector('.fof-print-root .fof-sheet')).toBeTruthy();
    await pick('What to print', 'Office copy only (internal)');
    expect(document.querySelector('.fof-print-root .fof-office-page')).toBeTruthy();
    expect(document.querySelectorAll('.fof-print-root .fof-sheet')).toHaveLength(1);
    fireEvent.click(printButton());
    expect(print).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Patient Name')).toHaveValue('Synthetic Patient');
    expect(screen.getByRole('button', { name: 'Reprint' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Clear form' }));
    expect(screen.getByLabelText('Patient Name')).toHaveValue('');
    expect(codeInputs()[0]).toHaveValue('');
  });
  it('the office copy shows the allowable the calculation used, its origin, and reconciles a manual insurance total', async () => {
    mount();
    typeCode(0, 'D2740');
    fireEvent.click(screen.getByRole('button', { name: /Add Procedure/ }));
    typeCode(1, 'D0367');
    await pick('Carrier Fee Schedule', 'Delta Dental MA');
    fireEvent.click(screen.getAllByRole('button', { name: 'Confirm benefits as entered' })[0]);
    fireEvent.click(screen.getByText('Amounts & Payment Plan'));
    fireEvent.change(screen.getByPlaceholderText('$605.84'), { target: { value: '$600.00' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Office copy' }));
    const office = document.querySelector('[data-testid="preview"] .fof-office-page')!;
    expect(office.textContent).toContain('carrier rate');
    expect(office.textContent).toContain('not covered — office fee');
    // The work-up line is never covered, so its basis is the office fee and the carrier's rate is irrelevant.
    expect(within(office as HTMLElement).getByText('D0367').closest('tr')!.textContent).toContain('$520.00 not covered — office fee');
    expect(office.querySelector('[data-testid="fof-reconciliation"]')!.textContent).toMatch(/Line estimates: insurance \$605.84.*Printed: insurance \$600.00/);
    expect(office.textContent).toContain('Benefits confirmed by staff');
  });
  it('no request the page makes carries the patient name, the treatment narrative or the typed amounts', async () => {
    vi.useFakeTimers();
    mocks.templates = [LIVE_TEMPLATES[0]];
    mount();
    fireEvent.change(screen.getByLabelText('Patient Name'), { target: { value: 'Synthetic Patient' } });
    typeCode(0, 'D2740');
    fireEvent.change(within(lineOf('D2740')).getByPlaceholderText('Description'), { target: { value: 'Crown for Synthetic Patient' } });
    fireEvent.change(screen.getByLabelText('Treatment description (prints on the form)'), { target: { value: 'Private narrative about Synthetic Patient' } });
    await act(async () => { vi.advanceTimersByTime(3000); });
    await act(async () => { await Promise.resolve(); });
    expect(mocks.invoke.mock.calls.length).toBeGreaterThan(0);
    for (const call of mocks.invoke.mock.calls) {
      expect(call[0]).toBe('name-visits');
      expect(JSON.stringify(call[1])).not.toMatch(/Synthetic|Private narrative|1,569|1569/);
    }
    for (const call of Object.values(mocks.toast).flatMap(fn => fn.mock.calls)) {
      expect(JSON.stringify(call)).not.toMatch(/Synthetic Patient/);
    }
  });
  it('the legacy-policy banner names the missing office policy instead of silently falling back', () => {
    mocks.policy.data = { ...mocks.policy.data, payment_policy: null };
    mocks.templates = [LIVE_TEMPLATES[0]];
    mount();
    expect(screen.getByText(/No office payment policy is configured/)).toBeTruthy();
    typeCode(0, 'D2740');
    fireEvent.click(screen.getByRole('tab', { name: 'Office copy' }));
    expect(document.querySelector('[data-testid="preview"] .fof-office-page')!.textContent).toContain('legacy visit-based schedule in use');
  });
});
