import { cn } from '@/lib/utils';

/**
 * A small purple ring showing plan progress. Amber when the work badly
 * trails the calendar. Quiet by design — no gamification.
 *
 * Shared by goal cards and sprint cards — the single ring in the app.
 */
export default function ProgressRing({
  done,
  total,
  monthElapsed,
  size = 44,
  stroke = 4,
  showLabel = true,
  className,
}: {
  done: number;
  total: number;
  /** 0–1 fraction of the period already spent; drives the "behind" amber. */
  monthElapsed: number;
  size?: number;
  stroke?: number;
  showLabel?: boolean;
  className?: string;
}) {
  const pct = total > 0 ? Math.min(1, done / total) : 0;
  const behind = total > 0 && pct + 0.25 < monthElapsed;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

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
        strokeDasharray={`${c * pct} ${c}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        stroke={
          total === 0
            ? 'hsl(var(--muted-foreground) / 0.35)'
            : behind
              ? 'hsl(var(--goal-amber))'
              : 'hsl(var(--goal-purple))'
        }
        className="transition-all"
      />
      {showLabel && (
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          className="fill-foreground text-[10px] font-medium"
        >
          {total > 0 ? `${done}/${total}` : '—'}
        </text>
      )}
    </svg>
  );
}
