import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import GoalProgress from './GoalProgress';
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
            {goal.smart_target && (
              <p className="mt-0.5 text-xs text-muted-foreground">Target: {goal.smart_target}</p>
            )}
            <GoalProgress
              done={tasks.filter(t => t.done).length}
              total={tasks.length}
              monthElapsed={monthElapsedFraction(goal.month)}
              compact
            />
            {latestUpdate ? (
              <p className="line-clamp-3 text-xs text-muted-foreground">{latestUpdate.content}</p>
            ) : (
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                No update yet
              </p>
            )}
          </>
        ) : (
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
            No goal set yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
