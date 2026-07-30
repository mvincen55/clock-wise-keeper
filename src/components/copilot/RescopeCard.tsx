import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarClock } from 'lucide-react';
import { getToday } from '@/lib/time-utils';
import { nextMonday, shouldOfferRescope, dayLabel } from '@/lib/copilot';
import { useMyItems, useRescopeItems } from '@/hooks/useCopilot';

/**
 * RESCOPE, DON'T PILE UP.
 *
 * When things keep slipping, the answer is a smaller plan — not a longer
 * backlog. Offered quietly, only when the pattern is real.
 */
export default function RescopeCard() {
  const today = getToday();
  const { data: items } = useMyItems();
  const rescope = useRescopeItems();

  const open = (items ?? []).filter(i => !i.done);
  const slipping = open.filter(i => (i.due_date && i.due_date < today) || i.deferral_count >= 2);

  if (!shouldOfferRescope(open.map(i => ({ deferral_count: i.deferral_count, due_date: i.due_date })), today)) {
    return null;
  }

  const monday = nextMonday(today);
  const ids = slipping.map(i => i.id);

  return (
    <Card className="card-elevated border-muted">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          <p className="text-sm font-semibold">This week's been heavy.</p>
        </div>
        <p className="text-sm text-muted-foreground">
          {slipping.length} {slipping.length === 1 ? 'item has' : 'items have'} been carried forward. Want to move
          them to {dayLabel(monday, today)} and start that week with a clean list?
        </p>
        <ul className="text-xs text-muted-foreground space-y-1">
          {slipping.slice(0, 4).map(i => (
            <li key={i.id}>· {i.title}</li>
          ))}
          {slipping.length > 4 && <li>· and {slipping.length - 4} more</li>}
        </ul>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" disabled={rescope.isPending} onClick={() => rescope.mutate({ ids, toDate: monday })}>
            Move them to Monday
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={rescope.isPending}
            onClick={() => rescope.mutate({ ids, toDate: today })}
          >
            Keep them on today
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
