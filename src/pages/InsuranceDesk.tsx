/**
 * Insurance Desk — the Practice Playbook's carrier reference desk.
 *
 * Same reader system as the Office Handbook, configured for insurance
 * content: carrier manuals (the Delta Dental MA processing and provider
 * manuals today) as compact selectable documents, search scoped to
 * insurance references only. Internal business references — never
 * patient records.
 */
import {
  ArrowDownRight, BadgeCheck, FileCheck, Repeat, Scale, ShieldCheck, Users,
} from 'lucide-react';
import DocumentLibraryReader, { type LibraryQuickLink } from '@/components/library/DocumentLibraryReader';
import type { LibraryScope } from '@/lib/doc-library';

const SCOPE: LibraryScope = { areas: ['playbook'], collections: ['insurance'] };

// Each shortcut is a real scoped search into the carrier manuals.
const QUICK_LINKS: LibraryQuickLink[] = [
  { label: 'Claims & attachments', query: 'claim', icon: FileCheck },
  { label: 'Eligibility & benefits', query: 'eligibility', icon: BadgeCheck },
  { label: 'Frequencies & limitations', query: 'frequency', icon: Repeat },
  { label: 'Downgrades & alternate benefits', query: 'downgrade', icon: ArrowDownRight },
  { label: 'Provider participation', query: 'participating provider', icon: Users },
  { label: 'Appeals & corrections', query: 'appeal', icon: Scale },
];

export default function InsuranceDesk() {
  return (
    <DocumentLibraryReader
      title="Insurance Desk"
      subtitle="Carrier manuals and insurance references used by this office."
      icon={ShieldCheck}
      scope={SCOPE}
      aiScope="insurance"
      askAiLabel="Ask AI about insurance"
      searchPlaceholder="Search carrier manuals — “crown frequency”, “predetermination”, “timely filing”…"
      quickLinks={QUICK_LINKS}
      emptyState={{
        title: 'No carrier manuals yet',
        body: 'A manager can add insurance carrier manuals in Ask AI → Documents, placing them in the Practice Playbook as insurance references.',
      }}
      documentsLabel="Manuals"
    />
  );
}
