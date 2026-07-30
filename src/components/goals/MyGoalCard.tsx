import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Compass, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import GoalProgress from './GoalProgress';
import GoalMonthTimeline from './GoalMonthTimeline';
import GoalTrainingModules from './GoalTrainingModules';
import ProgressRing from './ProgressRing';
import TargetProgress from './TargetProgress';
import GoalStatusBadge from './GoalStatusBadge';
import PathfinderChat from './PathfinderChat';
import PathfinderPlanEditor, { type DraftTask } from './PathfinderPlanEditor';
import {
  callPathfinder,
  monthElapsedFraction,
  useAddTaskToChecklist,
  useSaveGoalTasks,
  useToggleGoalTask,
  type Goal,
  type GoalTask,
  type GoalUpdate,
} from '@/hooks/useGoals';

/** My goal — the elevated card at the top of the page. */
export default function MyGoalCard({
  goal,
  tasks,
  latestUpdate,
  onShareUpdate,
}: {
  goal: Goal;
  tasks: GoalTask[];
  latestUpdate?: GoalUpdate;
  onShareUpdate: () => void;
}) {
  const [draft, setDraft] = useState<DraftTask[] | null>(null);
  const [intro, setIntro] = useState<string>('');
  const [drafting, setDrafting] = useState(false);
  const saveTasks = useSaveGoalTasks();
  const addToChecklist = useAddTaskToChecklist();
  const toggleTask = useToggleGoalTask();

  const done = tasks.filter(t => t.done).length;
  const elapsed = monthElapsedFraction(goal.month);

  const breakItDown = async () => {
    setDrafting(true);
    try {
      const result = await callPathfinder({ mode: 'breakdown', goalId: goal.id });
      setDraft((result.tasks ?? []).map(t => ({ ...t, toChecklist: false })));
      setIntro(result.intro ?? '');
      if (result.module) {
        toast.success(`Pathfinder added "${result.module.title}" to the Training Library.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pathfinder could not build a plan');
    } finally {
      setDrafting(false);
    }
  };

  const acceptPlan = async () => {
    if (!draft || draft.length === 0) return;
    try {
      await saveTasks.mutateAsync({
        goalId: goal.id,
        tasks: draft.map(t => ({
          title: t.title,
          due_date: t.due_date,
          training_module_id: t.training_module_id ?? null,
        })),
      });
      for (const t of draft.filter(t => t.toChecklist)) {
        await addToChecklist.mutateAsync({ title: t.title, dueDate: t.due_date });
      }
      setDraft(null);
      setIntro('');
      toast.success('Plan saved — nice work getting started.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the plan');
    }
  };

  const hasPlan = tasks.length > 0;

  return (
    <Card className="border-primary/40 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{goal.title}</CardTitle>

          <div className="flex items-center gap-2">
            {goal.visibility === 'private' && (
              <Badge variant="outline" className="gap-1">
                <Lock className="h-3 w-3" /> Private
              </Badge>
            )}
            {latestUpdate && <GoalStatusBadge status={latestUpdate.status} />}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {goal.description && (
          <p className="text-sm text-muted-foreground">{goal.description}</p>
        )}

        <div className="flex items-start gap-4 rounded-lg border border-border/60 bg-muted/20 p-3">
          <ProgressRing done={done} total={tasks.length} monthElapsed={elapsed} size={52} />
          <div className="min-w-0 flex-1 space-y-2">
            <GoalMonthTimeline
              month={goal.month}
              done={done}
              total={tasks.length}
            />
            <GoalProgress done={done} total={tasks.length} monthElapsed={elapsed} />
            <TargetProgress target={goal.smart_target} done={done} total={tasks.length} />
          </div>
        </div>

        <GoalTrainingModules goalId={goal.id} ownerUserId={goal.user_id} />

        {hasPlan && (
          <ul className="space-y-2">
            {tasks.map(task => (
              <li key={task.id}>
                <label className="flex items-start gap-3 sm:items-center">
                  <Checkbox
                    className="mt-0.5 shrink-0 sm:mt-0"
                    checked={task.done}
                    onCheckedChange={v => toggleTask.mutate({ id: task.id, done: v === true })}
                    aria-label={task.title}
                  />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <span
                      className={cn(
                        'break-words text-sm',
                        task.done && 'text-muted-foreground line-through'
                      )}
                    >
                      {task.title}
                    </span>
                    {task.due_date && (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {task.due_date}
                      </span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {!hasPlan && !draft && (
          <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] px-4 py-6 text-center">
            <Compass className="h-6 w-6 text-primary" />
            <p className="text-sm font-medium">No plan yet</p>
            <p className="max-w-sm text-xs text-muted-foreground">
              Pathfinder can turn this goal into a handful of dated steps that land before
              your next team meeting.
            </p>
          </div>
        )}

        {draft && intro && (
          <p className="rounded-lg bg-primary/5 px-3 py-2 text-sm text-muted-foreground">
            {intro}
          </p>
        )}

        {draft && (
          <PathfinderPlanEditor
            tasks={draft}
            onChange={setDraft}
            onAccept={acceptPlan}
            onDiscard={() => setDraft(null)}
            saving={saveTasks.isPending || addToChecklist.isPending}
          />
        )}

        {/* Exactly one primary action for this card's state */}
        {!draft && (
          <div className="flex flex-wrap items-center gap-2">
            {hasPlan ? (
              <>
                <Button onClick={onShareUpdate}>Share an update</Button>
                <Button variant="ghost" size="sm" onClick={breakItDown} disabled={drafting}>
                  {drafting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Compass className="mr-2 h-4 w-4" />
                  )}
                  Add more steps
                </Button>
              </>
            ) : (
              <>
                <Button onClick={breakItDown} disabled={drafting}>
                  {drafting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Compass className="mr-2 h-4 w-4" />
                  )}
                  Break it down
                </Button>
                <Button variant="ghost" size="sm" onClick={onShareUpdate}>
                  Share an update
                </Button>
              </>
            )}
          </div>
        )}

        <PathfinderChat goalId={goal.id} />
      </CardContent>
    </Card>
  );
}
