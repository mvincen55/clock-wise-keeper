import { History } from 'lucide-react';
import type { GoalEvent } from '@/hooks/useGoals';

export function goalEventSentence(event: GoalEvent, who: string): string {
  if (event.type === 'edited') {
    return `${who} reworded “${event.old_title}”${event.new_title ? ` → “${event.new_title}”` : ''}`;
  }
  if (event.type === 'replaced') {
    return `${who} archived “${event.old_title}” → New goal: “${event.new_title}”`;
  }
  return `${who} archived “${event.old_title}”`;
}

/** A quiet, factual trail of changes — shown on the card and in the meeting view. */
export default function GoalChangeLog({
  events,
  nameOf,
  title = 'Changes',
}: {
  events: GoalEvent[];
  nameOf?: (userId: string) => string;
  title?: string;
}) {
  if (events.length === 0) return null;
  return (
    <div className="space-y-1.5 rounded-lg border border-dashed bg-muted/20 p-3">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        <History className="h-3.5 w-3.5" />
        {title}
      </p>
      <ul className="space-y-1.5">
        {events.map(e => (
          <li key={e.id} className="text-xs text-muted-foreground">
            <span className="text-foreground">
              {goalEventSentence(e, nameOf ? nameOf(e.actor_id) : 'You')}
            </span>
            <span className="block">reason: {e.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
