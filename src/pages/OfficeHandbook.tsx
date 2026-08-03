/**
 * Office Handbook — the Workplace's employee handbook reader.
 *
 * Opens the actual handbook immediately (no shelf), with HR documents in
 * the same compact switcher when they exist. Search and Ask AI here cover
 * Workplace handbook + HR content only — insurance manuals and other
 * Practice Playbook references live in the Insurance Desk.
 */
import { BookOpen } from 'lucide-react';
import DocumentLibraryReader from '@/components/library/DocumentLibraryReader';
import type { LibraryScope } from '@/lib/doc-library';

const SCOPE: LibraryScope = { areas: ['workplace'], collections: ['handbook', 'hr'] };

// Frequently used policies — each fires a scoped full-text search.
const QUICK_LINKS = [
  { label: 'Late arrivals & no-shows', query: 'late arrival' },
  { label: 'PTO & time off', query: 'time off' },
  { label: 'Attendance', query: 'attendance' },
  { label: 'Payroll & punches', query: 'payroll' },
  { label: 'Benefits', query: 'benefits' },
  { label: 'Emergencies', query: 'emergency' },
];

export default function OfficeHandbook() {
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
        body: 'A manager can add the employee handbook and office policies in Ask AI → Documents, placing them in Workplace.',
      }}
      documentsLabel="Documents"
    />
  );
}
