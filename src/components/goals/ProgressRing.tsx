import { cn } from '@/lib/utils';

/**
 * A small ring showing steps done vs total. Purple normally, amber when the
 * work badly trails the calendar. Calm — no gamification, no confetti.
 */
export default function ProgressRing({
  done,
  total,
  monthElapsed = 0,
  size = 44,
  className,
}: {
  done: number;
  total: number;
  monthElapsed?: number;
  size?: number;
  className?: string;
}) {
  const pct = total > 0 ? done / total : 0;
  const behind = total > 0 && pct + 0.25 < monthElapsed;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className={cn('relative shrink-0', className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
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
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={cn(
            'transition-all',
            total === 0
              ? 'stroke-transparent'
              : behind
                ? 'stroke-[hsl(var(--goal-amber))]'
                : 'stroke-[hsl(var(--goal-purple))]'
          )}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums">
        {total === 0 ? '–' : `${Math.round(pct * 100)}%`}
      </span>
    </div>
  );
}
