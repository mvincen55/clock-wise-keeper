import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import {
  callPathfinder,
  useAddGoalUpdate,
  UPDATE_STATUS_LABELS,
  type Goal,
  type UpdateStatus,
} from '@/hooks/useGoals';

const STATUSES: UpdateStatus[] = ['on_track', 'at_risk', 'done'];

/** Similarity check — did they keep the AI draft substantially? */
function keptDraft(draft: string, final: string): boolean {
  const a = draft.trim().toLowerCase();
  const b = final.trim().toLowerCase();
  if (!a) return false;
  if (a === b) return true;
  const words = new Set(a.split(/\W+/).filter(Boolean));
  const finalWords = b.split(/\W+/).filter(Boolean);
  if (finalWords.length === 0) return false;
  const shared = finalWords.filter(w => words.has(w)).length;
  return shared / finalWords.length > 0.6;
}

export default function GoalUpdateModal({
  goal,
  open,
  onOpenChange,
}: {
  goal: Goal;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [notes, setNotes] = useState('');
  const [content, setContent] = useState('');
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<UpdateStatus>('on_track');
  const [drafting, setDrafting] = useState(false);
  const addUpdate = useAddGoalUpdate();

  const generate = async (quickNotes: string) => {
    setDrafting(true);
    try {
      const result = await callPathfinder({
        mode: 'draft_update',
        goalId: goal.id,
        quickNotes,
      });
      setContent(result.content ?? '');
      setDraft(result.content ?? '');
      if (result.status) setStatus(result.status);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not draft an update');
    } finally {
      setDrafting(false);
    }
  };

  useEffect(() => {
    if (open) {
      setNotes('');
      setContent('');
      setDraft('');
      setStatus('on_track');
      void generate('');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, goal.id]);

  const submit = async () => {
    if (!content.trim()) return;
    try {
      await addUpdate.mutateAsync({
        goalId: goal.id,
        status,
        content: content.trim(),
        autoDrafted: keptDraft(draft, content),
      });
      toast.success('Update shared with the team.');
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your update');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Share an update</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="quick-notes">Quick notes (optional)</Label>
            <Textarea
              id="quick-notes"
              rows={2}
              placeholder="Anything you want mentioned…"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
            <Button
              size="sm"
              variant="outline"
              onClick={() => generate(notes)}
              disabled={drafting}
            >
              {drafting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Redraft with my notes
            </Button>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="update-content">Your update</Label>
            <Textarea
              id="update-content"
              rows={6}
              value={content}
              placeholder={drafting ? 'Drafting…' : 'Write your update…'}
              onChange={e => setContent(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label>How's it going?</Label>
            <div className="flex gap-2">
              {STATUSES.map(s => (
                <Button
                  key={s}
                  type="button"
                  size="sm"
                  variant={status === s ? 'default' : 'outline'}
                  onClick={() => setStatus(s)}
                >
                  {UPDATE_STATUS_LABELS[s]}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={!content.trim() || addUpdate.isPending}>
              {addUpdate.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Share with the team
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
