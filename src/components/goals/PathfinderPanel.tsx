import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Compass, Loader2, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  callPathfinder,
  useAddTaskToChecklist,
  useSaveGoalTasks,
  type Goal,
} from '@/hooks/useGoals';

type DraftTask = { title: string; due_date: string | null; toChecklist: boolean };

/**
 * Pathfinder panel — turns a goal into an editable plan.
 * Copy never hints that anything but the goal itself shaped the plan.
 */
export default function PathfinderPanel({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState<DraftTask[] | null>(null);
  const saveTasks = useSaveGoalTasks();
  const addToChecklist = useAddTaskToChecklist();

  const run = async () => {
    setLoading(true);
    try {
      const result = await callPathfinder({ mode: 'breakdown', goalId: goal.id });
      setTasks((result.tasks ?? []).map(t => ({ ...t, toChecklist: false })));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Pathfinder could not build a plan');
    } finally {
      setLoading(false);
    }
  };

  const accept = async () => {
    if (!tasks || tasks.length === 0) return;
    try {
      await saveTasks.mutateAsync({
        goalId: goal.id,
        tasks: tasks.map(t => ({ title: t.title, due_date: t.due_date })),
      });
      for (const t of tasks.filter(t => t.toChecklist)) {
        await addToChecklist.mutateAsync({ title: t.title, dueDate: t.due_date });
      }
      toast.success('Plan saved — nice work getting started.');
      setTasks(null);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the plan');
    }
  };

  const patch = (i: number, next: Partial<DraftTask>) =>
    setTasks(list => (list ? list.map((t, idx) => (idx === i ? { ...t, ...next } : t)) : list));

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Compass className="h-4 w-4 text-primary" />
          Pathfinder
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {!tasks && (
          <>
            <p className="text-sm text-muted-foreground">
              Turn this goal into a handful of small steps, spaced out across the month around your
              time off and the office calendar.
            </p>
            <Button onClick={run} disabled={loading} size="sm">
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
              Break it down
            </Button>
          </>
        )}

        {tasks && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Edit anything that doesn't fit, then accept the plan.
            </p>
            {tasks.map((task, i) => (
              <div key={i} className="rounded-lg border p-3 space-y-2">
                <div className="flex gap-2">
                  <Input
                    value={task.title}
                    onChange={e => patch(i, { title: e.target.value })}
                    className="flex-1"
                  />
                  <Input
                    type="date"
                    value={task.due_date ?? ''}
                    onChange={e => patch(i, { due_date: e.target.value || null })}
                    className="w-40"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label="Remove step"
                    onClick={() => setTasks(list => list!.filter((_, idx) => idx !== i))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id={`chk-${i}`}
                    checked={task.toChecklist}
                    onCheckedChange={v => patch(i, { toChecklist: v })}
                  />
                  <Label htmlFor={`chk-${i}`} className="text-xs text-muted-foreground">
                    Add to my checklist
                  </Label>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button size="sm" onClick={accept} disabled={saveTasks.isPending}>
                {saveTasks.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Accept plan
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setTasks(null)}>
                Discard
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
