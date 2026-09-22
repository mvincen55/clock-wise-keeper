import { useEffect } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import ManagementShell from '@/components/management/ManagementShell';
import { useOrgContext } from '@/hooks/useOrgContext';
import { scheduleSetupUrl, scheduleReturnUrl } from '@/lib/close-day-navigation';
import { Button } from '@/components/ui/button';
import OrgBrandingCard from '@/components/OrgBrandingCard';
import EscalationPoliciesCard from '@/components/accountability/EscalationPoliciesCard';
import AcknowledgmentEscalationSettingsCard from '@/components/knowledge/AcknowledgmentEscalationSettingsCard';
import EmployeePermissionsCard from '@/components/settings/EmployeePermissionsCard';
import MessagingSettingsCard from '@/components/settings/MessagingSettingsCard';
import { PracticeSettingsCard } from '@/components/settings/PracticeSettingsCard';
import ProviderRegistryCard from '@/components/settings/ProviderRegistryCard';
import PayrollSettingsCard from '@/components/settings/PayrollSettingsCard';
import OfficeClosuresCard from '@/components/settings/OfficeClosuresCard';
import AttendanceGraceSettingsCard from '@/components/settings/AttendanceGraceSettingsCard';
import PtoPolicySettingsCard from '@/components/settings/PtoPolicySettingsCard';
import WorkZonesCard from '@/components/settings/WorkZonesCard';

/**
 * Office settings (design §3.8): one page, sections with anchors, no tabs
 * of link cards. Feature-local settings stay on their features and are
 * listed once at the end. Personal settings are under the account menu.
 */
const SECTIONS = [
  { id: 'identity', label: 'Identity & brand' },
  { id: 'hours', label: 'Hours & closures' },
  { id: 'payroll', label: 'Payroll' },
  { id: 'attendance', label: 'Attendance' },
  { id: 'pto', label: 'PTO policy' },
  { id: 'people-policies', label: 'Escalation & acknowledgments' },
  { id: 'permissions', label: 'Roles & permissions' },
  { id: 'providers', label: 'Providers' },
  { id: 'messaging', label: 'Messaging' },
  { id: 'work-zones', label: 'Work zones' },
] as const;

const FEATURE_SETTINGS = [
  { label: 'FOF', to: '/fof/settings' },
  { label: 'Broken appointments', to: '/broken-appointments/settings' },
  { label: 'Schedule Intelligence', to: '/settings/schedule-intelligence' },
  { label: 'Deposit print', to: '/settings/deposits' },
  { label: 'Insurance operations', to: '/insurance-desk/settings' },
  { label: 'Forms & consents', to: '/consents/settings' },
  { label: 'Letterhead & correspondence', to: '/letters/settings' },
];

function Block({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} tabIndex={-1} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <h2 id={`${id}-title`} className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export default function OfficeSettings() {
  const location = useLocation();
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const closingDate = new URLSearchParams(location.search).get('closingDate');
  useEffect(() => {
    if (!location.hash) return;
    const id = location.hash.slice(1) === 'office-closures' ? 'hours' : location.hash.slice(1);
    const target = document.getElementById(id);
    target?.scrollIntoView({ block: 'start' });
    target?.focus({ preventScroll: true });
  }, [location.hash]);
  // The Close the Day schedule step sends people here to set up Schedule Intelligence.
  if (isManager && location.hash === '#schedule-intelligence') return <Navigate replace to={scheduleSetupUrl(closingDate ?? '')} />;

  return (
    <ManagementShell room="office">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Office settings</h1>
          <p className="text-sm text-muted-foreground">How the office is set up. Owners and managers only.</p>
        </div>
        {closingDate && <Button variant="outline" asChild><Link to={scheduleReturnUrl(closingDate)}>Return to Close the Day</Link></Button>}

        <nav aria-label="Sections" className="sticky top-0 z-10 -mx-1 flex flex-wrap gap-1 border-b bg-background/95 px-1 py-2 backdrop-blur">
          {SECTIONS.map(s => <a key={s.id} href={`#${s.id}`} className="min-h-9 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground">{s.label}</a>)}
        </nav>

        <Block id="identity" title="Identity & brand"><OrgBrandingCard isManager /><PracticeSettingsCard /></Block>
        <Block id="hours" title="Hours & closures"><div id="office-closures"><OfficeClosuresCard isManager /></div></Block>
        <Block id="payroll" title="Payroll"><PayrollSettingsCard /></Block>
        <Block id="attendance" title="Attendance"><AttendanceGraceSettingsCard /></Block>
        <Block id="pto" title="PTO policy"><PtoPolicySettingsCard /></Block>
        <Block id="people-policies" title="Escalation & acknowledgments"><EscalationPoliciesCard /><AcknowledgmentEscalationSettingsCard /></Block>
        <Block id="permissions" title="Roles & permissions"><EmployeePermissionsCard /></Block>
        <Block id="providers" title="Providers"><ProviderRegistryCard /></Block>
        <Block id="messaging" title="Messaging"><MessagingSettingsCard /></Block>
        <Block id="work-zones" title="Work zones"><WorkZonesCard /></Block>

        <section aria-labelledby="feature-settings-title" className="space-y-2">
          <h2 id="feature-settings-title" className="text-lg font-semibold">Feature settings</h2>
          <p className="text-sm text-muted-foreground">Each workflow keeps its settings on its own page:</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            {FEATURE_SETTINGS.map(f => <li key={f.to}><Link to={f.to} className="underline-offset-2 hover:underline">{f.label}</Link></li>)}
          </ul>
        </section>
      </div>
    </ManagementShell>
  );
}
