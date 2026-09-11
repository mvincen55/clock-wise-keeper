import { useEffect } from 'react';
import { useNavigate, useParams, useLocation, Link, Navigate } from 'react-router-dom';
import { scheduleSetupUrl, scheduleReturnUrl } from '@/lib/close-day-navigation';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BellRing, FileSignature, MapPin, ScrollText, type LucideIcon,
} from 'lucide-react';
import PrivacyTermsCard from '@/components/onboarding/PrivacyTermsCard';
import OrgBrandingCard from '@/components/OrgBrandingCard';
import EscalationPoliciesCard from '@/components/accountability/EscalationPoliciesCard';
import AcknowledgmentEscalationSettingsCard from '@/components/knowledge/AcknowledgmentEscalationSettingsCard';
import EmployeePermissionsCard from '@/components/settings/EmployeePermissionsCard';
import MessagingSettingsCard from '@/components/settings/MessagingSettingsCard';
import { PracticeSettingsCard } from '@/components/settings/PracticeSettingsCard';
import ProviderRegistryCard from '@/components/settings/ProviderRegistryCard';
import { StaffInitialsCard } from '@/components/settings/StaffInitialsCard';
import MySignatureCard from '@/components/letterhead/MySignatureCard';
import PayrollSettingsCard from '@/components/settings/PayrollSettingsCard';
import OfficeClosuresCard from '@/components/settings/OfficeClosuresCard';
import SecurityPrivacyCard from '@/components/settings/SecurityPrivacyCard';
import PtoPolicySettingsCard from '@/components/settings/PtoPolicySettingsCard';

/**
 * Settings — the one organized home for configuration.
 *
 * Four sections, deep-linkable as /settings/:tab:
 *   office    — who the practice is and how it runs (identity, goals,
 *               payroll, closures, work zones)
 *   people    — people policies (accountability chains, acknowledgment
 *               escalation, PTO policy, messaging)
 *   workflows — how clinical/office workflows behave (providers, procedures,
 *               FOF, broken appointments, Close the Day, documents & letters)
 *   me        — personal preferences (signature, staff code, reminders,
 *               auto-logout, privacy record)
 *
 * Regular members see only "My settings" — the office tabs are manager
 * territory, matching the RLS that backs every card. Settings that live on
 * their own pages (work zones, forms & consents, correspondence, reminders)
 * are linked from here so this page stays the single index.
 */

const MANAGER_TABS = ['office', 'people', 'workflows', 'me'] as const;
type SettingsTab = (typeof MANAGER_TABS)[number];

