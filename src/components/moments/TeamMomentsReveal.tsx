import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MomentEnvelope } from '@/components/moments/MomentEnvelope';
import { announce, planReveal, type PendingMoment } from '@/components/moments/reactions';
import {
  useClaimedMoments,
  useEmployeeNameLookup,
  useMomentPrefs,
  useOpenMoments,
  toPending,
} from '@/hooks/useTeamMoments';

import { useReducedMotion } from '@/hooks/useReducedMotion';

/**
 * Presentational reveal surface. Exported separately so the design-review page
 * can render every state from fixtures without a session.
 *
 * Deliberately anchored, never a full-screen modal: it must not block
 * navigation, and on mobile it sits above the sticky clock bar rather than over
 * it.
 */
export function MomentRevealSurface({
  moments,
  animate,
  onDismiss,
  embedded = false,
}: {
  moments: PendingMoment[];
  animate: boolean;
  onDismiss: () => void;
  /** Render inline (design review) instead of fixed to the viewport. */
  embedded?: boolean;
}) {
  const [index, setIndex] = useState(0);
  const current = moments[Math.min(index, moments.length - 1)];
  if (!current) return null;

  const many = moments.length > 1;

  return (
    <div
      className={cn(
        'z-40 w-full max-w-sm',
        !embedded && 'fixed bottom-[calc(env(safe-area-inset-bottom)+5.5rem)] right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6',
      )}
    >
      {/* Text-only equivalent for assistive tech — no decorative emoji. */}
      <p className="sr-only" role="status" aria-live="polite">
        {announce(moments)}
      </p>

      <div className="border-2 border-ink bg-paper shadow-none" aria-label="Team moment">
        <div className="relative">
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss team moment"
            className="pe-focus absolute right-2 top-2 z-10 p-2 text-paper/80 hover:text-paper"
          >
            <X className="h-4 w-4" />
          </button>
          <MomentEnvelope moment={current} animate={animate} />
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-ink/20 px-4 py-3">
          {many ? (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
                {index + 1} of {moments.length}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="pe-focus px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft disabled:opacity-40"
                  onClick={() => setIndex((i) => Math.max(0, i - 1))}
                  disabled={index === 0}
                >
                  Prev
                </button>
                {index < moments.length - 1 ? (
                  <button
                    type="button"
                    className="pe-focus bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper"
                    onClick={() => setIndex((i) => i + 1)}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="pe-focus bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper"
                    onClick={onDismiss}
                  >
                    Done
                  </button>
                )}
              </div>
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">Saved to your moments</p>
              <button
                type="button"
                className="pe-focus bg-ink px-3 py-1.5 font-mono text-[10px] uppercase tracking-[0.16em] text-paper"
                onClick={onDismiss}
              >
                Thanks
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Live version, mounted once inside the authenticated shell.
 *
 * It renders ONLY the batch the database handed this device through
 * `claim_team_moments`, then confirms presentation with `open_team_moments`.
 * Two devices cannot claim the same moment; if this one closes before
 * confirming, the two-minute claim lease expires and the moment returns.
 */
export default function TeamMomentsReveal() {
  const { data: claimed } = useClaimedMoments();
  const { data: prefs } = useMomentPrefs();
  const nameOf = useEmployeeNameLookup();
  const reduced = useReducedMotion();
  const openMoments = useOpenMoments();
  const [dismissed, setDismissed] = useState(false);
  const confirmedRef = useRef<string | null>(null);

  const moments = useMemo(
    () => (claimed ?? []).map((row) => toPending(row, nameOf(row.sender_employee_id))),
    [claimed, nameOf],
  );

  const plan = planReveal(moments, { reducedMotion: reduced, muted: !!prefs?.animations_muted });

  useEffect(() => {
    if (!plan.show || dismissed) return;
    const ids = plan.order.map((m) => m.id);
    const key = ids.join(',');
    if (confirmedRef.current === key) return; // replay guard within this session
    confirmedRef.current = key;
    // Confirm only once the surface has actually painted.
    const raf = requestAnimationFrame(() => openMoments.mutate(ids));
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan.show, plan.order.length, dismissed]);

  if (!plan.show || dismissed) return null;

  return <MomentRevealSurface moments={plan.order} animate={plan.animate} onDismiss={() => setDismissed(true)} />;
}

