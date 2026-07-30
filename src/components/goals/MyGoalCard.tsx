import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { BookOpen, Compass, Loader2, Lock, Pencil, Sparkles, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import GoalProgress from './GoalProgress';
import GoalMonthTimeline from './GoalMonthTimeline';
import GoalTrainingModules from './GoalTrainingModules';
import TargetProgress from './TargetProgress';
import GoalStatusBadge from './GoalStatusBadge';
import PathfinderChat from './PathfinderChat';
import PathfinderPlanEditor, { type DraftTask } from './PathfinderPlanEditor';
import GoalEditDialog from './GoalEditDialog';
import GoalArchiveDialog from './GoalArchiveDialog';
import GoalChangeLog from './GoalChangeLog';
import {
  callPathfinder,
  monthElapsedFraction,
  useAddTaskToChecklist,
  useSaveGoalTasks,
  useGoalEvents,
  useToggleGoalTask,
  type Goal,
  type GoalTask,
  type GoalUpdate,
} from '@/hooks/useGoals';
import { useNextTeamMeeting } from '@/hooks/useOfficeEvents';
import { useQueryClient } from '@tanstack/react-query';

/** My goal — the elevated card at the top of the page. */
export default function MyGoalCard({
  goal,
  tasks,
  latestUpdate,
  onShareUpdate,
  shareCount,
  onArchived,
}: {
  goal: Goal;
  tasks: GoalTask[];
  latestUpdate?: GoalUpdate;
  onShareUpdate: () => void;
  /** How many updates this goal has — once shared, changes need a reason. */
  shareCount: number;
  onArchived: (eventId: string) => void;
}) {
  const [draft, setDraft] = useState<DraftTask[] | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [intro, setIntro] = useState('');
  const [resource, setResource] = useState<{ topic: string; attach_to_step: number } | null>(null);
  const [buildingResource, setBuildingResource] = useState(false);
  const { data: nextMeeting } = useNextTeamMeeting();
  const [editing, setEditing] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const { data: allEvents } = useGoalEvents(goal.month);
  const myEvents = (allEvents ?? []).filter(e => e.goal_id === goal.id);
  const qc = useQueryClient();
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
      setResource(result.resource ?? null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pathfinder could not build a plan');
    } finally {
      setDrafting(false);
    }
  };

  const acceptPlan = async () => {
    if (!draft || draft.length === 0) return;
    try {
      const saved = await saveTasks.mutateAsync({
        goalId: goal.id,
        tasks: draft.map(t => ({ title: t.title, due_date: t.due_date })),
      });
      for (const t of draft.filter(t => t.toChecklist)) {
        await addToChecklist.mutateAsync({ title: t.title, dueDate: t.due_date });
      }
      const pendingResource = resource;
      setDraft(null);
      setIntro('');
      setResource(null);
      toast.success('Plan saved — nice work getting started.');

      // Pathfinder thought a learning resource would genuinely help — build it
      // in the central training library and attach it to the right step.
      if (pendingResource) {
        setBuildingResource(true);
        try {
          const taskId = saved[pendingResource.attach_to_step - 1]?.id;
          const built = await callPathfinder({
            mode: 'build_resource',
            goalId: goal.id,
            topic: pendingResource.topic,
            taskId,
          });
          qc.invalidateQueries({ queryKey: ['training-modules'] });
          qc.invalidateQueries({ queryKey: ['training-assignments'] });
          qc.invalidateQueries({ queryKey: ['goals'] });
          if (built.module) toast.success(`Training added: ${built.module.title}`);
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not add the training resource');
        } finally {
          setBuildingResource(false);
        }
      }
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
            <Button
              variant="ghost"
              size="icon"
              aria-label="Edit goal"
              title="Edit goal"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Delete goal"
              title="Delete goal"
              onClick={() => setArchiving(true)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {goal.description && (
          <p className="text-sm text-muted-foreground">{goal.description}</p>
        )}

        <GoalMonthTimeline
          month={goal.month}
          meetingDate={nextMeeting?.event_date ?? null}
          done={done}
          total={tasks.length}
        />

        {hasPlan && (
          <div className="space-y-2">
            <GoalProgress done={done} total={tasks.length} monthElapsed={elapsed} />
            <TargetProgress target={goal.smart_target} done={done} total={tasks.length} />
          </div>
        )}

        {!hasPlan && !draft && (
          <div className="rounded-lg border border-dashed border-primary/40 bg-primary/[0.03] p-5 text-center">
            <Compass className="mx-auto mb-2 h-6 w-6 text-[hsl(var(--goal-purple))]" />
            <p className="text-sm font-medium">No plan yet</p>
            <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
              Pathfinder will turn this into a handful of concrete steps, paced around your time
              off and the next team meeting.
            </p>
          </div>
        )}

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

        {buildingResource && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Building a training resource for this goal…
          </p>
        )}

        <GoalTrainingModules goalId={goal.id} memberUserId={goal.user_id} />

        {draft && intro && (
          <p className="flex items-start gap-2 rounded-lg bg-primary/[0.05] p-3 text-sm">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--goal-purple))]" />
            <span>{intro}</span>
          </p>
        )}

        {draft && resource && (
          <p className="flex items-start gap-2 px-1 text-xs text-muted-foreground">
            <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              Pathfinder will also add a training module on “{resource.topic}” to the library when
              you accept.
            </span>
          </p>
        )}

        {draft && (
          <PathfinderPlanEditor
            tasks={draft}
            onChange={setDraft}
            onAccept={acceptPlan}
            onDiscard={() => {
              setDraft(null);
              setIntro('');
              setResource(null);
            }}
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

        <GoalChangeLog events={myEvents} title="Changes to this goal" />

        <PathfinderChat goalId={goal.id} />

        {editing && (
          <GoalEditDialog
            goal={goal}
            wasShared={shareCount > 0}
            open={editing}
            onOpenChange={setEditing}
          />
        )}
        {archiving && (
          <GoalArchiveDialog
            goal={goal}
            wasShared={shareCount > 0}
            open={archiving}
            onOpenChange={setArchiving}
            onArchived={onArchived}
          />
        )}
      </CardContent>
    </Card>
  );
}
