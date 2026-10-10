import AddToMyListButton from '@/components/copilot/AddToMyListButton';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, Compass, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { shortDate } from '@/hooks/useOfficeEvents';
import { easternDateKey } from '@/lib/time-utils';
import GoalProgress from './GoalProgress';
import GoalTimeline from './GoalTimeline';
import GoalTrainingModules from './GoalTrainingModules';
import ProgressRing from '@/components/ProgressRing';
import TargetProgress from './TargetProgress';
import GoalStatusBadge from './GoalStatusBadge';
import PathfinderChat from './PathfinderChat';
import PathfinderPlanEditor, { type DraftTask } from './PathfinderPlanEditor';
import GoalEditDialog from './GoalEditDialog';
import GoalArchiveDialog from './GoalArchiveDialog';
import {
  callPathfinder,
  goalElapsedFraction,
  useAddTaskToChecklist,
  useCompleteGoal,
  useSaveGoalTasks,
  useToggleGoalTask,
  type Goal,
  type GoalEvent,
  type GoalTask,
  type GoalUpdate,
} from '@/hooks/useGoals';

/**
 * My goal — the elevated card at the top of the page. It is mine until I
 * mark it complete or let it go; a finished goal stays here a while so the
 * next meeting hears about it, then makes room for the next one.
 */
export default function MyGoalCard({
  goal,
  tasks,
  latestUpdate,
  onShareUpdate,
  events = [],
  onArchived,
  autoPlan = false,
  onAutoPlanHandled,
}: {
  goal: Goal;
  tasks: GoalTask[];
  latestUpdate?: GoalUpdate;
  onShareUpdate: () => void;
  /** Change history for this goal — edits and archives, never silent. */
  events?: GoalEvent[];
  onArchived?: (eventId: string) => void;
  /** Just saved with "plan the steps": break it down right away, once. */
  autoPlan?: boolean;
  onAutoPlanHandled?: () => void;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [draft, setDraft] = useState<DraftTask[] | null>(null);
  const [intro, setIntro] = useState<string>('');
  const [drafting, setDrafting] = useState(false);
  const saveTasks = useSaveGoalTasks();
  const addToChecklist = useAddTaskToChecklist();
  const toggleTask = useToggleGoalTask();
  const completeGoal = useCompleteGoal();

  const done = tasks.filter(t => t.done).length;
  const elapsed = goalElapsedFraction(goal);
  const completed = goal.status === 'completed';
  const completedOn = goal.completed_at ?? (completed ? goal.updated_at : null);

  const markComplete = async () => {
    try {
      await completeGoal.mutateAsync(goal);
      setCompleteOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not mark the goal complete');
    }
  };

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

  // "Set my goal and plan the steps": the card scrolls into view and asks
  // Pathfinder for the plan the moment it mounts, exactly once.
  const cardRef = useRef<HTMLDivElement>(null);
  const autoPlanned = useRef(false);
  useEffect(() => {
    if (!autoPlan || autoPlanned.current) return;
    autoPlanned.current = true;
    onAutoPlanHandled?.();
    cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (!hasPlan && !draft && !drafting && !completed) void breakItDown();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPlan]);

  return (
    <Card ref={cardRef} className="border-primary/40 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-base leading-snug">{goal.title}</CardTitle>

          <div className="flex items-center gap-2">
            {goal.visibility === 'private' && (
              <Badge variant="outline" className="gap-1">
                <Lock className="h-3 w-3" /> Private
              </Badge>
            )}
            {completed ? (
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3 w-3" /> Completed
                {completedOn ? ` ${shortDate(easternDateKey(completedOn))}` : ''}
              </Badge>
            ) : (
              <>
                {latestUpdate && <GoalStatusBadge status={latestUpdate.status} />}
                <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
                  Edit
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setArchiveOpen(true)}>
                  Let it go
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {goal.description && (
          <p className="text-sm text-muted-foreground">{goal.description}</p>
        )}

        <div className="flex items-start gap-4 rounded-lg border border-border/60 bg-muted/20 p-3">
          <ProgressRing done={done} total={tasks.length} elapsed={elapsed} size={52} />
          <div className="min-w-0 flex-1 space-y-2">
            <GoalTimeline goal={goal} done={done} total={tasks.length} />
            <GoalProgress
              done={done}
              total={tasks.length}
              elapsed={elapsed}
              hasDeadline={!!goal.due_on}
            />
            <TargetProgress target={goal.smart_target} done={done} total={tasks.length} />
          </div>
        </div>

        <GoalTrainingModules goalId={goal.id} ownerUserId={goal.user_id} />

        {hasPlan && (
          <ul className="space-y-2">
            {tasks.map(task => (
              <li key={task.id} className="space-y-1">
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
                {/* One tap puts the step on their real list for the right day. */}
                {!task.done && (
                  <div className="pl-8">
                    <AddToMyListButton
                      surface="goal_plan"
                      title={task.title}
                      dueDate={task.due_date}
                      label="Add to my list"
                      variant="ghost"
                    />
                  </div>
                )}
              </li>
            ))}

          </ul>
        )}

        {!hasPlan && !draft && !completed && (
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

        {completed && (
          <p className="text-sm text-muted-foreground">
            This one is done. It stays here for the next team meeting, and your next goal starts
            whenever you set it.
          </p>
        )}

        {/* Exactly one primary action for this card's state */}
        {!draft && !completed && (
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
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto"
              onClick={() => setCompleteOpen(true)}
            >
              <CheckCircle2 className="mr-2 h-4 w-4" />
              Mark complete
            </Button>
          </div>
        )}

        {events.length > 0 && (
          <div className="space-y-1 rounded-lg border border-border/60 bg-muted/10 p-3">
            <p className="text-xs font-medium">Changes to this goal</p>
            {events.map(ev => (
              <p key={ev.id} className="text-xs text-muted-foreground">
                {ev.type === 'archived'
                  ? 'Set aside'
                  : ev.type === 'replaced'
                    ? `Replaced by “${ev.new_title}”`
                    : 'Reworded'}{' '}
                — {ev.reason}
              </p>
            ))}
          </div>
        )}

        {!completed && <PathfinderChat goalId={goal.id} />}
      </CardContent>

      <AlertDialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark this goal complete?</AlertDialogTitle>
            <AlertDialogDescription>
              “{goal.title}” closes out today. It stays on the page for the next team meeting, and
              you can set your next goal right away.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Not yet</AlertDialogCancel>
            <AlertDialogAction
              onClick={e => {
                e.preventDefault();
                void markComplete();
              }}
              disabled={completeGoal.isPending}
            >
              {completeGoal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Yes, it's done
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <GoalEditDialog
        goal={goal}
        hasUpdates={!!latestUpdate}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <GoalArchiveDialog
        goal={goal}
        open={archiveOpen}
        onOpenChange={setArchiveOpen}
        onArchived={id => onArchived?.(id)}
      />
    </Card>
  );
}

