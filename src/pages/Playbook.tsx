import {
  Sunrise, ListChecks, Banknote, ShieldAlert, ReceiptText, FileStack,
  DollarSign, Sparkles,
} from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import HubLinkGrid, { HubSection } from '@/components/HubLinkGrid';

// Practice Playbook: how the office performs excellent work (blueprint §2).
// Blank templates and de-identified configuration only — never patient data.
const SECTIONS: HubSection[] = [
  {
    title: 'Daily Operations',
    links: [
      { to: '/morning-huddle', icon: Sunrise, label: 'Morning Huddle', description: 'Start the day aligned as a team.' },
      { to: '/checklists', icon: ListChecks, label: 'Checklists', description: 'Daily, weekly, and role-based checklists.' },
      { to: '/deposit-log', icon: Banknote, label: 'Close the Day', description: 'Deposit log and end-of-day closeout.' },
      { to: '/incident-reports', icon: ShieldAlert, label: 'Incident Reports', description: 'Document and review office incidents.' },
    ],
  },
  {
    title: 'Patient Forms',
    links: [
      { to: '/fof', icon: ReceiptText, label: 'Financial Options Form', description: 'Prepare treatment financial options. Nothing patient-specific is stored.' },
      { to: '/fof/templates', icon: FileStack, label: 'Form Templates', description: 'Blank templates and office document styling.', managerOnly: true },
      { to: '/fof/fees', icon: DollarSign, label: 'Fee Schedule', description: 'Office fees, plans, and bundles.', managerOnly: true },
    ],
  },
  {
    title: 'Guidance',
    links: [
      { to: '/assistant', icon: Sparkles, label: 'Ask AI', description: 'Operational questions about your office setup.' },
    ],
  },
];

export default function Playbook() {
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Practice Playbook</h1>
        <p className="text-muted-foreground">How this office does excellent work.</p>
      </div>
      <HubLinkGrid sections={SECTIONS} isManager={isManager} />
    </div>
  );
}
