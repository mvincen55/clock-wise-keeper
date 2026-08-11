import { useEffect, useMemo, useState } from 'react';
import { cn } from '@/lib/utils';
import { confettiPlan, confettiSettleMs, type ConfettiTone } from '@/components/moments/confetti';

const TONE_CLASS: Record<ConfettiTone, string> = {
  plum: 'bg-plum',
  'plum-deep': 'bg-plum-deep',
  'plum-tint': 'bg-plum-tint',
  gold: 'bg-gold',
};

/**
 * The confetti layer that flies alongside the reveal card. Purely decorative
 * and pointer-transparent; it unmounts itself once the last piece settles.
 *
 * The caller only renders this when the reveal is animating, so the personal
 * mute and reduced-motion never see it (the stylesheet hides it as well).
 */
export function MomentConfetti({ reaction, burstKey }: { reaction: string; burstKey: string }) {
  const plan = useMemo(() => confettiPlan(reaction), [reaction]);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    setSettled(false);
    const t = window.setTimeout(() => setSettled(true), confettiSettleMs(plan) + 250);
    return () => window.clearTimeout(t);
  }, [burstKey, plan]);

  if (settled) return null;

  return (
    <div aria-hidden className="pe-confetti">
      {plan.pieces.map((p, i) => (
        <span
          key={`${burstKey}-${i}`}
          className={cn(
            'pe-confetti-piece',
            `pe-confetti-${plan.motion}`,
            `pe-confetti-${p.shape}`,
            TONE_CLASS[p.tone],
          )}
          style={
            {
              left: `${p.xPct}%`,
              width: p.widthPx,
              height: p.heightPx,
              animationDelay: `${p.delayMs}ms`,
              animationDuration: `${p.durationMs}ms`,
              '--cf-dx': `${p.dxPx}px`,
              '--cf-y1': `${p.midYPx}px`,
              '--cf-y2': `${p.endYPx}px`,
              '--cf-rot': `${p.rotDeg}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
