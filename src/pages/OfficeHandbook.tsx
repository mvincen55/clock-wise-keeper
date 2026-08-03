/**
 * Office Handbook — the Workplace's employee handbook reader.
 *
 * Opens the actual handbook immediately (no shelf), with HR documents in
 * the same compact switcher when they exist. Search and Ask AI here cover
 * Workplace handbook + HR content only — insurance manuals and other
 * Practice Playbook references live in the Insurance Desk.
 */
import {
  AlarmClock, Banknote, BookOpen, CalendarOff, ClipboardCheck, HeartPulse, Siren,
} from 'lucide-react';
import DocumentLibraryReader, { type LibraryQuickLink } from '@/components/library/DocumentLibraryReader';
import type { LibraryScope } from '@/lib/doc-library';

const SCOPE: LibraryScope = { areas: ['workplace'], collections: ['handbook', 'hr'] };

// Frequently used policies — each fires a scoped full-text search.
const QUICK_LINKS: LibraryQuickLink[] = [
  { label: 'Late arrivals & no-shows', query: 'late arrival', icon: AlarmClock },
  { label: 'PTO & time off', query: 'time off', icon: CalendarOff },
  { label: 'Attendance', query: 'attendance', icon: ClipboardCheck },
  { label: 'Payroll & punches', query: 'payroll', icon: Banknote },
  { label: 'Benefits', query: 'benefits', icon: HeartPulse },
  { label: 'Emergencies', query: 'emergency', icon: Siren },
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
