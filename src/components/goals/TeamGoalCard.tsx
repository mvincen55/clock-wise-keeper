import { Target } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import GoalStatusBadge from './GoalStatusBadge';
import ProgressRing from './ProgressRing';
import GoalMonthTimeline from './GoalMonthTimeline';
import TargetProgress from './TargetProgress';
import GoalTrainingModules from './GoalTrainingModules';
import { currentMonth, monthElapsedFraction, type Goal, type GoalTask, type GoalUpdate } from '@/hooks/useGoals';

/** A quieter card for a teammate's goal — visual in every state. */
export default function TeamGoalCard({
  name,
  goal,
  tasks,
  latestUpdate,
  meetingDate,
}: {
  name: string;
  goal?: Goal;
  tasks: GoalTask[];
  latestUpdate?: GoalUpdate;
  meetingDate?: string | null;
}) {
  const done = tasks.filter(t => t.done).length;
  const month = goal?.month ?? currentMonth();

  return (
    <Card className="border-border/60 bg-muted/20 shadow-none">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-sm font-medium">{name}</CardTitle>
          {latestUpdate && <GoalStatusBadge status={latestUpdate.status} className="text-[10px]" />}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {goal ? (
          <>
            <div className="flex items-start gap-3">
              <ProgressRing
                done={done}
                total={tasks.length}
                monthElapsed={monthElapsedFraction(month)}
              />
              <p className="min-w-0 flex-1 break-words text-sm">{goal.title}</p>
            </div>

            <GoalMonthTimeline
              month={month}
              meetingDate={meetingDate}
              done={done}
              total={tasks.length}
              compact
            />

            <TargetProgress target={goal.smart_target} done={done} total={tasks.length} compact />

            <GoalTrainingModules goalId={goal.id} memberUserId={goal.user_id} compact />

            {latestUpdate ? (
              <p className="line-clamp-3 text-xs text-muted-foreground">{latestUpdate.content}</p>
            ) : (
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                No update yet
              </p>
            )}
          </>
        ) : (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <ProgressRing done={0} total={0} />
              <p className="min-w-0 flex-1 text-sm text-muted-foreground">
                Hasn't set a goal for this month yet.
              </p>
            </div>
            <GoalMonthTimeline month={month} meetingDate={meetingDate} done={0} total={0} compact />
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <Target className="h-3.5 w-3.5" />
              Their card fills in as soon as they do.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
