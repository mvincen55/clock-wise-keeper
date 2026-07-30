import { cn } from '@/lib/utils';

/**
 * Progress toward the goal's measurable target. Where the target starts with a
 * number ("20 recall calls"), the plan's completion is mapped onto it so the
 * member sees roughly where they stand — the plan is built to hit the target.
 * Non-numeric targets ("100% verified") show the same bar without a count.
 */
export function parseTargetNumber(target: string | null): number | null {
  if (!target) return null;
  const match = target.match(/(\d[\d,]*)/);
  if (!match) return null;
  const n = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(n) || n <= 0 || n > 100000) return null;
  // Percentages aren't a countable target.
  if (/%/.test(target)) return null;
  return n;
}

export default function TargetProgress({
  target,
  done,
  total,
  compact = false,
}: {
  target: string | null;
  done: number;
  total: number;
  compact?: boolean;
}) {
  if (!target) return null;

  const fraction = total > 0 ? done / total : 0;
  const targetNumber = parseTargetNumber(target);
  const soFar = targetNumber === null ? null : Math.round(fraction * targetNumber);

  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className={cn('text-muted-foreground', compact ? 'text-[11px]' : 'text-xs')}>
          Target: {target}
        </span>
        {soFar !== null && (
          <span className={cn('font-medium', compact ? 'text-[11px]' : 'text-xs')}>
            {soFar} of {targetNumber}
          </span>
        )}
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-[hsl(var(--goal-purple))] transition-all"
          style={{ width: `${Math.max(Math.min(fraction, 1) * 100, fraction > 0 ? 4 : 0)}%` }}
        />
      </div>
      {total === 0 && (
        <p className="text-[11px] text-muted-foreground">
          Break the goal into steps to start tracking this.
        </p>
      )}
    </div>
  );
}
