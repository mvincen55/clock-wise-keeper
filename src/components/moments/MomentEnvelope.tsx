import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { EnvelopeMark } from '@/marketing/EnvelopeMark';
import { getReaction, type PendingMoment } from '@/components/moments/reactions';

/**
 * The reveal itself: a hard-cornered purple envelope whose Y-fold flap tips
 * open, a brief burst of sparks flies from it, the reaction lifts, then
 * everything settles into a plain card.
 *
 * The celebration stays inside the card — no full-screen takeover. When motion
 * is off (OS preference or the person's own mute) it renders the settled state
 * immediately and skips the sparks.
 */

/** Hard-cornered confetti sparks: direction, spin, and delay per piece. */
const SPARKS: { dx: string; dy: string; rot: string; delay: string; size: number; gold: boolean }[] = [
  { dx: '-30px', dy: '-26px', rot: '-50deg', delay: '40ms', size: 6, gold: true },
  { dx: '2px', dy: '-34px', rot: '30deg', delay: '0ms', size: 5, gold: false },
  { dx: '30px', dy: '-24px', rot: '60deg', delay: '70ms', size: 7, gold: true },
  { dx: '-38px', dy: '-4px', rot: '-25deg', delay: '110ms', size: 5, gold: false },
  { dx: '40px', dy: '-2px', rot: '45deg', delay: '90ms', size: 6, gold: false },
  { dx: '-24px', dy: '18px', rot: '-70deg', delay: '140ms', size: 5, gold: true },
  { dx: '18px', dy: '22px', rot: '35deg', delay: '120ms', size: 6, gold: false },
  { dx: '36px', dy: '14px', rot: '80deg', delay: '170ms', size: 5, gold: true },
];

export function MomentEnvelope({
  moment,
  animate,
  className,
}: {
  moment: PendingMoment;
  animate: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(!animate);
  const reaction = getReaction(moment.reaction);

  useEffect(() => {
    if (!animate) {
      setOpen(true);
      return;
    }
    setOpen(false);
    const t = window.setTimeout(() => setOpen(true), 220);
    return () => window.clearTimeout(t);
  }, [animate, moment.id]);

  return (
    <div className={cn('bg-paper text-ink', className)}>
      {/* Envelope field */}
      <div className="relative overflow-hidden bg-plum px-5 pb-5 pt-6 text-paper" style={{ ['--pe-knockout' as any]: '#F7F5F1' }}>
        <div className="flex items-start gap-4">
          <div className="relative shrink-0">
            <div className={cn(animate && 'pe-moment-flap', open && 'is-open')}>
              <EnvelopeMark className="h-10 w-14 text-paper" stroke={4} />
            </div>
            {animate && (
              <span aria-hidden className={cn('pe-moment-burst', open && 'is-open')}>
                {SPARKS.map((s, i) => (
                  <span
                    key={i}
                    className={cn('pe-moment-spark', s.gold ? 'bg-gold' : 'bg-paper')}
                    style={
                      {
                        width: s.size,
                        height: s.size,
                        '--spark-dx': s.dx,
                        '--spark-dy': s.dy,
                        '--spark-rot': s.rot,
                        '--spark-delay': s.delay,
                      } as React.CSSProperties
                    }
                  />
                ))}
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-paper/70">Team moment</p>
            <p
              className={cn(
                'pe-display-tight mt-1 text-[1.35rem] leading-tight',
                animate && 'pe-moment-rise',
                open && 'is-open',
              )}
            >
              <span aria-hidden className="mr-2">
                {reaction?.emoji}
              </span>
              {reaction?.label ?? 'Recognition'}
            </p>
            <p className="mt-1 text-[13px] text-paper/85">From {moment.sender_name}</p>
          </div>
        </div>
      </div>

      {(moment.message || moment.context_label) && (
        <div className="border-x border-b border-ink/20 px-5 py-4">
          {moment.message && <p className="text-[14px] leading-relaxed text-ink">“{moment.message}”</p>}
          {moment.context_label && (
            <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-soft">
              {moment.context_label}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
