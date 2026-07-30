import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Compass, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import GoalProgress from './GoalProgress';
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
        tasks: draft.map(t => ({ title: t.title, due_date: t.due_date })),
      });
      for (const t of draft.filter(t => t.toChecklist)) {
        await addToChecklist.mutateAsync({ title: t.title, dueDate: t.due_date });
      }
      setDraft(null);
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

        <GoalProgress done={done} total={tasks.length} monthElapsed={elapsed} />

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