/** A settings surface that lives on its own page, indexed from here. */
function SettingsLinkCard({
  icon: Icon,
  title,
  description,
  to,
  cta,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  to: string;
  cta: string;
}) {
  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="flex items-center gap-2">
          <Icon className="h-5 w-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{description}</p>
        <Button variant="outline" asChild>
          <Link to={to}>{cta}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

export default function Settings() {
  const { data: ctx } = useOrgContext();
  const navigate = useNavigate();
  const { tab } = useParams();
  const location = useLocation();
  const closingDate = new URLSearchParams(location.search).get('closingDate');
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  // Members only have personal settings; managers land on the office tab.
  // An out-of-range or unauthorized tab quietly falls back — no error state.
  const fallback: SettingsTab = isManager ? 'office' : 'me';
  const requested = (MANAGER_TABS as readonly string[]).includes(tab ?? '') ? (tab as SettingsTab) : fallback;
  const active: SettingsTab = isManager ? requested : 'me';
  const showSchedule = active === 'workflows' && location.hash === '#schedule-intelligence';
  useEffect(() => {
    if (active === 'office' && location.hash === '#office-closures') {
      const target = document.getElementById('office-closures');
      target?.scrollIntoView({ block: 'start' });
      target?.focus({ preventScroll: true });
    }
  }, [active, location.hash]);
  if (showSchedule) return <Navigate replace to={scheduleSetupUrl(closingDate ?? '')} />;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground">
          {isManager
            ? 'Every office and personal setting, in one place.'
            : 'Your personal preferences.'}
        </p>
      </div>

      {closingDate && <Button variant="outline" asChild><Link to={scheduleReturnUrl(closingDate)}>Return to Close the Day</Link></Button>}
      <Tabs value={active} onValueChange={v => navigate(`/settings/${v}${location.search}`)}>
        {isManager && (
          <TabsList className="flex w-full flex-wrap h-auto justify-start">
            <TabsTrigger value="office">Office</TabsTrigger>
            <TabsTrigger value="people">People &amp; policies</TabsTrigger>
            <TabsTrigger value="workflows">Workflows</TabsTrigger>
            <TabsTrigger value="me">My settings</TabsTrigger>
          </TabsList>
        )}

        {/* ------------------------------ office ------------------------------ */}
        {isManager && (
          <TabsContent value="office" className="mt-4 space-y-6">
            {/* The office's identity: name, logo, accent color. */}
            <OrgBrandingCard isManager={isManager} />
            {/* Performance goals, PMS, confirmation window. */}
            <PracticeSettingsCard />
            <div id="office-closures" tabIndex={-1} className="scroll-mt-6"><OfficeClosuresCard isManager={isManager} /></div>
            <ProviderRegistryCard />
            <PayrollSettingsCard />
            <SettingsLinkCard
              icon={MapPin}
              title="Work Zones"
              description="Geofenced clock-in zones and location tracking configuration."
              to="/work-zones"
              cta="Manage Work Zones"
            />
          </TabsContent>
        )}

        {/* ------------------------------ people ------------------------------ */}
        {isManager && (
          <TabsContent value="people" className="mt-4 space-y-6">
            {/* Per-employee capability grants; the owner decides who edits them. */}
            <EmployeePermissionsCard />
            {/* Accountability record chains (who reviews whom). */}
            <EscalationPoliciesCard />
            {/* Acknowledgment chasing: quiet hours, ladder, snoozes — moved
                here from the Management page so policies live with policies. */}
            <AcknowledgmentEscalationSettingsCard />
            <PtoPolicySettingsCard />
            <MessagingSettingsCard />
          </TabsContent>
        )}

        {/* ---------------------------- workflows ----------------------------- */}
        {isManager && (
          <TabsContent value="workflows" className="mt-4 space-y-6">
            <SettingsLinkCard icon={FileSignature} title="FOF Settings" description="Payment policy, procedure behavior, templates, fees and plans." to="/fof/settings" cta="Open FOF Settings" />
            <SettingsLinkCard icon={ScrollText} title="Broken Appointment Policy" description="Notice window, scheduling fee, prepayment and wording." to="/broken-appointments/settings" cta="Open Broken Appointment Policy" />
            <SettingsLinkCard icon={MapPin} title="Schedule Intelligence" description="Schedule calibration, staffing expectations and capture options." to="/settings/schedule-intelligence" cta="Set up Schedule Intelligence" />
            <SettingsLinkCard icon={FileSignature} title="Deposit Print Settings" description="Deposit labels and printed office instructions." to="/settings/deposits" cta="Open Deposit Print Settings" />
            <SettingsLinkCard icon={ScrollText} title="Insurance operations" description="Benefit requests, reviewed plan rules, credentials and calling setup." to="/insurance-desk/settings" cta="Open insurance settings" />
            <SettingsLinkCard
              icon={FileSignature}
              title="Forms &amp; Consents"
              description="Team permissions, signature rules, privacy, and the consent audit trail."
              to="/consents/settings"
              cta="Open Forms &amp; Consents settings"
            />
            <SettingsLinkCard
              icon={ScrollText}
              title="Letterhead &amp; Correspondence"
              description="Letter defaults, school/work note wording, and library permissions."
              to="/letters/settings"
              cta="Open correspondence settings"
            />
          </TabsContent>
        )}

        {/* -------------------------------- me -------------------------------- */}
        <TabsContent value="me" className="mt-4 space-y-6">
          {/* Personal: my stored signature for office letters (self-service) */}
          <MySignatureCard />
          {/* Personal: initials stamped into Broken Appointments outputs */}
          <StaffInitialsCard />
          <SettingsLinkCard
            icon={BellRing}
            title="Reminders"
            description="Your goal due-notice reminders: on/off, delivery hour, and channel."
            to="/settings/reminders"
            cta="Open reminder settings"
          />
          <SecurityPrivacyCard />
          <PrivacyTermsCard />
        </TabsContent>
      </Tabs>
    </div>
  );
}
