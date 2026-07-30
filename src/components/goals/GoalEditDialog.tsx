import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { callPathfinder, useEditGoal, type Goal } from '@/hooks/useGoals';
import SmartChips from '@/components/goals/SmartChips';
import { evaluateSmart, isSmart } from '@/lib/smart';

/**
 * Edit my own goal. It has to stay SMART — the chips update live and saving
 * waits until all five pass. Once shared with the team, a change is never
 * silent: a short reason is required and recorded.
 */
export default function GoalEditDialog({
  goal,
  wasShared,
  open,
  onOpenChange,
}: {
  goal: Goal;
  wasShared: boolean;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const edit = useEditGoal();
  const [title, setTitle] = useState(goal.title);
  const [description, setDescription] = useState(goal.description ?? '');
  const [reason, setReason] = useState('');
  const [polishing, setPolishing] = useState(false);

  const checks = useMemo(
    () => evaluateSmart({ title, target: goal.smart_target, description }),
    [title, description, goal.smart_target]
  );
  const smartOk = isSmart(checks);

  const titleChanged = title.trim() !== goal.title;
  const descChanged = (description.trim() || null) !== (goal.description ?? null);
  const changed = titleChanged || descChanged;
  const needsReason = wasShared && changed;
  const canSave =
    !!title.trim() && changed && smartOk && (!needsReason || reason.trim().length >= 5);

  const polish = async () => {
    const raw = title.trim();
    if (!raw) return;
    setPolishing(true);
    try {
      const result = await callPathfinder({
        mode: 'polish_goal',
        title: raw,
        description: description.trim() || undefined,
        month: goal.month,
      });
      if (result.title) setTitle(result.title);
    } catch {
      toast.error('Could not polish the wording — you can still edit it yourself.');
    } finally {
      setPolishing(false);
    }
  };

  const save = async () => {
    if (!canSave) return;
    try {
      await edit.mutateAsync({
        goal,
        title: title.trim(),
        description: description.trim() || null,
        reason: needsReason ? reason : undefined,
      });
      onOpenChange(false);
      toast.success(
        needsReason ? 'Goal updated — the team will see what changed.' : 'Goal updated.'
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your changes');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="goals-theme">
        <DialogHeader>
          <DialogTitle>Edit goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="edit-goal-title">Goal</Label>
            <Input
              id="edit-goal-title"
              value={title}
              onChange={e => setTitle(e.target.value)}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7"
              disabled={!title.trim() || polishing}
              onClick={() => void polish()}
            >
              {polishing ? (
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3 w-3" />
              )}
              Polish it
            </Button>
          </div>

          <SmartChips checks={checks} />

          <div className="space-y-1.5">
            <Label htmlFor="edit-goal-description">Why it matters (optional)</Label>
            <Textarea
              id="edit-goal-description"
              rows={3}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
          </div>

          {needsReason && (
            <div className="space-y-1.5">
              <Label htmlFor="edit-goal-reason">Why the change?</Label>
              <Textarea
                id="edit-goal-reason"
                rows={2}
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="e.g. Scope was too broad — narrowing it to new patients only"
              />
              <p className="text-xs text-muted-foreground">
                You've already shared this one, so the team sees the change and this reason at the
                next meeting.
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={save} disabled={!canSave || edit.isPending}>
              {edit.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Save changes
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
