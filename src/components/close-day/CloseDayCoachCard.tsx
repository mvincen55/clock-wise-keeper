import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, X } from 'lucide-react';
import { useOfficeNudges, useResolveNudge } from '@/hooks/useOfficeNudges';

/**
 * The Office Coach on the Close the Day page. It only ever sees sanitized,
 * referee-validated aggregates (minutes, counts, ratios) plus existing
 * operational data — never a screenshot, a schedule note, or anything about a
 * patient. Quiet by default: no nudge, no card.
 */
export default function CloseDayCoachCard() {
  const { data: nudges } = useOfficeNudges();
  const resolve = useResolveNudge();

  const deposit = (nudges ?? []).filter(
    n => n.surface === 'deposit' && (n.status === 'new' || n.status === 'shown')
  );
  if (deposit.length === 0) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Office Coach
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {deposit.map(n => (
          <div key={n.id} className="flex items-start justify-between gap-2 text-sm">
            <p>{n.content}</p>
            <Button
              size="icon"
              variant="ghost"
              className="h-6 w-6 shrink-0"
              aria-label="Dismiss"
              onClick={() => resolve.mutate({ id: n.id, status: 'dismissed' })}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
