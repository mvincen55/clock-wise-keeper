import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Target } from 'lucide-react';
import GoalProgress from './GoalProgress';
import GoalMonthTimeline from './GoalMonthTimeline';
import GoalTrainingModules from './GoalTrainingModules';
import ProgressRing from '@/components/ProgressRing';
import TargetProgress from './TargetProgress';
import GoalStatusBadge from './GoalStatusBadge';
import { monthElapsedFraction, type Goal, type GoalTask, type GoalUpdate } from '@/hooks/useGoals';

/** A quieter card for a teammate's goal. */
export default function TeamGoalCard({
  name,
  goal,
  tasks,
  latestUpdate,
}: {
  name: string;
  goal?: Goal;
  tasks: GoalTask[];
  latestUpdate?: GoalUpdate;
}) {
  return (
    <Card className="border-border/60 bg-muted/20 shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium">{name}</CardTitle>
          {latestUpdate && <GoalStatusBadge status={latestUpdate.status} className="text-[10px]" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {goal ? (
          <>
            <p className="break-words text-sm">{goal.title}</p>
            <div className="flex items-start gap-3">
              <ProgressRing
                done={tasks.filter(t => t.done).length}
                total={tasks.length}
                monthElapsed={monthElapsedFraction(goal.month)}
                size={38}
              />
              <div className="min-w-0 flex-1">
                <GoalMonthTimeline
                  month={goal.month}
                  done={tasks.filter(t => t.done).length}
                  total={tasks.length}
                  compact
                />
              </div>
            </div>
            <GoalProgress
              done={tasks.filter(t => t.done).length}
              total={tasks.length}
              monthElapsed={monthElapsedFraction(goal.month)}
              compact
            />
            <TargetProgress
              target={goal.smart_target}
              done={tasks.filter(t => t.done).length}
              total={tasks.length}
              compact
            />
            {latestUpdate ? (
              <p className="line-clamp-3 text-xs text-muted-foreground">{latestUpdate.content}</p>
            ) : (
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                No update yet
              </p>
            )}
            <GoalTrainingModules goalId={goal.id} ownerUserId={goal.user_id} compact />
          </>
        ) : (
          <div className="flex flex-col items-center gap-1.5 rounded-lg border border-dashed border-border/70 px-3 py-5 text-center">
            <Target className="h-5 w-5 text-muted-foreground/60" />
            <p className="text-xs font-medium">No goal set yet</p>
            <p className="text-[11px] text-muted-foreground">
              They'll pick one thing to work on this month.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
