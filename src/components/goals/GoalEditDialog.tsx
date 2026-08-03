import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import NoPhiNote from '@/components/NoPhiNote';
import { evaluateGoalGate } from '@/lib/goal-gate';
import { useEditGoal, type Goal } from '@/hooks/useGoals';

/**
 * Edit my goal. Goals are mutable — never silently. If the goal has already
 * been shared with the team (it has updates), the change needs a reason and
 * the change is written to the goal's history.
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
  onOpenChange: (v: boolean) => void;
}) {
  const editGoal = useEditGoal();
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? '');
  const [target, setTarget] = useState(goal.smart_target ?? '');
  const [reason, setReason] = useState('');

  const gate = evaluateGoalGate({ title, target });
  const reasonOk = !hasUpdates || !!reason.trim();

  const submit = async () => {
    try {
      await editGoal.mutateAsync({
        goal,
        title,
        description,
        smartTarget: target,
        reason: reason || null,
        requiresReason: hasUpdates,
      });
      toast.success('Goal updated — the change is on the record.');
      onOpenChange(false);
      setReason('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the change');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit this goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-goal-title">Goal</Label>
            <Input id="edit-goal-title" value={title} onChange={e => setTitle(e.target.value)} />
            {gate.hints.specific && (
              <p className="text-xs text-muted-foreground">S: {gate.hints.specific}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-goal-target">How you'll measure it</Label>
            <Input id="edit-goal-target" value={target} onChange={e => setTarget(e.target.value)} />
            {gate.hints.measurable && (
              <p className="text-xs text-muted-foreground">M: {gate.hints.measurable}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="edit-goal-description">Why it matters</Label>
            <Textarea
              id="edit-goal-description"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
            <NoPhiNote what="Your goal wording" />
          </div>

          {hasUpdates && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-goal-reason">What changed, and why?</Label>
              <Textarea
                id="edit-goal-reason"
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="You've already shared an update on this one, so the team sees the change."
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!gate.ok || !reasonOk || editGoal.isPending}>
            {editGoal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
