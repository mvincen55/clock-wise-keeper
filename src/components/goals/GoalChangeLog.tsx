import { History } from 'lucide-react';
import type { GoalEvent } from '@/hooks/useGoals';

const VERB: Record<string, string> = {
  edited: 'reworded',
  archived: 'put aside',
  replaced: 'replaced',
};

function line(event: GoalEvent, name: string): string {
  const verb = VERB[event.type] ?? 'changed';
  const base = `${name} ${verb} "${event.old_title}"`;
  if (event.type === 'edited' && event.new_title) return `${base} → "${event.new_title}"`;
  if (event.type === 'replaced' && event.new_title) return `${base} → new goal: "${event.new_title}"`;
  return base;
}

/** "Changes since last meeting" — quiet accountability, never a callout. */
export default function GoalChangeLog({
  events,
  nameOf,
  title = 'Changes since the last meeting',
}: {
  events: GoalEvent[];
  nameOf: (userId: string) => string;
  title?: string;
}) {
  if (!events.length) return null;
  return (
    <section className="space-y-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <History className="h-4 w-4 text-primary" />
        {title}
      </h3>
      <ul className="space-y-1.5">
        {events.map(e => (
          <li key={e.id} className="text-sm text-muted-foreground">
            <span className="break-words text-foreground">{line(e, nameOf(e.actor_id))}</span>
            {e.reason && <span className="break-words"> — reason: {e.reason}</span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
