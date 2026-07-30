import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { ArchiveReasonError, MIN_ARCHIVE_REASON_CHARS } from '@/lib/goal-archive';
import { useArchiveGoal, type Goal } from '@/hooks/useGoals';

/** Archiving is never silent — the reason travels with the action. */
export default function GoalArchiveDialog({
  goal,
  open,
  onOpenChange,
}: {
  goal: Goal;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [reason, setReason] = useState('');
  const archive = useArchiveGoal();

  const submit = async () => {
    try {
      await archive.mutateAsync({ goal, reason });
      toast.success('Goal archived — you can restore it any time.');
      setReason('');
      onOpenChange(false);
    } catch (e) {
      toast.error(
        e instanceof ArchiveReasonError || e instanceof Error
          ? e.message
          : 'Could not archive this goal'
      );
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Archive this goal?</AlertDialogTitle>
          <AlertDialogDescription>
            It leaves your active list but stays in the record, and you can restore it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="archive-reason">Why are you archiving it?</Label>
          <Textarea
            id="archive-reason"
            rows={3}
            value={reason}
            onChange={e => setReason(e.target.value)}
            placeholder="e.g. Moved to the front desk team mid-month"
          />
          <p className="text-xs text-muted-foreground">
            At least {MIN_ARCHIVE_REASON_CHARS} characters — this is logged to the goal trail.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction
            onClick={e => {
              e.preventDefault();
              void submit();
            }}
            disabled={archive.isPending || !archive.isReady}
          >
            Archive
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
