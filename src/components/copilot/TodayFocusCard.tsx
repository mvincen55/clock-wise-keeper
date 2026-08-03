import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check, Clock3, Target } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getToday } from '@/lib/time-utils';
import { dayLabel, pickNextThing, tinyFirstStep, type FocusCandidate } from '@/lib/copilot';
import { useMyItems, useCompleteMyItem, useDeferItem } from '@/hooks/useCopilot';
import { useGoalsMonth } from '@/hooks/useGoals';
import { useTrainingAssignments, useTrainingModules } from '@/hooks/useTraining';
import { useAuth } from '@/hooks/useAuth';

/**
 * TODAY FOCUS — one spotlight, one thing.
 *
 * The single most important open item right now, with the tiniest possible
 * first step spelled out. Everything else stays one tap away.
 */
export default function TodayFocusCard() {
  const today = getToday();
  const { user } = useAuth();
  const { data: items } = useMyItems();
  const { data: goalData } = useGoalsMonth(today.slice(0, 7));
  const { data: assignments } = useTrainingAssignments();
  const { data: modules } = useTrainingModules();
  const complete = useCompleteMyItem();
  const defer = useDeferItem();

  const openItems = (items ?? []).filter(i => !i.done && (!i.due_date || i.due_date <= today));

  const candidates: FocusCandidate[] = [
    ...openItems.map(i => ({
      id: i.id,
      kind: 'checklist' as const,
      title: i.title,
      firstStep: i.first_step,
      dueDate: i.due_date,
      href: '/checklists',
    })),
    ...(goalData?.tasks ?? [])
      .filter(t => !t.done && t.due_date && t.due_date <= today)
      .filter(t => (goalData?.goals ?? []).some(g => g.id === t.goal_id && g.user_id === user?.id))
      .map(t => ({
        id: t.id,
        kind: 'goal_task' as const,
        title: t.title,
        dueDate: t.due_date,
        href: '/goals',
      })),
    ...(assignments ?? [])
      .filter(a => a.assigned_to === user?.id && a.status !== 'completed')
      .filter(a => a.due_date && a.due_date <= today)
      .map(a => ({
        id: a.id,
        kind: 'training' as const,
        title: (modules ?? []).find(m => m.id === a.module_id)?.title ?? 'Training module',
        dueDate: a.due_date,
        href: '/training',
      })),
  ];

  const next = pickNextThing(candidates, today);
  const remaining = candidates.length - (next ? 1 : 0);
  const focusItem = next && next.kind === 'checklist' ? openItems.find(i => i.id === next.id) : undefined;

  if (!next) {
    return (
      <Card className="card-elevated border-primary/20">
        <CardContent className="p-4 flex items-center gap-3">
          <Target className="h-5 w-5 text-primary" />
          <div>
            <p className="text-sm font-semibold">Nothing needs you right now.</p>
            <p className="text-xs text-muted-foreground">Your list is clear for today.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="card-elevated border-primary/30 bg-primary/[0.03]">
      <CardContent className="p-5 space-y-3">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-primary font-semibold">
          <Target className="h-4 w-4" /> Your next thing
        </div>
        <div>
          <p className="text-lg font-semibold leading-snug">{next.title}</p>
          <p className="text-sm text-muted-foreground mt-1">
            Start here: {tinyFirstStep(next.title, next.firstStep)}
          </p>
          {next.dueDate && (
            <p className="text-xs text-muted-foreground mt-1">
              {next.dueDate < today ? 'Was set for an earlier day — no rush' : `Set for ${dayLabel(next.dueDate, today)}`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {focusItem ? (
            <>
              <Button size="sm" disabled={complete.isPending} onClick={() => complete.mutate(focusItem)}>
                <Check className="h-3.5 w-3.5 mr-1" /> Done
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={defer.isPending}
                onClick={() => defer.mutate({ id: focusItem.id, currentCount: focusItem.deferral_count })}
              >
                <Clock3 className="h-3.5 w-3.5 mr-1" /> Hold for tomorrow
              </Button>
            </>
          ) : (
            <Link to={next.href ?? '/'}>
              <Button size="sm">Open it</Button>
            </Link>
          )}
        </div>
        {remaining > 0 && (
          <p className="text-xs text-muted-foreground">
            {remaining} other {remaining === 1 ? 'thing' : 'things'} waiting —{' '}
            <Link to="/checklists" className="text-primary hover:underline">
              see the list
            </Link>
            . One at a time is fine.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
