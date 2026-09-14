/**
 * Office Handbook — the Workplace's employee handbook reader.
 *
 * Governed, published policies are the canonical office copy. Until an office
 * deliberately publishes its first policy, the existing uploaded-document
 * reader remains available so migration never strands the team.
 */
import {
  AlarmClock, Banknote, BookOpen, CalendarOff, Siren,
} from 'lucide-react';
import DocumentLibraryReader, { type LibraryQuickLink } from '@/components/library/DocumentLibraryReader';
import PublishedKnowledgeReader from '@/components/knowledge/PublishedKnowledgeReader';
import type { LibraryScope } from '@/lib/doc-library';

const SCOPE: LibraryScope = { areas: ['workplace'], collections: ['handbook', 'hr'] };

const QUICK_LINKS: LibraryQuickLink[] = [
  { label: 'Absences & Late Arrivals', query: 'attendance policy', icon: AlarmClock },
  { label: 'Time Off', query: 'time off', icon: CalendarOff },
  { label: 'Pay & Timekeeping', query: 'payroll', icon: Banknote },
  { label: 'Emergencies', query: 'emergency', icon: Siren },
];

function LegacyHandbookReader() {
  return (
    <DocumentLibraryReader
      title="Employee Handbook"
      subtitle="Policies, benefits, expectations, and information for working here."
      appearance="handbook"
      icon={BookOpen}
      scope={SCOPE}
      aiScope="handbook"
      askAiLabel="Ask about this handbook"
      searchPlaceholder="Search handbook text…"
      quickLinks={QUICK_LINKS}
      emptyState={{
        title: 'The handbook is not here yet',
        body: 'Ask your manager for the current handbook. Managers can add documents in the assistant’s Documents tab or prepare policies in Manage Policies & Procedures.',
      }}
      documentsLabel="Source documents"
    />
  );
}

export default function OfficeHandbook() {
  return (
    <PublishedKnowledgeReader
      area="handbook"
      title="Employee Handbook"
      subtitle="Policies, benefits, expectations, and information for working here."
      fallback={<LegacyHandbookReader />}
    />
  );
}
