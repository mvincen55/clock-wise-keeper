import { Link } from 'react-router-dom';
import { Target } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  UPDATE_STATUS_LABELS,
  currentMonth,
  useGoalsMonth,
  type UpdateStatus,
} from '@/hooks/useGoals';

const STATUS_TONE: Record<UpdateStatus, string> = {
  on_track: 'bg-primary/10 text-primary border-primary/30',
  at_risk: 'bg-warning/15 text-warning border-warning/30',
  done: 'bg-success/15 text-success border-success/30',
};

/**
 * This month's TEAM goal for one person, shown on the Team pages.
 * Private goals are never surfaced here — same visibility as the team grid.
 */
export default function MemberGoalSummary({
  userId,
  compact = false,
}: {
  userId: string | null | undefined;
  compact?: boolean;
}) {
  const month = currentMonth();
  const { data } = useGoalsMonth(month);
  if (!userId || !data) return null;

  const goal = data.goals.find(
    g => g.user_id === userId && g.visibility === 'team' && g.status !== 'archived'
  );
  if (!goal) {
    return compact ? null : (
      <p className="text-xs text-muted-foreground">No team goal set for this month yet.</p>
    );
  }

  const tasks = data.tasks.filter(t => t.goal_id === goal.id);
  const done = tasks.filter(t => t.done).length;
  const latest = data.updates.filter(u => u.goal_id === goal.id)[0];
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  return (
    <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <Target className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div>
            <p className="text-sm font-medium leading-snug">{goal.title}</p>
            {goal.smart_target && (
              <p className="text-xs text-muted-foreground">Target: {goal.smart_target}</p>
            )}
          </div>
        </div>
        {latest && (
          <Badge variant="outline" className={STATUS_TONE[latest.status]}>
            {UPDATE_STATUS_LABELS[latest.status]}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <Progress value={pct} className="h-1.5 flex-1" />
        <span className="text-xs text-muted-foreground">
          {done}/{tasks.length || 0} tasks
        </span>
      </div>

      {latest && (
        <p className="line-clamp-2 text-xs text-muted-foreground">{latest.content}</p>
      )}

      <Link to="/goals" className="inline-block text-xs text-primary hover:underline">
        View on Goals
      </Link>
    </div>
  );
}
