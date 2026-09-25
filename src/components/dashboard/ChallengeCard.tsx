import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { GoalBrief } from './types';

/**
 * The shared office challenge, once: title, state, the tally, the bar, the
 * window. Never the editor — Office → Goals & challenges owns that.
 */
export function ChallengeCard({ goal, compact, reviewHref }: { goal: GoalBrief; compact?: boolean; reviewHref?: string }) {
  return (
    <div className="border-b border-border py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className={cn('font-semibold leading-snug', compact ? 'text-[14.5px]' : 'text-[15px]')}>{goal.title}</p>
        <span
          className={cn(
            'font-mono text-[10px] uppercase tracking-[0.12em]',
            goal.state === 'on_track' && 'text-success',
            goal.state === 'needs_push' && 'text-warning',
            goal.state === 'awaiting_verification' && 'text-primary',
          )}
        >
          {goal.stateLabel}
        </span>
      </div>
      <p className={cn('mt-3 font-display font-extrabold leading-none tracking-[-0.02em]', compact ? 'text-[1.7rem]' : 'text-[2rem]')}>
        {goal.done}
        <span className={cn('text-muted-foreground', compact ? 'text-[1.1rem]' : 'text-[1.25rem]')}> / {goal.total}</span>
      </p>
      <div className="mt-3 h-1.5 w-full bg-muted" role="meter" aria-label={`${goal.title}: ${goal.done} of ${goal.total}`} aria-valuemin={0} aria-valuemax={goal.total} aria-valuenow={goal.done}>
        <div
          className={cn('h-full transition-[width] duration-700', goal.done >= goal.total ? 'bg-success' : 'bg-primary')}
          style={{ width: `${Math.min(100, goal.total > 0 ? (goal.done / goal.total) * 100 : 0)}%` }}
        />
      </div>
      <p className="mt-2 text-[12.5px] text-muted-foreground">
        {goal.remaining} remaining · ends {goal.endsLabel}
        {goal.daysLeft > 0 ? ` (${goal.daysLeft} day${goal.daysLeft === 1 ? '' : 's'} left)` : ' (today)'}
        {' · '}
        {goal.stateDetail}
      </p>
      {goal.moreCount > 0 && (
        <Link to="/goals" className="group mt-2 inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-primary hover:underline">
          {goal.moreCount} more active
          <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" />
        </Link>
      )}
      {reviewHref && goal.state === 'awaiting_verification' && (
        <Link to={reviewHref} className="group mt-2 inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary hover:underline">
          Review<ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" />
        </Link>
      )}
    </div>
  );
}
