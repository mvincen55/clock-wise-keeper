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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useEditGoal, type Goal } from '@/hooks/useGoals';
import { evaluateSmartGate } from '@/lib/smart';

/**
 * Edit my own goal. Free while it has never been shared; once there are
 * check-ins, the change needs a short reason that the team sees at the next
 * meeting. Specific + Measurable still gate the save.
 */
export default function GoalEditDialog({
  goal,
  hasUpdates,
  open,
  onOpenChange,
}: {
  goal: Goal;
  hasUpdates: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [title, setTitle] = useState(goal.title);
  const [target, setTarget] = useState(goal.smart_target ?? '');
  const [description, setDescription] = useState(goal.description ?? '');
  const [reason, setReason] = useState('');
  const edit = useEditGoal();

  const gate = evaluateSmartGate({ title, target });
  const reasonOk = !hasUpdates || reason.trim().length >= 5;

  const save = async () => {
    try {
      await edit.mutateAsync({
        goal,
        title: title.trim(),
        description: description.trim() || null,
        smartTarget: target.trim() || null,
        reason,
        needsReason: hasUpdates,
      });
      toast.success('Goal updated.');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the change');
    }
  };

  return (
    <Dialog open={open} onOpenChange={o => !edit.isPending && onOpenChange(o)}>
      <DialogContent className="goals-theme">
        <DialogHeader>
          <DialogTitle>Edit your goal</DialogTitle>
          <DialogDescription>
            {hasUpdates
              ? "You've already shared an update on this one, so the team will see what changed."
              : 'Nothing has been shared yet — change it freely.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-goal-title">Goal</Label>
            <Input
              id="edit-goal-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-goal-target">How you'll measure it</Label>
            <Input
              id="edit-goal-target"
              value={target}
              onChange={e => setTarget(e.target.value)}
              placeholder="e.g. 4 feedback asks"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-goal-description">Why it matters (optional)</Label>
            <Textarea
              id="edit-goal-description"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>
          {hasUpdates && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-goal-reason">Why the change?</Label>
              <Textarea
                id="edit-goal-reason"
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="A sentence is plenty."
              />
            </div>
          )}
          {gate.hint && <p className="text-xs text-muted-foreground">{gate.hint}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={edit.isPending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={!gate.passes || !reasonOk || edit.isPending}>
            {edit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
