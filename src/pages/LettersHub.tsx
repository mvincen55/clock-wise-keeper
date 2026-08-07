import { FileText, GraduationCap, Library, PenLine, Settings2 } from 'lucide-react';
import { useOrgContext } from '@/hooks/useOrgContext';
import HubLinkGrid, { HubSection } from '@/components/HubLinkGrid';

// Letters & Notes: the office-correspondence hub. One canonical letterhead
// (OfficeLetterheadSheet) behind every entry — letters, school/work notes,
// and the reusable letter library. Blank wording and de-identified
// configuration only; completed patient letters are printed, never stored.
const SECTIONS: HubSection[] = [
  {
    title: 'Write & Print',
    links: [
      {
        to: '/letters/write',
        icon: FileText,
        label: 'Write on Letterhead',
        description: 'A one-off office letter on official letterhead — write, preview, print. Nothing patient-specific is stored.',
      },
      {
        to: '/letters/school-work-note',
        icon: GraduationCap,
        label: 'School / Work Note',
        description: 'A fast excuse note for school or work. Temporary details, printed output, then cleared.',
      },
    ],
  },
  {
    title: 'Office Library',
    links: [
      {
        to: '/letters/library',
        icon: Library,
        label: 'Saved Letters',
        description: 'Reusable office letters with safe placeholders — insurance appeals, employer letters, referral covers.',
      },
    ],
  },
  {
    title: 'Setup',
    links: [
      {
        to: '/letters/signature',
        icon: PenLine,
        label: 'My Signature',
        description: 'Draw or upload your real signature once; authorized letters carry it automatically.',
      },
      {
        to: '/letters/settings',
        icon: Settings2,
        label: 'Letterhead & Correspondence Settings',
        description: 'Default closing, office signer, note wording, and team permissions.',
        managerOnly: true,
      },
    ],
  },
];

export default function LettersHub() {
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold">Letters &amp; Notes</h1>
        <p className="text-muted-foreground">
          Every letter this office prints — one letterhead, one professional look.
        </p>
      </div>
      <HubLinkGrid sections={SECTIONS} isManager={isManager} />
    </div>
  );
}
