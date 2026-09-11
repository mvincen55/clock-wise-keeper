import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Settings from '@/pages/Settings';
const state = vi.hoisted(() => ({ role: 'owner' }));
vi.mock('@/hooks/useOrgContext', () => ({ useOrgContext: () => ({ data: { role: state.role } }) }));
vi.mock('@/components/onboarding/PrivacyTermsCard', () => ({ default: () => null }));
vi.mock('@/components/OrgBrandingCard', () => ({ default: () => null }));
vi.mock('@/components/accountability/EscalationPoliciesCard', () => ({ default: () => null }));
vi.mock('@/components/knowledge/AcknowledgmentEscalationSettingsCard', () => ({ default: () => null }));
vi.mock('@/components/settings/EmployeePermissionsCard', () => ({ default: () => null }));
vi.mock('@/components/settings/MessagingSettingsCard', () => ({ default: () => null }));
vi.mock('@/components/settings/PracticeSettingsCard', () => ({ PracticeSettingsCard: () => null }));
vi.mock('@/components/settings/FofPolicySettingsCard', () => ({ FofPolicySettingsCard: () => null }));
vi.mock('@/components/settings/ProviderRegistryCard', () => ({ default: () => null }));
vi.mock('@/components/settings/ProcedureMetaCard', () => ({ default: () => null }));
vi.mock('@/components/settings/BrokenApptSettingsCard', () => ({ BrokenApptSettingsCard: () => null }));
vi.mock('@/components/settings/StaffInitialsCard', () => ({ StaffInitialsCard: () => null }));
vi.mock('@/components/letterhead/MySignatureCard', () => ({ default: () => null }));
vi.mock('@/components/settings/PayrollSettingsCard', () => ({ default: () => null }));
vi.mock('@/components/settings/OfficeClosuresCard', () => ({ default: () => null }));
vi.mock('@/components/settings/SecurityPrivacyCard', () => ({ default: () => null }));
vi.mock('@/components/settings/PtoPolicySettingsCard', () => ({ default: () => null }));
vi.mock('@/components/close-day/ScheduleIntelligenceSetupCard', () => ({ default: ({ initiallyExpanded }: { initiallyExpanded: boolean }) => <p>{initiallyExpanded ? 'Expanded calibration' : 'Collapsed calibration'}</p> }));
vi.mock('@/components/DepositSettingsCard', () => ({ default: () => null }));

const scroll = vi.fn();
beforeEach(() => { state.role = 'owner'; HTMLElement.prototype.scrollIntoView = scroll; vi.clearAllMocks(); });
function mount() { render(<MemoryRouter initialEntries={['/settings/workflows?closingDate=2026-06-08#schedule-intelligence']}><Routes><Route path='/settings/:tab' element={<Settings />} /></Routes></MemoryRouter>); }
it.each(['owner', 'manager'])('opens the configuration section and focuses it for %s', role => {
 state.role = role; mount();
 const section = screen.getByRole('region', { name: 'Schedule Intelligence setup' });
 expect(section).toHaveFocus(); expect(scroll).toHaveBeenCalled();
 expect(screen.getByText('Expanded calibration')).toBeInTheDocument();
 for (const link of screen.getAllByRole('link', { name: 'Return to Close the Day' })) expect(link).toHaveAttribute('href', '/deposit-log?date=2026-06-08&step=2');
});
it('does not expose configuration to employees through a direct URL', () => {
 state.role = 'employee'; mount();
 expect(screen.queryByRole('region', { name: 'Schedule Intelligence setup' })).not.toBeInTheDocument();
 expect(screen.getByText('Your personal preferences.')).toBeInTheDocument();
});
