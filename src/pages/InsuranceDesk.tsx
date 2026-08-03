/**
 * Insurance Desk — the Practice Playbook's carrier reference desk.
 *
 * Same reader system as the Office Handbook, configured for insurance
 * content: carrier manuals (the Delta Dental MA processing and provider
 * manuals today) as compact selectable documents, search scoped to
 * insurance references only. Internal business references — never
 * patient records.
 */
import { ShieldCheck } from 'lucide-react';
import DocumentLibraryReader from '@/components/library/DocumentLibraryReader';
import type { LibraryScope } from '@/lib/doc-library';

const SCOPE: LibraryScope = { areas: ['playbook'], collections: ['insurance'] };

// Each shortcut is a real scoped search into the carrier manuals.
const QUICK_LINKS = [
  { label: 'Claims & attachments', query: 'claim' },
  { label: 'Eligibility & benefits', query: 'eligibility' },
  { label: 'Frequencies & limitations', query: 'frequency' },
  { label: 'Downgrades & alternate benefits', query: 'downgrade' },
  { label: 'Provider participation', query: 'participating provider' },
  { label: 'Appeals & corrections', query: 'appeal' },
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
