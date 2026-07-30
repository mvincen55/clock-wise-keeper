import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getToday } from '@/lib/time-utils';
import { daysUntil, shortDate, useNextTeamMeeting } from '@/hooks/useOfficeEvents';

function daysInMonth(month: string) {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function dayOfMonth(dateStr: string) {
  return Number(dateStr.slice(8, 10));
}

/**
 * The month, always on screen — even before a plan exists.
 * A calm bar for the month with a marker for today and one for the next
 * team meeting, plus the plan progress laid over it once there is one.
 */
export default function GoalMonthTimeline({
  month,
  done = 0,
  total = 0,
  compact = false,
  className,
}: {
  month: string;
  done?: number;
  total?: number;
  compact?: boolean;
  className?: string;
}) {
  const meeting = useNextTeamMeeting();
  const today = getToday();
  const total_days = daysInMonth(month);

  const inThisMonth = (d?: string | null) => !!d && d.slice(0, 7) === month;
  const pos = (d: string) => Math.min(100, Math.max(0, ((dayOfMonth(d) - 0.5) / total_days) * 100));

  const todayPct = inThisMonth(today) ? pos(today) : today.slice(0, 7) > month ? 100 : 0;
  const meetingPct = inThisMonth(meeting?.event_date) ? pos(meeting!.event_date) : null;

  const progress = total > 0 ? done / total : 0;
  const monthElapsed = todayPct / 100;
  const behind = total > 0 && progress + 0.25 < monthElapsed;

  const until = meeting ? daysUntil(meeting.event_date) : null;
  const countdown =
    meeting == null
      ? 'No team meeting on the calendar yet.'
      : until === 0
        ? `Team meeting today — ${shortDate(meeting.event_date)}.`
        : until === 1
          ? 'Team meeting tomorrow.'
          : `Team meeting in ${until} days — ${shortDate(meeting.event_date)}.`;

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="relative">
        {/* the month */}
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
          className={cn(
            'absolute -translate-x-1/2 rounded-full bg-foreground',
            compact ? '-top-0.5 h-2.5 w-[2px]' : '-top-1 h-4.5 w-[2px]'
          )}
          style={{ left: `${todayPct}%`, height: compact ? 10 : 18, top: compact ? -2 : -4 }}
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
          'flex items-center gap-1.5 text-muted-foreground',
          compact ? 'text-[11px]' : 'text-xs'
        )}
      >
        <CalendarDays className={compact ? 'h-3 w-3' : 'h-3.5 w-3.5'} />
        {countdown}
      </p>
    </div>
  );
}
