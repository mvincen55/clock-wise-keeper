import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { EnvelopeMark } from '@/marketing/EnvelopeMark';
import { getReaction, type PendingMoment } from '@/components/moments/reactions';

/**
 * The reveal itself: a hard-cornered purple envelope whose Y-fold flap tips
 * open, the reaction lifts, then everything settles into a plain card.
 *
 * No confetti, no full-screen takeover. When motion is off (OS preference or
 * the person's own mute) it renders the settled state immediately.
 */
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
          <div className={cn('relative shrink-0', animate && 'pe-moment-flap', open && 'is-open')}>
            <EnvelopeMark className="h-10 w-14 text-paper" stroke={4} />
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
