/**
 * Settings have three homes (design §3.8): office-wide settings on ONE page
 * under Management → Office; personal settings under the account menu;
 * feature-local settings on their features. The old scattered homes stay
 * clean and the old addresses redirect. Source-structure assertions, same
 * style as the mobile-nav checks in dashboard-empty-states.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const mySettings = read('pages/Settings.tsx');
const officeSettings = read('pages/management/OfficeSettings.tsx');
const management = read('pages/Management.tsx');
const depositLog = read('pages/DepositLog.tsx');
const pto = read('pages/PTO.tsx');
const consentSettings = read('pages/ConsentSettings.tsx');
const workZones = read('pages/WorkZones.tsx');
const redirects = read('components/management/LegacyRedirects.tsx');
const app = read('App.tsx');
const appLayout = read('components/AppLayout.tsx');

describe('office settings are one page with anchors under Management → Office', () => {
  it('is routed, and the old tabbed addresses redirect to it', () => {
    expect(app).toMatch(/path="\/management\/office\/settings"/);
    expect(app).toMatch(/path="\/settings\/:tab" element=\{<LegacySettingsTabRedirect \/>\}/);
    expect(redirects).toContain("tab === 'office' || tab === 'people' || tab === 'workflows'");
    expect(redirects).toContain('/management/office/settings${search}${hash}');
  });

  it('hosts every office-wide card once, in named sections', () => {
    for (const card of [
      'OrgBrandingCard', 'PracticeSettingsCard', 'OfficeClosuresCard', 'ProviderRegistryCard', 'PayrollSettingsCard',
      'WorkZonesCard', 'EmployeePermissionsCard', 'EscalationPoliciesCard', 'AcknowledgmentEscalationSettingsCard',
      'AttendanceGraceSettingsCard', 'PtoPolicySettingsCard', 'MessagingSettingsCard',
    ]) {
      expect(officeSettings).toContain(`<${card}`);
      expect(mySettings).not.toContain(card);
    }
    for (const id of ['identity', 'hours', 'payroll', 'attendance', 'pto', 'people-policies', 'permissions', 'providers', 'messaging', 'work-zones']) {
      expect(officeSettings).toContain(`id: '${id}'`);
    }
    expect(officeSettings).not.toContain('TabsTrigger');
    expect(management).not.toContain('AcknowledgmentEscalationSettingsCard');
  });

  it('keeps the Close the Day handoff: #schedule-intelligence redirects to setup and the return link survives', () => {
    expect(officeSettings).toContain("location.hash === '#schedule-intelligence'");
    expect(officeSettings).toContain('scheduleReturnUrl(closingDate)');
    expect(read('pages/WorkflowSettings.tsx')).toContain('ScheduleIntelligenceSetupCard');
    expect(depositLog).not.toContain('ScheduleIntelligenceSetupCard');
    expect(depositLog).not.toContain('<DepositSettingsCard');
    expect(depositLog).toContain('to="/settings/deposits"');
  });

  it('feature-local settings are listed once, not as link cards', () => {
    for (const to of ['/fof/settings', '/broken-appointments/settings', '/settings/schedule-intelligence', '/settings/deposits', '/insurance-desk/settings', '/consents/settings', '/letters/settings']) {
      expect(officeSettings).toContain(`to: '${to}'`);
    }
    expect(officeSettings).not.toContain('SettingsLinkCard');
  });
});

describe('personal settings stay personal', () => {
  it('/settings is My settings for everyone, with the personal cards only', () => {
    expect(app).toMatch(/path="\/settings" element=\{<ProtectedRoute><Settings \/>/);
    for (const card of ['MySignatureCard', 'StaffInitialsCard', 'SecurityPrivacyCard', 'PrivacyTermsCard']) {
      expect(mySettings).toContain(card);
    }
    expect(mySettings).toContain('to="/settings/reminders"');
    expect(mySettings).not.toContain('TabsTrigger');
  });

  it('/settings/reminders keeps its own page (static beats the :tab param)', () => {
    expect(app).toMatch(/path="\/settings\/reminders"/);
  });
});

describe('old homes stay consistent', () => {
  it('the PTO page and Consents settings link into Office settings instead of duplicating cards', () => {
    expect(pto).not.toContain('PTO Policy Settings');
    expect(pto).not.toContain('useUpsertPtoSettings');
    expect(pto).toContain('to="/management/office/settings#pto"');
    expect(consentSettings).not.toContain('OrgBrandingCard');
    expect(consentSettings).toContain('to="/management/office/settings#identity"');
  });

  it('the old Work Zones route lands on the card in Office settings', () => {
    expect(workZones).toContain('<Navigate to="/management/office/settings#work-zones" replace />');
    expect(officeSettings).toContain('id="work-zones"');
    expect(management).not.toContain("to: '/work-zones'");
  });

  it('visiting /work-zones no longer lights up the Management nav item', () => {
    expect(appLayout).not.toMatch(/match: \[[^\]]*'\/work-zones'/);
  });
});
