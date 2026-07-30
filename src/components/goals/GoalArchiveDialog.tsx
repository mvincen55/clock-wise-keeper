import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useArchiveGoal, type Goal } from '@/hooks/useGoals';

/**
 * Removing a goal is always an archive with a reason — the record stays, and
 * the team hears about the change at the next meeting.
 */
export default function GoalArchiveDialog({
  goal,
  open,
  onOpenChange,
  onArchived,
}: {
  goal: Goal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived: (goalId: string) => void;
}) {
  const [reason, setReason] = useState('');
  const archive = useArchiveGoal();

  const confirm = async () => {
    try {
      await archive.mutateAsync({ goal, reason });
      toast.success('Goal put aside — set the one that replaces it.');
      onOpenChange(false);
      onArchived(goal.id);
      setReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove the goal');
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !archive.isPending && onOpenChange(o)}>
      <DialogContent className="goals-theme">
        <DialogHeader>
          <DialogTitle>Put this goal aside</DialogTitle>
          <DialogDescription>
            It stops showing on your card and in the meeting view. Nothing is deleted — the
            record and the reason stay.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <p className="break-words rounded-md bg-muted/40 px-3 py-2 text-sm">{goal.title}</p>
          <Label htmlFor="archive-reason">Why are you setting this one down?</Label>
          <Textarea
            id="archive-reason"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. My role changed this month, so this one no longer fits."
          />
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={archive.isPending}>
            Keep it
          </Button>
          <Button onClick={confirm} disabled={reason.trim().length < 5 || archive.isPending}>
            {archive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Put it aside
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
