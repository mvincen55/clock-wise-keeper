/**
 * Office Handbook — the Workplace's employee handbook reader.
 *
 * Governed, published policies are the canonical office copy. Until an office
 * deliberately publishes its first policy, the existing uploaded-document
 * reader remains available so migration never strands the team.
 */
import {
  AlarmClock, Banknote, BookOpen, CalendarOff, ClipboardCheck, HeartPulse, Siren,
} from 'lucide-react';
import DocumentLibraryReader, { type LibraryQuickLink } from '@/components/library/DocumentLibraryReader';
import PublishedKnowledgeReader from '@/components/knowledge/PublishedKnowledgeReader';
import type { LibraryScope } from '@/lib/doc-library';

const SCOPE: LibraryScope = { areas: ['workplace'], collections: ['handbook', 'hr'] };

const QUICK_LINKS: LibraryQuickLink[] = [
  { label: 'Late arrivals & no-shows', query: 'late arrival', icon: AlarmClock },
  { label: 'PTO & time off', query: 'time off', icon: CalendarOff },
  { label: 'Attendance', query: 'attendance', icon: ClipboardCheck },
  { label: 'Payroll & punches', query: 'payroll', icon: Banknote },
  { label: 'Benefits', query: 'benefits', icon: HeartPulse },
  { label: 'Emergencies', query: 'emergency', icon: Siren },
];

function LegacyHandbookReader() {
  return (
    <DocumentLibraryReader
      title="Office Handbook"
      subtitle="Policies, benefits, expectations, and information for working here."
      icon={BookOpen}
      scope={SCOPE}
      aiScope="handbook"
      askAiLabel="Ask AI"
      searchPlaceholder="Search the handbook — “late arrival”, “PTO accrual”, “dress code”…"
      quickLinks={QUICK_LINKS}
      emptyState={{
        title: 'The handbook is not here yet',
        body: 'A manager can add source documents in Ask AI → Documents, then turn them into reviewed office policies in Management → Knowledge Workspace.',
      }}
      documentsLabel="Source documents"
    />
  );
}

export default function OfficeHandbook() {
  return (
    <PublishedKnowledgeReader
      area="handbook"
      title="Office Handbook"
      subtitle="Policies, benefits, expectations, and information for working here."
      fallback={<LegacyHandbookReader />}
    />
  );
}
