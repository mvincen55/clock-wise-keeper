import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Compass, Loader2, Sparkles, Target } from 'lucide-react';
import { toast } from 'sonner';
import { callPathfinder, useCreateGoal, useSeedGoalThread, type Goal } from '@/hooks/useGoals';
import { getToday } from '@/lib/time-utils';
import {
  candidateToForm,
  exchangeOnly,
  type FinderTurn,
  type GoalCandidate,
} from '@/lib/goal-finder';
import SmartChips, { type SmartRead } from '@/components/goals/SmartChips';
import RoleGoalIdeas from '@/components/goals/RoleGoalIdeas';
import GoalFinder from '@/components/goals/GoalFinder';
import { evaluateGoalGate, flagsFromSmartText } from '@/lib/goal-gate';
import NoPhiNote from '@/components/NoPhiNote';

type Suggestion = { title: string; target: string | null; smart: SmartRead | null };

/**
 * Set my goal. Two ways in: say what you are looking at and let Pathfinder
 * suggest goals that fit (you pick), or write it yourself. Either way the
 * words in the Goal box are the member's: Pathfinder only ever *suggests*
 * tighter wording, and only when asked, and the member chooses whether to
 * take it. The goal stays theirs until it is done or changed; a target date
 * is optional. Saving can break the goal into steps straight away.
 */
