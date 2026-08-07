import {
  Sunrise, ListChecks, Banknote, ShieldAlert, ReceiptText, FileStack,
  DollarSign, Sparkles, ShieldCheck, Phone, CalendarX, FileSignature,
  Library, Layers, ClipboardList, BookOpenCheck, FileText, GraduationCap,
  Mail,
} from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useBrokenApptSettings } from '@/hooks/useBrokenApptSettings';
import { DEFAULT_BA_SETTINGS } from '@/lib/broken-appts/defaults';
import HubLinkGrid, { HubSection } from '@/components/HubLinkGrid';

// Practice Playbook: how the office performs excellent work (blueprint §2).
// Blank templates and de-identified configuration only — never patient data.
// The Broken Appointments entry is labeled per office (module_nav_label).
const buildSections = (brokenApptLabel: string): HubSection[] => [
  {
    title: 'Daily Operations',
    links: [
      { to: '/playbook/procedures', icon: BookOpenCheck, label: 'Office Procedures', description: 'The reviewed, published steps for how this dental office performs work.' },
      { to: '/morning-huddle', icon: Sunrise, label: 'Morning Huddle', description: 'Start the day aligned as a team.' },
      { to: '/checklists', icon: ListChecks, label: 'Checklists', description: 'Daily, weekly, and role-based checklists.' },
      { to: '/deposit-log', icon: Banknote, label: 'Close the Day', description: 'Deposit log and end-of-day closeout.' },
      { to: '/incident-reports', icon: ShieldAlert, label: 'Incident Reports', description: 'Document and review office incidents.' },
      { to: '/broken-appointments', icon: CalendarX, label: brokenApptLabel, description: 'No-shows and late cancellations: letters, replies, and Dentrix blocks. Nothing patient-specific is stored.' },
    ],
  },
  {
    title: 'Letters and Notes',
    links: [
      { to: '/letters', icon: Mail, label: 'Letters & Notes', description: 'Office correspondence on one canonical letterhead: letters, notes, saved wording, signatures.' },
      { to: '/letters/write', icon: FileText, label: 'Write on Letterhead', description: 'A one-off office letter — write, preview, print. Nothing patient-specific is stored.' },
      { to: '/letters/school-work-note', icon: GraduationCap, label: 'School / Work Note', description: 'A fast excuse note for school or work. Temporary details, printed, then cleared.' },
    ],
  },
  {
    title: 'Forms and Consents',
    links: [
      { to: '/consents/complete', icon: ClipboardList, label: 'Complete Forms', description: 'Guided consent packet: select, fill, print, and clear.' },
      { to: '/consents/library', icon: Library, label: 'Form Library', description: 'Every office consent and instruction form, versioned.' },
      { to: '/consents/bundles', icon: Layers, label: 'Treatment Bundles', description: 'The forms each treatment needs, in print order.' },
      { to: '/consents', icon: FileSignature, label: 'Forms & Consents Home', description: 'Dashboard, uploads, builder, and office settings.' },
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
    title: 'Reference',
    links: [
      { to: '/important-numbers', icon: Phone, label: 'Important Numbers', description: 'Practice credentials, team, referral offices, labs, and carriers.' },
      { to: '/insurance-desk', icon: ShieldCheck, label: 'Insurance Desk', description: 'Carrier manuals, claims guidance, plan rules, and provider references.' },
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
  const { data: baSettings } = useBrokenApptSettings();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const sections = buildSections(
    baSettings?.moduleNavLabel || DEFAULT_BA_SETTINGS.moduleNavLabel
  );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Practice Playbook</h1>
        <p className="text-muted-foreground">How this office does excellent work.</p>
      </div>
      <HubLinkGrid sections={sections} isManager={isManager} />
    </div>
  );
}
