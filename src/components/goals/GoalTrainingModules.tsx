import { BookOpen, CheckCircle2, CircleDashed, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import {
  useAttemptSummaries,
  useTrainingAssignments,
  useTrainingModules,
} from '@/hooks/useTraining';

type State = 'not_started' | 'in_progress' | 'passed';

const STATE_LABEL: Record<State, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  passed: 'Passed',
};

/**
 * Training modules Pathfinder built for this goal. They live in the central
 * library like everything else — this is just the goal's view of them, with
 * the member's own state. Scores are never shown to anyone else.
 */
export default function GoalTrainingModules({
  goalId,
  memberUserId,
  compact = false,
}: {
  goalId: string;
  memberUserId: string;
  compact?: boolean;
}) {
  const { user } = useAuth();
  const { data: modules, isLoading } = useTrainingModules();
  const { data: assignments } = useTrainingAssignments();
  const { data: attempts } = useAttemptSummaries();

  const linked = (modules ?? []).filter(m => m.origin_goal_id === goalId);
  if (isLoading || linked.length === 0) return null;

  const stateFor = (moduleId: string): State => {
    const passed = (attempts ?? []).some(
      a => a.module_id === moduleId && a.user_id === memberUserId && a.passed
    );
    if (passed) return 'passed';
    const assignment = (assignments ?? []).find(
      a => a.module_id === moduleId && a.assigned_to === memberUserId
    );
    if (assignment?.status === 'completed') return 'passed';
    if (assignment?.status === 'in_progress') return 'in_progress';
    const attempted = (attempts ?? []).some(
      a => a.module_id === moduleId && a.user_id === memberUserId
    );
    return attempted ? 'in_progress' : 'not_started';
  };

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-[hsl(var(--goal-purple))]" />
        <span className={cn('font-medium', compact ? 'text-xs' : 'text-sm')}>
          Training for this goal
        </span>
      </div>
      <ul className="space-y-1.5">
        {linked.map(m => {
          const state = stateFor(m.id);
          const mine = memberUserId === user?.id;
          return (
            <li key={m.id} className="flex items-start justify-between gap-3">
              <span className="min-w-0 flex-1">
                {mine ? (
                  <Link to="/training" className="break-words text-sm hover:underline">
                    {m.title}
                  </Link>
                ) : (
                  <span className="break-words text-sm">{m.title}</span>
                )}
                {!compact && m.summary && (
                  <span className="mt-0.5 block text-xs text-muted-foreground">{m.summary}</span>
                )}
              </span>
              <Badge variant="outline" className="shrink-0 gap-1 text-[10px]">
                {state === 'passed' ? (
                  <CheckCircle2 className="h-3 w-3 text-[hsl(var(--goal-purple))]" />
                ) : state === 'in_progress' ? (
                  <Loader2 className="h-3 w-3" />
                ) : (
                  <CircleDashed className="h-3 w-3" />
                )}
                {STATE_LABEL[state]}
              </Badge>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