export default function SetGoalCard({
  onCreated,
}: {
  /** Fires with the saved goal and whether the member asked for a plan right away. */
  onCreated?: (goal: Goal, options: { plan: boolean }) => void;
}) {
  const createGoal = useCreateGoal();
  const seedThread = useSeedGoalThread();
  const titleRef = useRef<HTMLInputElement>(null);

  const [finderOpen, setFinderOpen] = useState(true);
  const [transcript, setTranscript] = useState<FinderTurn[]>([]);
  const [title, setTitle] = useState('');
  const [target, setTarget] = useState('');
  const [dueOn, setDueOn] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [smart, setSmart] = useState<SmartRead | null>(null);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [suggesting, setSuggesting] = useState(false);

  // S+M hard gate — the goal must be specific and measurable before it saves.
  const gate = evaluateGoalGate({ title, target, smart: flagsFromSmartText(smart) });
  const busy = createGoal.isPending || seedThread.isPending;

  const pickCandidate = (candidate: GoalCandidate) => {
    const form = candidateToForm(candidate, getToday());
    setTitle(form.title);
    setTarget(form.target);
    setDueOn(form.dueOn);
    setSuggestion(null);
    setSmart(null);
    setFinderOpen(false);
    requestAnimationFrame(() => titleRef.current?.focus());
  };

  /** Asked for explicitly. Never applied on its own. */
  const askForWording = async () => {
    const raw = title.trim();
    if (!raw || suggesting) return;
    setSuggesting(true);
    try {
      const result = await callPathfinder({
        mode: 'polish_goal',
        title: raw,
        description: description.trim() || undefined,
        dueOn: dueOn || null,
      });
      const polished = result.title?.trim() ?? '';
      if (polished && polished !== raw) {
        setSuggestion({ title: polished, target: result.target ?? null, smart: result.smart ?? null });
      } else {
        setSuggestion(null);
        if (result.smart) setSmart(result.smart);
        toast('Pathfinder would keep your wording as it is.');
      }
    } catch {
      toast.error('Pathfinder could not suggest wording right now.');
    } finally {
      setSuggesting(false);
    }
  };

  const takeSuggestion = () => {
    if (!suggestion) return;
    setTitle(suggestion.title);
    if (suggestion.target && !target.trim()) setTarget(suggestion.target);
    setSmart(suggestion.smart);
    setSuggestion(null);
  };

  const reset = () => {
    setTitle('');
    setTarget('');
    setDueOn('');
    setDescription('');
    setIsPrivate(false);
    setSmart(null);
    setSuggestion(null);
    setTranscript([]);
    setFinderOpen(true);
  };

  const save = async (plan: boolean) => {
    if (!gate.ok || busy) return;
    try {
      const goal = await createGoal.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        smartTarget: target.trim() || null,
        dueOn: dueOn || null,
        visibility: isPrivate ? 'private' : 'team',
      });
      // The conversation that chose the goal belongs with the goal, so the
      // goal's own Pathfinder thread remembers it. Best effort: never blocks.
      const exchange = exchangeOnly(transcript);
      if (exchange.length > 0) {
        seedThread.mutate({ goalId: goal.id, turns: exchange });
      }
      reset();
      onCreated?.(goal, { plan });
      toast.success(
        plan ? 'Goal set — Pathfinder is breaking it into steps.' : "Goal set — it's yours until it's done."
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your goal');
    }
  };

  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Target className="h-4 w-4 text-primary" />
          What are you working on?
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          One thing you'd like to get better at. It stays your goal until you finish it or change
          it, and the whole team sees it at the next team meeting.
        </p>

        {finderOpen ? (
          <GoalFinder onPick={pickCandidate} onTranscript={setTranscript} />
        ) : (
          <Button type="button" variant="ghost" size="sm" onClick={() => setFinderOpen(true)}>
            <Compass className="mr-2 h-4 w-4" />
            Talk it through with Pathfinder
          </Button>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="goal-title">Goal</Label>
          <Input
            id="goal-title"
            ref={titleRef}
            value={title}
            onChange={e => {
              setTitle(e.target.value);
              setSuggestion(null);
              setSmart(null);
            }}
            placeholder="e.g. Get faster and more confident at scheduling follow-ups"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              Your words stay your words. Say what you'll do and how you'll know it's done.
            </p>
            {title.trim() && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
                onClick={askForWording}
                disabled={suggesting}
              >
                {suggesting ? (
                  <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                )}
                Suggest tighter wording
              </Button>
            )}
          </div>
          {suggestion && (
            <div className="space-y-2 rounded-md border border-primary/30 bg-primary/[0.04] p-3">
              <p className="text-xs font-medium text-muted-foreground">Pathfinder suggests</p>
              <p className="text-sm">{suggestion.title}</p>
              {suggestion.target && !target.trim() && (
                <p className="text-xs text-muted-foreground">Measured by: {suggestion.target}</p>
              )}
              {suggestion.smart && <SmartChips smart={suggestion.smart} />}
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" onClick={takeSuggestion}>
                  Use it
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => setSuggestion(null)}>
                  Keep mine
                </Button>
              </div>
            </div>
          )}
          {!suggestion && smart && <SmartChips smart={smart} />}
          {gate.hints.specific && (
            <p className="text-xs text-muted-foreground">S: {gate.hints.specific}</p>
          )}
        </div>

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
          <Label htmlFor="goal-due">Target date (optional)</Label>
          <Input
            id="goal-due"
            type="date"
            min={getToday()}
            value={dueOn}
            onChange={e => setDueOn(e.target.value)}
            className="w-auto"
          />
          <p className="text-xs text-muted-foreground">
            Leave it blank and the goal simply runs until you mark it done.
          </p>
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

        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => save(true)}
            disabled={!gate.ok || busy || !createGoal.isReady || suggesting}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Set my goal and plan the steps
          </Button>
          <Button
            variant="ghost"
            onClick={() => save(false)}
            disabled={!gate.ok || busy || !createGoal.isReady || suggesting}
          >
            Save without a plan
          </Button>
        </div>

        <details className="rounded-md border border-dashed border-border/70 px-3 py-2">
          <summary className="cursor-pointer text-xs text-muted-foreground">
            Examples of goals for each role
          </summary>
          <div className="pt-3">
            <RoleGoalIdeas
              onPickExample={idea => {
                setTitle(idea.title);
                setTarget(idea.target);
                setSuggestion(null);
                setSmart(null);
              }}
              onPickTarget={t => setTarget(t)}
            />
          </div>
        </details>
      </CardContent>
    </Card>
  );
}
