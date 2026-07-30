import { useState } from 'react';
import { ArchiveRestore, ChevronDown, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useArchivedGoals, useRestoreGoal, type Goal } from '@/hooks/useGoals';

/**
 * The restore shelf: archived goals for the month, one tap back to active.
 * Hidden entirely when there is nothing archived — no empty clutter.
 */
export default function ArchivedGoalsSection({
  month,
  userId,
}: {
  month: string;
  userId: string | undefined;
}) {
  const { data: archived, isLoading } = useArchivedGoals(month);
  const restore = useRestoreGoal();
  const [open, setOpen] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const mine = (archived ?? []).filter(g => g.user_id === userId);
  if (isLoading || mine.length === 0) return null;

  const onRestore = async (goal: Goal) => {
    setPendingId(goal.id);
    try {
      await restore.mutateAsync({ goal });
      toast.success('Goal restored — it is back in your active list.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not restore that goal');
    } finally {
      setPendingId(null);
    }
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-2 px-0 text-muted-foreground">
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
          />
          Archived goals ({mine.length})
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-3 space-y-3">
        {mine.map(goal => (
          <Card key={goal.id} className="border-dashed">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <p className="break-words font-medium">{goal.title}</p>
                {goal.smart_target && (
                  <p className="text-xs text-muted-foreground">Target: {goal.smart_target}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={!restore.isReady || pendingId === goal.id}
                onClick={() => onRestore(goal)}
              >
                {pendingId === goal.id ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <ArchiveRestore className="mr-2 h-4 w-4" />
                )}
                Restore
              </Button>
            </CardContent>
          </Card>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}
