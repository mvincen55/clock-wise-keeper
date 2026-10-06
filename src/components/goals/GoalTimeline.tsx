import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { daysBetween, getToday } from '@/lib/time-utils';
import { daysUntil, shortDate, useNextTeamMeeting } from '@/hooks/useOfficeEvents';
import { goalElapsedFraction, goalStartDate, type Goal } from '@/hooks/useGoals';

type TimelineGoal = Pick<Goal, 'created_at' | 'month' | 'due_on' | 'status' | 'completed_at'>;

/**
 * The goal's window, always on screen — even before a plan exists.
 *
 * With a target date: a calm bar from the day the goal was set to that date,
 * a marker for today and one for the next team meeting, and the plan's
 * progress laid over it so work-vs-calendar is obvious at a glance (amber
 * when the work badly trails the calendar).
 *
 * Without one, the goal simply runs until it is done: the bar spans from the
 * start to the next team meeting (or today), today and the meeting are still
 * marked, and nothing is ever "behind" — there is no deadline to trail.
 */
export default function GoalTimeline({
  goal,
  done = 0,
  total = 0,
  compact = false,
  className,
}: {
  goal: TimelineGoal;
  done?: number;
  total?: number;
  compact?: boolean;
  className?: string;
}) {
  const meeting = useNextTeamMeeting();
  const today = getToday();
  const start = goalStartDate(goal);
  const meetingDate = meeting?.event_date ?? null;

  // The window the bar represents.
  const end = goal.due_on
    ? goal.due_on
    : [today, meetingDate].filter((d): d is string => !!d).sort().slice(-1)[0] ?? today;
  const span = Math.max(1, daysBetween(start, end));
  const pos = (d: string) => Math.min(100, Math.max(0, (daysBetween(start, d) / span) * 100));

  const todayPct = pos(today);
  const meetingPct = meetingDate && meetingDate >= start && meetingDate <= end ? pos(meetingDate) : null;

  const progress = total > 0 ? done / total : 0;
  const elapsed = goalElapsedFraction(goal, today);
  const behind = total > 0 && progress + 0.25 < elapsed;
  const completed = goal.status === 'completed';

  const until = meetingDate ? daysUntil(meetingDate) : null;
  const meetingLine =
    meetingDate == null
      ? 'No team meeting on the calendar yet.'
      : until === 0
        ? `Team meeting today — ${shortDate(meetingDate)}.`
        : until === 1
          ? 'Team meeting tomorrow.'
          : `Team meeting in ${until} days — ${shortDate(meetingDate)}.`;

  const daysToDue = goal.due_on ? daysBetween(today, goal.due_on) : null;
  const windowLine = completed
    ? 'Completed.'
    : goal.due_on
      ? daysToDue! > 0
        ? `Due ${shortDate(goal.due_on)} — ${daysToDue} day${daysToDue === 1 ? '' : 's'} left.`
        : daysToDue === 0
          ? `Due today — ${shortDate(goal.due_on)}.`
          : `Was due ${shortDate(goal.due_on)} — still yours until it's done.`
      : `Started ${shortDate(start)} — runs until it's done.`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="relative">
        {/* the window */}
        <div className={cn('w-full rounded-full bg-muted', compact ? 'h-1.5' : 'h-2.5')} />

        {/* elapsed */}
        <div
          className={cn(
            'absolute inset-y-0 left-0 rounded-full bg-muted-foreground/20',
            compact ? 'h-1.5' : 'h-2.5'
          )}
          style={{ width: `${todayPct}%` }}
        />

        {/* plan progress laid over the calendar */}
        {total > 0 && (
          <div
            className={cn(
              'absolute inset-y-0 left-0 rounded-full transition-all',
              compact ? 'h-1.5' : 'h-2.5',
              behind ? 'bg-[hsl(var(--goal-amber))]' : 'bg-[hsl(var(--goal-purple))]'
            )}
            style={{ width: `${Math.max(progress * 100, progress > 0 ? 3 : 0)}%` }}
          />
        )}

        {/* today */}
        <div
          className="absolute -translate-x-1/2 rounded-full bg-foreground"
          style={{ left: `${todayPct}%`, width: 2, height: compact ? 10 : 18, top: compact ? -2 : -4 }}
          aria-label="Today"
        />

        {/* next team meeting */}
        {meetingPct !== null && (
          <div
            className="absolute -translate-x-1/2"
            style={{ left: `${meetingPct}%`, top: compact ? -5 : -7 }}
            aria-label="Next team meeting"
          >
            <span
              className={cn(
                'block rounded-full border-2 border-background bg-[hsl(var(--goal-purple))]',
                compact ? 'h-2.5 w-2.5' : 'h-4 w-4'
              )}
            />
          </div>
        )}
      </div>

      <p
        className={cn(
          'flex flex-wrap items-center gap-x-1.5 text-muted-foreground',
          compact ? 'text-[11px]' : 'text-xs'
        )}
      >
        <CalendarDays className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        <span>{windowLine}</span>
        <span>{meetingLine}</span>
      </p>
    </div>
  );
}
