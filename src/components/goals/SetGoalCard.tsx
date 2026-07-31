import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Loader2, Target, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { callPathfinder, useCreateGoal } from '@/hooks/useGoals';
import SmartChips, { type SmartRead } from '@/components/goals/SmartChips';
import RoleGoalIdeas from '@/components/goals/RoleGoalIdeas';
import { evaluateGoalGate, flagsFromSmartText } from '@/lib/goal-gate';
import NoPhiNote from '@/components/NoPhiNote';

/**
 * Set this month's goal. Pathfinder polishes the raw wording into one clear
 * sentence, which the member can edit or restore to their own words.
 */
export default function SetGoalCard({ month }: { month: string }) {
  const createGoal = useCreateGoal();
  const [title, setTitle] = useState('');
  const [original, setOriginal] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [polishing, setPolishing] = useState(false);
  const [target, setTarget] = useState('');
  const [smart, setSmart] = useState<SmartRead | null>(null);

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
      if (result.smart) setSmart(result.smart);
    } catch {
      // Polishing is a nicety — never block saving a goal.
    } finally {
      setPolishing(false);
    }
  };

  const save = async () => {
    if (!title.trim()) return;
    try {
      await createGoal.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        smartTarget: target.trim() || null,
        month,
        visibility: isPrivate ? 'private' : 'team',
      });
      setTitle('');
      setOriginal(null);
      setTarget('');
      setSmart(null);
      setDescription('');
      setIsPrivate(false);
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

        <div className="space-y-1.5">
          <Label htmlFor="goal-title">Goal</Label>
          <Input
            id="goal-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            onBlur={() => void polish()}
            placeholder="e.g. Get faster and more confident at scheduling follow-ups"
          />
          <p className="text-xs text-muted-foreground">
            Great goals are SMART: specific, measurable, achievable, relevant to your role, and
            bound to this month.
          </p>
          {polishing && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" /> Tidying up the wording…
            </p>
          )}
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
                  setSmart(null);
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
            setSmart(null);
          }}
          onPickTarget={t => setTarget(t)}
        />

        {smart && <SmartChips smart={smart} />}
        {gate.hints.specific && (
          <p className="text-xs text-muted-foreground">S: {gate.hints.specific}</p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="goal-target">How you'll measure it</Label>
          <Input
            id="goal-target"
            value={target}
            onChange={e => setTarget(e.target.value)}
            placeholder="e.g. 4 feedback asks"
          />
          {gate.hints.measurable && (
            <p className="text-xs text-muted-foreground">M: {gate.hints.measurable}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="goal-description">Why it matters (optional)</Label>
          <Textarea
            id="goal-description"
            rows={3}
            value={description}
            onChange={e => setDescription(e.target.value)}
          />
          <NoPhiNote what="Your goal wording" />
        </div>

        <div className="flex items-center gap-2">
          <Switch id="goal-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
          <Label htmlFor="goal-private" className="text-sm text-muted-foreground">
            Keep this one private (just me and the managers)
          </Label>
        </div>

        <Button
          onClick={save}
          disabled={!gate.ok || createGoal.isPending || !createGoal.isReady || polishing}
        >
          {createGoal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Set this month's goal
        </Button>
      </CardContent>
    </Card>
  );
}
