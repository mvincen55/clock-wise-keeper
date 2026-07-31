import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useArchiveGoal, type Goal } from '@/hooks/useGoals';

/**
 * Letting go of a goal is allowed — quietly disappearing it is not. The goal is
 * archived (never deleted) with a reason, and the member is handed straight to
 * setting the next one.
 */
export default function GoalArchiveDialog({
  goal,
  open,
  onOpenChange,
  onArchived,
}: {
  goal: Goal;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Called with the event id so the successor goal can be linked to it. */
  onArchived: (eventId: string) => void;
}) {
  const archive = useArchiveGoal();
  const [reason, setReason] = useState('');

  const submit = async () => {
    try {
      const eventId = await archive.mutateAsync({ goal, reason });
      toast.success('Goal archived — the reason is on the record.');
      onOpenChange(false);
      setReason('');
      onArchived(eventId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not archive this goal');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Let this goal go?</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Nothing is deleted — “{goal.title}” gets archived with your reason, and you'll pick a
            new goal right after.
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="archive-reason">Why are you setting this one aside?</Label>
            <Textarea
              id="archive-reason"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. the schedule change made this one impossible this month"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep it
          </Button>
          <Button onClick={submit} disabled={!reason.trim() || archive.isPending}>
            {archive.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Archive and set a new goal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
