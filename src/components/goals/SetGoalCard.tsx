import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Sparkles, Target, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { callPathfinder, useCreateGoal } from '@/hooks/useGoals';
import SmartChips from '@/components/goals/SmartChips';
import RoleGoalIdeas from '@/components/goals/RoleGoalIdeas';
import { evaluateSmart, isSmart } from '@/lib/smart';

/**
 * Set this month's goal. Pathfinder proposes a fully-SMART wording, the chips
 * update live as the member edits, and saving waits until all five pass.
 */
export default function SetGoalCard({
  month,
  replacingTitle,
  onCreated,
}: {
  month: string;
  /** Set when this card is standing in for a goal that was just archived. */
  replacingTitle?: string;
  onCreated?: (title: string) => void;
}) {
  const createGoal = useCreateGoal();
  const [title, setTitle] = useState('');
  const [original, setOriginal] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [target, setTarget] = useState('');

  const checks = useMemo(
    () => evaluateSmart({ title, target, description }),
    [title, target, description]
  );
  const smartOk = isSmart(checks);

  const polish = async () => {
    const raw = title.trim();
    if (!raw) return;
    setPolishing(true);
    try {
      const result = await callPathfinder({
        mode: 'polish_goal',
        title: raw,
        description: description.trim() || undefined,
        month,
      });
      if (result.title && result.title !== raw) {
        setOriginal(raw);
        setTitle(result.title);
      }
      if (result.target) setTarget(result.target);
    } catch {
      toast.error('Could not polish the wording — you can still edit it yourself.');
    } finally {
      setPolishing(false);
    }
  };

  const save = async () => {
    if (!smartOk) return;
    try {
      const created = title.trim();
      await createGoal.mutateAsync({
        title: created,
        description: description.trim() || undefined,
        smartTarget: target.trim() || null,
        month,
        visibility: isPrivate ? 'private' : 'team',
      });
      setTitle('');
      setOriginal(null);
      setTarget('');
      setDescription('');
      setIsPrivate(false);
      onCreated?.(created);
      toast.success('Goal set — good luck this month.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your goal');
    }
  };

  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          What are you working on this month?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Pick something you'd like to get better at. The whole team will see this at the next team
          meeting.
        </p>

        {replacingTitle && (
          <p className="rounded-lg border border-dashed bg-muted/20 p-3 text-xs text-muted-foreground">
            Replacing “{replacingTitle}”. Whatever you set here is what the team hears about at the
            next meeting.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="goal-title">Goal</Label>
          <Input
            id="goal-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => {
              if (!smartOk) void polish();
            }}
            placeholder="e.g. Get faster and more confident at scheduling follow-ups"
          />
          <div className="flex flex-wrap items-center gap-2">
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
            <span className="text-xs text-muted-foreground">
              Pathfinder will make it SMART and fix the wording.
            </span>
          </div>
          {original && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="break-words">your words: {original}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2"
                onClick={() => {
                  setTitle(original);
                  setOriginal(null);
                }}
              >
                <Undo2 className="mr-1 h-3 w-3" /> Restore
              </Button>
            </div>
          )}
        </div>

        <RoleGoalIdeas
          onPickExample={idea => {
            setTitle(idea.title);
            setTarget(idea.target);
            setOriginal(null);
          }}
          onPickTarget={t => setTarget(t)}
        />

        <SmartChips checks={checks} />

        <div className="space-y-1.5">
          <Label htmlFor="goal-target">How you'll measure it</Label>
          <Input
            id="goal-target"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder="e.g. 4 feedback asks"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="goal-description">Why it matters (optional)</Label>
          <Textarea
            id="goal-description"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-2">
          <Switch id="goal-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
          <Label htmlFor="goal-private" className="text-sm text-muted-foreground">
            Keep this one private (just me and the managers)
          </Label>
        </div>

        <Button
          onClick={save}
          disabled={!smartOk || createGoal.isPending || !createGoal.isReady || polishing}
        >
          {createGoal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Set this month's goal
        </Button>
      </CardContent>
    </Card>
  );
}
