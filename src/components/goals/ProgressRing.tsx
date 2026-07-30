import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { usePrefersReducedMotion } from '@/lib/motion';

/**
 * A small purple ring showing plan progress. Amber when the work badly
 * trails the calendar. It draws itself in on load — calm, once, then still.
 */
export default function ProgressRing({
  done,
  total,
  monthElapsed,
  size = 44,
  className,
}: {
  done: number;
  total: number;
  monthElapsed: number;
  size?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const pct = total > 0 ? done / total : 0;
  const behind = total > 0 && pct + 0.25 < monthElapsed;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  // Draw-in: start empty on mount, settle on the real value next frame.
  const [drawn, setDrawn] = useState(reduced ? pct : 0);
  useEffect(() => {
    if (reduced) {
      setDrawn(pct);
      return;
    }
    const id = requestAnimationFrame(() => setDrawn(pct));
    return () => cancelAnimationFrame(id);
  }, [pct, reduced]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('shrink-0', className)}
      role="img"
      aria-label={total > 0 ? `${done} of ${total} steps done` : 'No plan yet'}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        className="stroke-muted"
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * drawn} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        stroke={
          total === 0
            ? 'hsl(var(--muted-foreground) / 0.35)'
            : behind
              ? 'hsl(var(--goal-amber))'
              : 'hsl(var(--goal-purple))'
        }
        className="ring-draw"
        style={{ transition: 'stroke-dasharray 900ms cubic-bezier(0.22, 1, 0.36, 1), stroke 400ms ease' }}
      />
      <text
        x="50%"
        y="50%"
        dominantBaseline="central"
        textAnchor="middle"
        className="fill-foreground text-[10px] font-medium"
      >
        {total > 0 ? `${done}/${total}` : '—'}
      </text>
    </svg>
  );
}
