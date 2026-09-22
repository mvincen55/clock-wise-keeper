import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import ManagementShell from '@/components/management/ManagementShell';
import PracticeVitalsCard from '@/components/PracticeVitalsCard';
import SprintCard from '@/components/SprintCard';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { useConsumedSearchParam } from '@/hooks/useDeepLink';
import type { AttentionKind } from '@/lib/attention';

/**
 * Management → Office (design §7.7): periodic management of the office as a
 * whole. An index list with one live fact per area and no cards. Nothing
 * here is a queue; anything that needs a decision is already in Attention.
 */
type Area = { label: string; to: string; what: string; kinds?: AttentionKind[]; fact?: (n: number) => string };

const AREAS: Area[] = [
  { label: 'Policies & procedures', to: '/management/knowledge', what: 'Draft, review, and publish the handbook and playbook', kinds: ['content_review'], fact: n => `${n} in review` },
  { label: 'Acknowledgments', to: '/management/office/acknowledgments', what: 'Who has opened, signed, paused, or missed a required version', kinds: ['ack_escalated'], fact: n => `${n} escalated to you` },
  { label: 'Training', to: '/training', what: 'Library, drafts, assignments', kinds: ['training_overdue'], fact: n => `${n} overdue` },
  { label: 'Goals & challenges', to: '/goals', what: 'Targets, the month’s challenge, verification', kinds: ['challenge_verify'], fact: n => `${n} to verify` },
  { label: 'Incidents', to: '/incident-reports', what: 'Injury and exposure reports, signatures, follow-up', kinds: ['incident_countersign', 'incident_followup'], fact: n => `${n} open with you` },
  { label: 'Missed appointments', to: '/management/missed-appointments', what: 'Dentrix no-shows and late cancellations by month, department, and provider' },
  { label: 'Calendar & closures', to: '/office-calendar', what: 'Closures, events, and the office schedule' },
  { label: 'Practice setup', to: '/practice-setup', what: 'Sort existing documents and create human-confirmed office drafts' },
  { label: 'Office settings', to: '/management/office/settings', what: 'Identity, hours and closures, payroll, PTO policy, attendance grace, escalation chains, permissions, providers, messaging' },
];

export default function OfficeIndex() {
  const attention = useAttentionItems();
  // Sprint notices deep-link here for admins (`?sprint=`); Home shows the
  // challenge only while it is noteworthy.
  const linkedSprintId = useConsumedSearchParam('sprint');
  const countFor = (kinds?: AttentionKind[]) => (kinds ? attention.unresolved.filter(i => kinds.includes(i.kind)).length : 0);
  return (
    <ManagementShell room="office">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Office</h1>
          <p className="text-sm text-muted-foreground">Periodic management of the office as a whole.</p>
        </div>

        <ul className="divide-y rounded-lg border">
          {AREAS.map(a => {
            const n = countFor(a.kinds);
            return (
              <li key={a.to}>
                <Link to={a.to} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                  <span className="min-w-0">
                    <span className="font-medium">{a.label}</span>
                    <span className="block text-sm text-muted-foreground">{a.what}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                    {a.fact && n > 0 && <span>{a.fact(n)}</span>}
                    <ChevronRight className="h-4 w-4" />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        <section aria-labelledby="goals-challenges" className="space-y-3">
          <h2 id="goals-challenges" className="text-lg font-semibold">Goals &amp; challenges</h2>
          <p className="text-sm text-muted-foreground">The month’s challenge lives here; Home mentions it only when it needs a decision, is off track, is ending, or has finished.</p>
          <SprintCard highlightId={linkedSprintId} />
        </section>

        <section aria-labelledby="practice-performance" className="space-y-3">
          <h2 id="practice-performance" className="text-lg font-semibold">Practice performance</h2>
          <p className="text-sm text-muted-foreground">Targets and pace read only sealed closeouts; missed appointments are the Dentrix postings.</p>
          <PracticeVitalsCard />
        </section>
      </div>
    </ManagementShell>
  );
}
