import { useParams, Link } from 'react-router-dom';
import NotFound from './NotFound';
import { PRODUCTION_HOSTS } from './DesignReview';
import { MomentRevealSurface } from '@/components/moments/TeamMomentsReveal';
import type { PendingMoment } from '@/components/moments/reactions';

/**
 * TEMPORARY — preview-only review of the Team Moments reveal states.
 * Static fixtures: no session, no queries, no permissions. Delete with
 * DesignReview.tsx.
 */

const SINGLE: PendingMoment[] = [
  {
    id: 'm1',
    reaction: 'celebrate',
    message: 'Thank you for covering assisting yesterday.',
    context_label: 'Covering Assisting',
    created_at: '2026-08-06T14:02:00Z',
    sender_name: 'Megan',
  },
];

const MANY: PendingMoment[] = [
  ...SINGLE,
  {
    id: 'm2',
    reaction: 'great_save',
    message: 'You caught the double-booked hygiene column before it hit the day.',
    context_label: 'Front Desk',
    created_at: '2026-08-06T16:40:00Z',
    sender_name: 'Dr. Harelick',
  },
  {
    id: 'm3',
    reaction: 'team_win',
    message: null,
    context_label: null,
    created_at: '2026-08-07T09:15:00Z',
    sender_name: 'Priya',
  },
];

export const MOMENT_SCENARIOS: {
  slug: string;
  title: string;
  note: string;
  moments: PendingMoment[];
  animate: boolean;
}[] = [
  { slug: 'single', title: 'One moment', note: 'Default reveal: card pops in, envelope opens, sparks fly, reaction rises, settles.', moments: SINGLE, animate: true },
  { slug: 'multiple', title: 'Several waiting', note: 'One combined opening, then a compact stack — never several blocking animations.', moments: MANY, animate: true },
  { slug: 'reduced-motion', title: 'Reduced motion', note: 'OS prefers-reduced-motion: renders the settled state immediately.', moments: SINGLE, animate: false },
  { slug: 'muted', title: 'Muted preference', note: 'Person muted the animation: still delivered, already opened.', moments: MANY, animate: false },
];

export default function DesignReviewMoments() {
  const host = typeof window !== 'undefined' ? window.location.hostname : '';
  if (PRODUCTION_HOSTS.includes(host)) return <NotFound />;
  const { scenario } = useParams();
  const active = MOMENT_SCENARIOS.find((s) => s.slug === scenario);

  if (!active) {
    return (
      <div className="min-h-screen bg-paper px-5 py-14 font-sans text-ink sm:px-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="pe-display text-[clamp(2rem,7vw,3.5rem)]">Team moments</h1>
          <div className="mt-10 border-t-2 border-ink">
            {MOMENT_SCENARIOS.map((s) => (
              <Link
                key={s.slug}
                to={`/design-review/moments/${s.slug}`}
                className="pe-focus block border-b border-ink/16 py-6 hover:bg-ink/[0.04]"
              >
                <p className="pe-display text-[1.3rem]">{s.title}</p>
                <p className="mt-2 text-[14px] text-ink-soft">{s.note}</p>
              </Link>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper px-5 py-12 font-sans text-ink sm:px-10">
      <div className="mx-auto max-w-3xl">
        <Link to="/design-review/moments" className="pe-focus font-mono text-[10px] uppercase tracking-[0.2em] text-plum">
          ← All moment states
        </Link>
        <h1 className="pe-display mt-4 text-[clamp(1.8rem,6vw,3rem)]">{active.title}</h1>
        <p className="mt-4 max-w-[54ch] text-[15px] leading-relaxed text-ink-soft">{active.note}</p>

        <div className="mt-10 max-w-sm">
          <MomentRevealSurface moments={active.moments} animate={active.animate} onDismiss={() => {}} embedded />
        </div>

        <div className="mt-14 border-t-2 border-ink pt-6 text-[13px] leading-relaxed text-ink-soft">
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink">Boundaries held here</p>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>Positive reactions only — the allowed set is closed in the database.</li>
            <li>Sender always named. No anonymous recognition.</li>
            <li>Separate from notifications, so it can never obscure an approval or acknowledgment.</li>
            <li>Reveal is write-once: it opens exactly once across devices and refreshes.</li>
            <li>No leaderboard, score, streak, or ranking. Not a performance record.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
