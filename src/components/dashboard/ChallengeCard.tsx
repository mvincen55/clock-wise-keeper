import { cn } from '@/lib/utils';
import type { GoalBrief } from './types';
import { ActionLink, Chip } from './kit';

/**
 * The shared office challenge, once: title, state, the tally, the bar, the
 * window. Never the editor — Office → Goals & challenges owns that.
 */
export function ChallengeCard({ goal, compact, reviewHref }: { goal: GoalBrief; compact?: boolean; reviewHref?: string }) {
  const tone = goal.state === 'on_track' ? 'steady' : goal.state === 'needs_push' ? 'attention' : 'calm';
  return (
    <div className="py-1">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className={cn('font-semibold leading-snug', compact ? 'text-[15px]' : 'text-[16px]')}>{goal.title}</p>
        <Chip tone={tone}>{goal.stateLabel}</Chip>
      </div>
      <p className={cn('mt-2.5 font-display font-bold leading-none tracking-[-0.02em]', compact ? 'text-[1.6rem]' : 'text-[1.9rem]')}>
        {goal.done}
        <span className={cn('text-muted-foreground', compact ? 'text-[1.05rem]' : 'text-[1.2rem]')}> / {goal.total}</span>
      </p>
      <div className="mt-3 h-2.5 w-full rounded-full bg-muted" role="meter" aria-label={`${goal.title}: ${goal.done} of ${goal.total}`} aria-valuemin={0} aria-valuemax={goal.total} aria-valuenow={goal.done}>
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', goal.done >= goal.total ? 'bg-success' : 'bg-primary')}
          style={{ width: `${Math.min(100, goal.total > 0 ? (goal.done / goal.total) * 100 : 0)}%` }}
        />
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-muted-foreground">
        {goal.remaining} remaining · ends {goal.endsLabel}
        {goal.daysLeft > 0 ? ` (${goal.daysLeft} day${goal.daysLeft === 1 ? '' : 's'} left)` : ' (today)'}
        {' · '}
        {goal.stateDetail}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
        {goal.moreCount > 0 && (
          <ActionLink to="/goals" variant="text" size="sm">{goal.moreCount} more active</ActionLink>
        )}
        {reviewHref && goal.state === 'awaiting_verification' && (
          <ActionLink to={reviewHref} variant="text" size="sm">Review</ActionLink>
        )}
      </div>
    </div>
  );
}
