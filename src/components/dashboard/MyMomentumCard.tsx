import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { GraduationCap, Target } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import {
  currentMonth,
  monthElapsedFraction,
  useGoalsMonth,
  useToggleGoalTask,
} from '@/hooks/useGoals';
import { useTrainingAssignments, useTrainingModules } from '@/hooks/useTraining';
import GoalMonthTimeline from '@/components/goals/GoalMonthTimeline';
import ProgressRing from '@/components/goals/ProgressRing';
import { formatDate } from '@/lib/time-utils';

/**
 * My momentum: this month's goal in miniature, plus the training I have open.
 * Degrades gracefully — no goal shows the invitation to set one, no training
 * hides that half entirely.
 */
export default function MyMomentumCard() {
  const { user } = useAuth();
  const month = currentMonth();
  const { data } = useGoalsMonth(month);
  const toggle = useToggleGoalTask();
  const { data: assignments } = useTrainingAssignments();
  const { data: modules } = useTrainingModules();

  const goal = (data?.goals ?? []).find(g => g.user_id === user?.id && g.status === 'active');
  const tasks = goal ? (data?.tasks ?? []).filter(t => t.goal_id === goal.id) : [];
  const done = tasks.filter(t => t.done).length;
  const nextTask = tasks.find(t => !t.done);
  const elapsed = monthElapsedFraction(month);

  const myTraining = (assignments ?? []).filter(
    a => a.assigned_to === user?.id && a.status !== 'completed'
  );
  const moduleTitle = (id: string) => modules?.find(m => m.id === id)?.title ?? 'Training module';

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        My momentum
      </h2>

      <Card className="card-elevated">
        <CardContent className="p-4 space-y-4">
          {goal ? (
            <>
              <div className="flex items-start gap-3">
                <ProgressRing done={done} total={tasks.length} monthElapsed={elapsed} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{goal.title}</p>
                  {goal.smart_target && (
                    <p className="text-xs text-muted-foreground">Target: {goal.smart_target}</p>
                  )}
                </div>
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/goals">Open</Link>
                </Button>
              </div>

              <GoalMonthTimeline month={month} done={done} total={tasks.length} compact />

              {nextTask ? (
                <div className="flex items-center gap-3 rounded-lg border p-3">
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => toggle.mutate({ id: nextTask.id, done: true })}
                    aria-label={`Mark "${nextTask.title}" done`}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm truncate">{nextTask.title}</p>
                    {nextTask.due_date && (
                      <p className="text-xs text-muted-foreground">Due {formatDate(nextTask.due_date)}</p>
                    )}
                  </div>
                </div>
              ) : tasks.length > 0 ? (
                <p className="text-sm text-muted-foreground">Every step is checked off — nice work.</p>
              ) : null}
            </>
          ) : (
            <div className="flex items-center gap-3">
              <Target className="h-5 w-5 text-primary" />
              <div className="flex-1">
                <p className="font-medium">Set this month's goal</p>
                <p className="text-xs text-muted-foreground">
                  One goal, a few steps — Pathfinder can help you shape it.
                </p>
              </div>
              <Button size="sm" asChild>
                <Link to="/goals">Set a goal</Link>
              </Button>
            </div>
          )}

          {myTraining.length > 0 && (
            <div className="border-t pt-3 space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <GraduationCap className="h-4 w-4 text-primary" />
                My training
              </div>
              {myTraining.slice(0, 3).map(a => (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{moduleTitle(a.module_id)}</span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {a.status === 'in_progress' ? 'In progress' : 'Not started'}
                    {a.due_date ? ` · due ${formatDate(a.due_date)}` : ''}
                  </span>
                </div>
              ))}
              <Link to="/training" className="text-xs text-primary hover:underline">
                Open training →
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
