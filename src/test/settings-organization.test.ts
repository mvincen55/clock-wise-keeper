/**
 * Settings consolidation — every configuration surface lives in (or is
 * indexed from) the organized Settings section, and the old scattered homes
 * stay clean. Source-structure assertions, same style as the mobile-nav
 * checks in dashboard-empty-states:
 *
 *  - Settings is tabbed and deep-linkable (/settings/:tab);
 *  - the Acknowledgment escalation card moved off Management into Settings;
 *  - Close the Day setup cards moved off the Deposit Log page, which links
 *    to their new home instead;
 *  - the PTO policy card moved out of the PTO page tab, which links to it;
 *  - org branding has ONE editable home (Settings) — Consents settings links
 *    to it instead of rendering a second copy;
 *  - Work Zones is manager-gated like the Settings card that links to it;
 *  - members still reach their personal settings; office tabs are gated.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8');

const settings = read('pages/Settings.tsx');
const management = read('pages/Management.tsx');
const depositLog = read('pages/DepositLog.tsx');
const pto = read('pages/PTO.tsx');
const consentSettings = read('pages/ConsentSettings.tsx');
const workZones = read('pages/WorkZones.tsx');
const app = read('App.tsx');
const appLayout = read('components/AppLayout.tsx');

describe('settings is one organized, deep-linkable section', () => {
  it('renders four named tabs behind /settings/:tab', () => {
    expect(app).toMatch(/path="\/settings\/:tab"/);
    for (const tab of ['office', 'people', 'workflows', 'me']) {
      expect(settings).toContain(`TabsTrigger value="${tab}"`);
    }
    expect(settings).toMatch(/navigate\(`\/settings\/\$\{v\}`\)/);
  });

  it('members get personal settings only; office tabs are manager-gated', () => {
    // The manager tab list and all office tab content render behind isManager.
    expect(settings).toMatch(/\{isManager && \(\s*\n?\s*<TabsList/);
    const officeTabs = settings.match(/\{isManager && \(\s*\n?\s*<TabsContent/g) ?? [];
    expect(officeTabs).toHaveLength(3); // office, people, workflows
    // The personal tab is not gated.
    expect(settings).toMatch(/<TabsContent value="me"/);
    // Members are coerced onto their tab, never an empty office tab.
    expect(settings).toMatch(/isManager \? requested : 'me'/);
  });

  it('the acknowledgment escalation card lives in Settings, not Management', () => {
    expect(settings).toContain('AcknowledgmentEscalationSettingsCard');
    expect(management).not.toContain('AcknowledgmentEscalationSettingsCard');
  });

  it('Close the Day setup moved here; the Deposit Log page links instead', () => {
    expect(settings).toContain('ScheduleIntelligenceSetupCard');
    expect(settings).toContain('DepositSettingsCard');
    expect(depositLog).not.toContain('ScheduleIntelligenceSetupCard');
    expect(depositLog).not.toContain('<DepositSettingsCard');
    expect(depositLog).toContain('to="/settings/workflows"');
  });

  it('PTO policy moved here; the PTO tab links instead of duplicating it', () => {
    expect(settings).toContain('PtoPolicySettingsCard');
    expect(pto).not.toContain('PTO Policy Settings');
    expect(pto).not.toContain('useUpsertPtoSettings');
    expect(pto).toContain('to="/settings/people"');
  });

  it('org branding keeps one editable home — Consents settings links to it', () => {
    expect(settings).toContain('OrgBrandingCard');
    expect(consentSettings).not.toContain('OrgBrandingCard');
    expect(consentSettings).toContain('to="/settings/office"');
  });

  it('the extracted cards replaced the old inline blocks', () => {
    for (const card of ['PayrollSettingsCard', 'OfficeClosuresCard', 'SecurityPrivacyCard']) {
      expect(settings).toContain(card);
    }
    // The old inline implementations are gone from the page.
    expect(settings).not.toContain('usePayrollSettings');
    expect(settings).not.toContain('useOfficeClosures');
    expect(settings).not.toContain('sessionTimeoutMinutes');
  });

  it('sub-page settings are indexed from Settings, not orphaned', () => {
    for (const to of ['/work-zones', '/consents/settings', '/letters/settings', '/settings/reminders']) {
      expect(settings).toContain(`to="${to}"`);
    }
  });
});

describe('old homes stay consistent', () => {
  it('Work Zones is manager-gated like the Settings card that links to it', () => {
    expect(workZones).toMatch(/role === 'owner' \|\| ctx\?\.role === 'manager'/);
    expect(workZones).toContain('<Navigate to="/" replace />');
  });

  it('visiting /work-zones no longer lights up the Management nav item', () => {
    expect(appLayout).not.toMatch(/match: \[[^\]]*'\/work-zones'/);
  });

  it('/settings/reminders keeps its own page (static beats the :tab param)', () => {
    expect(app).toMatch(/path="\/settings\/reminders"/);
  });
});
