import { cn } from '@/lib/utils';

/**
 * Progress for a goal: steps done vs total, with a thin line underneath
 * showing how much of the month has elapsed. Purple while pacing is fine,
 * amber (gently) when the work badly trails the calendar.
 */
export default function GoalProgress({
  done,
  total,
  monthElapsed,
  compact = false,
}: {
  done: number;
  total: number;
  monthElapsed: number;
  compact?: boolean;
}) {
  if (total === 0) {
    return (
      <p className={cn('text-muted-foreground', compact ? 'text-xs' : 'text-sm')}>No plan yet</p>
    );
  }

  const pct = done / total;
  const behind = pct + 0.25 < monthElapsed;

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
          {done} of {total} steps
        </span>
        <span className="text-xs text-muted-foreground">
          {Math.round(monthElapsed * 100)}% of the month
        </span>
      </div>

      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            behind ? 'bg-[hsl(var(--goal-amber))]' : 'bg-[hsl(var(--goal-purple))]'
          )}
          style={{ width: `${Math.max(pct * 100, pct > 0 ? 4 : 0)}%` }}
        />
      </div>

      <div className="h-px w-full bg-border">
        <div
          className="h-px bg-muted-foreground/50"
          style={{ width: `${Math.min(monthElapsed * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}
