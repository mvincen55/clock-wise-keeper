import { BookOpen, CheckCircle2, CircleDashed, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import {
  useAttemptSummaries,
  useTrainingAssignments,
  useTrainingModules,
} from '@/hooks/useTraining';

type State = 'not_started' | 'in_progress' | 'passed';

const LABEL: Record<State, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  passed: 'Passed',
};

/**
 * Training modules Pathfinder wrote for this goal. They live in the central
 * Training Library like everything else — this is just the member's view of
 * where they are with them. Scores are never shown to anyone else.
 */
export default function GoalTrainingModules({
  goalId,
  ownerUserId,
  compact = false,
}: {
  goalId: string;
  ownerUserId: string;
  compact?: boolean;
}) {
  const { data: modules, isLoading } = useTrainingModules();
  const { data: assignments } = useTrainingAssignments();
  const { data: attempts } = useAttemptSummaries();

  const linked = (modules ?? []).filter(m => m.origin_goal_id === goalId);
  if (isLoading || linked.length === 0) return null;

  const stateFor = (moduleId: string): State => {
    const passed = (attempts ?? []).some(
      a => a.module_id === moduleId && a.user_id === ownerUserId && a.passed
    );
    if (passed) return 'passed';
    const tried = (attempts ?? []).some(
      a => a.module_id === moduleId && a.user_id === ownerUserId
    );
    const assignment = (assignments ?? []).find(
      a => a.module_id === moduleId && a.assigned_to === ownerUserId
    );
    if (tried || assignment?.status === 'in_progress') return 'in_progress';
    return 'not_started';
  };

  return (
    <div className="space-y-2 rounded-lg border border-border/70 bg-muted/20 p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <BookOpen className="h-3.5 w-3.5" />
        Learning for this goal
      </p>
      <ul className="space-y-1.5">
        {linked.map(m => {
          const state = stateFor(m.id);
          return (
            <li key={m.id} className="flex items-start justify-between gap-3">
              <Link
                to="/training"
                className="min-w-0 flex-1 text-sm hover:underline"
                title={m.summary}
              >
                {m.title}
              </Link>
              <Badge
                variant={state === 'passed' ? 'default' : 'outline'}
                className="shrink-0 gap-1 text-[10px]"
              >
                {state === 'passed' ? (
                  <CheckCircle2 className="h-3 w-3" />
                ) : state === 'in_progress' ? (
                  <Loader2 className="h-3 w-3" />
                ) : (
                  <CircleDashed className="h-3 w-3" />
                )}
                {LABEL[state]}
              </Badge>
            </li>
          );
        })}
      </ul>
      {!compact && (
        <p className="text-[11px] text-muted-foreground">
          Reading the module and passing its quiz checks off the matching plan step. Your
          answers stay private — the team only ever sees that it's done.
        </p>
      )}
    </div>
  );
}
