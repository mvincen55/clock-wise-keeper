import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useCompleteStep, useOnboardingStatus } from '@/hooks/useOnboarding';

/**
 * The one task waiting at the top of Home the first time someone lands in the
 * app: set this month's goal. Onboarding deliberately doesn't ask for it —
 * this card does, and it disappears for good the moment any goal of theirs
 * exists (self-set, or a private one set with a manager), recorded in
 * member_onboarding.goal_done_at.
 */
export default function FirstGoalTaskCard() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { data: status, isReady } = useOnboardingStatus();
  const completeStep = useCompleteStep();

  // Only people who finished onboarding but have never closed out the
  // first-goal task. No progress row means onboarding predates tracking —
  // never nag those accounts.
  const taskOpen =
    isReady && !!status?.complete && !!status.progress && !status.progress.goal_done_at;

  // The 'goals' key prefix matters: creating a goal anywhere in the app
  // invalidates ['goals'], which refetches this and clears the card.
  const hasGoal = useQuery({
    queryKey: ['goals', 'first-goal-exists', ctx?.org_id, user?.id],
    enabled: taskOpen && !!ctx && !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goals')
        .select('id')
        .eq('org_id', ctx!.org_id)
        .eq('user_id', user!.id)
        .limit(1);
      if (error) throw error;
      return (data ?? []).length > 0;
    },
  });

  // The moment a goal exists, the task ticks itself off.
  useEffect(() => {
    if (taskOpen && hasGoal.data === true && !completeStep.isPending) {
      completeStep.mutate('goal');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskOpen, hasGoal.data]);

  // Render only once we know for sure there's no goal yet.
  if (!taskOpen || hasGoal.data !== false) return null;

  return (
    <div className="mx-auto w-full max-w-[1400px] px-4 pt-4 sm:px-6 md:px-8 md:pt-6">
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex flex-wrap items-center gap-4 p-4 sm:p-5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Target className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 basis-52">
            <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground">
              Your first task
            </p>
            <p className="mt-0.5 font-semibold">Set your goal for this month</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Pick one thing you want to get better at — keep it small and real. The team sees it
              at the next team meeting.
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link to="/goals">
              Set my goal
              <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
