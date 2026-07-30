import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/motion';

/**
 * A one-second purple wax seal. Earned moments only — a monthly target met,
 * a goal finished, a module passed. It presses in, settles, and leaves.
 * Quiet on purpose: no confetti, no sound, no scoreboard.
 */
export function WaxSealMark({
  size = 72,
  className,
  label = 'PE',
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={cn('drop-shadow-sm', className)}
      role="img"
      aria-label="Wax seal"
    >
      <defs>
        <radialGradient id="wax-grad" cx="38%" cy="32%">
          <stop offset="0%" stopColor="hsl(265 34% 48%)" />
          <stop offset="70%" stopColor="hsl(265 30% 34%)" />
          <stop offset="100%" stopColor="hsl(265 34% 24%)" />
        </radialGradient>
      </defs>
      {/* Irregular wax edge — pressed, not printed */}
      <path
        d="M50 4c9 0 12 6 20 8s14-2 19 6-1 14 2 22 8 12 4 20-12 7-17 14-5 14-13 17-13-3-21-3-13 6-21 3-8-10-13-17-13-6-17-14 1-12 4-20-3-14 2-22 11-4 19-6S41 4 50 4z"
        fill="url(#wax-grad)"
      />
      <circle
        cx="50"
        cy="50"
        r="30"
        fill="none"
        stroke="hsl(265 40% 68% / 0.55)"
        strokeWidth="1.5"
      />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fill="hsl(265 55% 88%)"
        fontSize="22"
        fontWeight="700"
        letterSpacing="1"
        fontFamily="'JetBrains Mono', monospace"
      >
        {label}
      </text>
    </svg>
  );
}

/**
 * Overlay that stamps a seal for one second, then hands the surface back.
 * `show` going true fires it once; `onDone` runs when the moment is over.
 */
export default function WaxSeal({
  show,
  onDone,
  caption,
  label = 'PE',
}: {
  show: boolean;
  onDone?: () => void;
  caption?: string;
  label?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!show) return;
    setVisible(true);
    const ms = reduced ? 1200 : 1400;
    const t = setTimeout(() => {
      setVisible(false);
      onDone?.();
    }, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show, reduced]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-[inherit] bg-background/70 backdrop-blur-[1px]"
      role="status"
      aria-live="polite"
    >
      <div className={reduced ? '' : 'seal-stamp'}>
        <WaxSealMark label={label} />
      </div>
      {caption && (
        <p className={cn('text-xs font-medium text-primary', !reduced && 'seal-caption')}>
          {caption}
        </p>
      )}
    </div>
  );
}
