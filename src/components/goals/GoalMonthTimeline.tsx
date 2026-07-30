import { CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getToday } from '@/lib/time-utils';
import { meetingCountdownLabel } from '@/hooks/useOfficeEvents';

function daysInMonth(month: string): number {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Position (0-100) of a YYYY-MM-DD inside the month bar, or null if outside. */
function posOf(month: string, date: string | null | undefined): number | null {
  if (!date || date.slice(0, 7) !== month) return null;
  const total = daysInMonth(month);
  const day = Number(date.slice(8, 10));
  return ((day - 0.5) / total) * 100;
}

/**
 * The always-on visual for a goal: a bar for the month with a marker for
 * today and one for the next team meeting, plus the tasks-done fill once a
 * plan exists. Renders in every state, plan or no plan.
 */
export default function GoalMonthTimeline({
  month,
  meetingDate,
  done,
  total,
  compact = false,
  className,
}: {
  month: string;
  meetingDate?: string | null;
  done: number;
  total: number;
  compact?: boolean;
  className?: string;
}) {
  const today = getToday();
  const todayPos = posOf(month, today) ?? (today.slice(0, 7) > month ? 100 : 0);
  const meetingPos = posOf(month, meetingDate);
  const elapsed = todayPos / 100;
  const pct = total > 0 ? done / total : 0;
  const behind = total > 0 && pct + 0.25 < elapsed;

  return (
    <div className={cn('space-y-2', className)}>
      <div className="relative pt-4">
        {/* the month */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          {total > 0 && (
            <div
              className={cn(
                'h-full rounded-full transition-all',
                behind ? 'bg-[hsl(var(--goal-amber))]' : 'bg-[hsl(var(--goal-purple))]'
              )}
              style={{ width: `${Math.max(pct * 100, pct > 0 ? 4 : 0)}%` }}
            />
          )}
        </div>

        {/* elapsed hairline — the calendar's own pace */}
        <div
          className="pointer-events-none absolute left-0 top-[1.05rem] h-2 rounded-full border-r border-foreground/25"
          style={{ width: `${todayPos}%` }}
          aria-hidden
        />

        {/* today */}
        <div
          className="pointer-events-none absolute top-0 flex -translate-x-1/2 flex-col items-center"
          style={{ left: `${todayPos}%` }}
        >
          <span className="text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
            Today
          </span>
          <span className="mt-0.5 h-4 w-px bg-foreground/40" />
        </div>

        {/* next team meeting */}
        {meetingPos !== null && (
          <div
            className="pointer-events-none absolute top-0 flex -translate-x-1/2 flex-col items-center"
            style={{ left: `${meetingPos}%` }}
          >
            <span className="text-[9px] font-medium uppercase tracking-wide text-[hsl(var(--goal-purple))]">
              Meeting
            </span>
            <span className="mt-0.5 h-4 w-px bg-[hsl(var(--goal-purple))]" />
          </div>
        )}
      </div>

      <div
        className={cn(
          'flex flex-wrap items-center justify-between gap-x-3 gap-y-1',
          compact ? 'text-[11px]' : 'text-xs'
        )}
      >
        <span className="inline-flex items-center gap-1.5 text-muted-foreground">
          <CalendarDays className="h-3.5 w-3.5" />
          {meetingCountdownLabel(meetingDate)}
        </span>
        <span className="text-muted-foreground">
          {total > 0 ? `${done} of ${total} steps done` : 'No plan yet'}
        </span>
      </div>
    </div>
  );
}
