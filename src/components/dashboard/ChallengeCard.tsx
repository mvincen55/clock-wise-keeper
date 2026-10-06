import { cn } from '@/lib/utils';
import type { GoalBrief } from './types';
import { ActionLink, Chip } from './kit';

/** The chip tone of a challenge state: on track is steady, needs a push is attention, awaiting verification is calm. */
export function challengeTone(goal: GoalBrief): 'steady' | 'attention' | 'calm' {
  return goal.state === 'on_track' ? 'steady' : goal.state === 'needs_push' ? 'attention' : 'calm';
}

/**
 * The shared office challenge, once: title, state, the tally, the bar, the
 * window. Never the editor — Office → Goals & challenges owns that. As a
 * `tile` (the month row at the top of Home) the caller's header carries the
 * label and the state chip, so the card shows the title, the tally, the bar
 * and the window at the meters' scale.
 */
export function ChallengeCard({ goal, compact, reviewHref, tile }: { goal: GoalBrief; compact?: boolean; reviewHref?: string; tile?: boolean }) {
  const tone = challengeTone(goal);
  return (
    <div className={tile ? 'min-w-0' : 'py-1'}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className={cn('font-semibold leading-snug', compact || tile ? 'text-[15px]' : 'text-[16px]')}>{goal.title}</p>
        {!tile && <Chip tone={tone}>{goal.stateLabel}</Chip>}
      </div>
      <p className={cn('font-display font-bold leading-none tracking-[-0.02em]', tile ? 'mt-2 text-[1.4rem]' : compact ? 'mt-2.5 text-[1.6rem]' : 'mt-2.5 text-[1.9rem]')}>
        {goal.done}
        <span className={cn('text-muted-foreground', tile ? 'text-[0.9rem] font-semibold' : compact ? 'text-[1.05rem]' : 'text-[1.2rem]')}> / {goal.total}</span>
      </p>
      <div className="mt-3 h-2.5 w-full rounded-full bg-muted" role="meter" aria-label={`${goal.title}: ${goal.done} of ${goal.total}`} aria-valuemin={0} aria-valuemax={goal.total} aria-valuenow={goal.done}>
        <div
          className={cn('h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none', goal.done >= goal.total ? 'bg-success' : 'bg-primary')}
          style={{ width: `${Math.min(100, goal.total > 0 ? (goal.done / goal.total) * 100 : 0)}%` }}
        />
      </div>
      <p className={cn('leading-snug text-muted-foreground', tile ? 'mt-1.5 text-[13px]' : 'mt-2 text-[13.5px]')}>
        {goal.remaining} remaining
        {goal.daysLeft === null
          ? ' · runs until it is reached'
          : ` · ends ${goal.endsLabel}${goal.daysLeft > 0 ? ` (${goal.daysLeft} day${goal.daysLeft === 1 ? '' : 's'} left)` : ' (today)'}`}
        <span className={tile ? 'hidden [@container(min-width:40rem)]:inline' : undefined}>{' · '}{goal.stateDetail}</span>
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
