import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useArchiveGoal, type Goal } from '@/hooks/useGoals';

/**
 * Goals are never hard-deleted. Archiving always needs a reason, and the
 * create-goal flow opens straight after so a replacement gets set.
 */
export default function GoalArchiveDialog({
  goal,
  wasShared,
  open,
  onOpenChange,
  onArchived,
}: {
  goal: Goal;
  wasShared: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onArchived: (eventId: string) => void;
}) {
  const archive = useArchiveGoal();
  const [reason, setReason] = useState('');
  const canConfirm = reason.trim().length >= 5;

  const confirm = async () => {
    if (!canConfirm) return;
    try {
      const eventId = await archive.mutateAsync({ goal, reason });
      onOpenChange(false);
      setReason('');
      toast.success('Goal archived — now set the one that replaces it.');
      onArchived(eventId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not archive the goal');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="goals-theme">
        <DialogHeader>
          <DialogTitle>Delete this goal?</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="break-words rounded-lg border bg-muted/30 p-3 text-sm font-medium">
            {goal.title}
          </p>
          <p className="text-sm text-muted-foreground">
            It's archived, not erased — it stays on the record.
            {wasShared &&
              ' You already shared this one, so the team hears about it at the next meeting.'}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="archive-goal-reason">Why are you dropping it?</Label>
            <Textarea
              id="archive-goal-reason"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. My role changed mid-month — this one no longer fits"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Keep it
            </Button>
            <Button
              variant="destructive"
              onClick={confirm}
              disabled={!canConfirm || archive.isPending}
            >
              {archive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Archive and replace
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
