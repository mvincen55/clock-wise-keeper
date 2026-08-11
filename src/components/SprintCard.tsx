import { useState } from 'react';
import ProgressRing from '@/components/ProgressRing';
import { Card, CardContent } from '@/components/ui/card';
import { AddToMyListButton } from '@/components/copilot/AddToMyListButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Gift, Plus, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useMyPermissionGrants } from '@/hooks/useEmployeePermissions';
import { hasGrant } from '@/lib/permissions';
import SprintVerifyDialog from '@/components/SprintVerifyDialog';
import SprintBuilderDialog from '@/components/SprintBuilderDialog';
import { SPRINT_ROLE_LABELS } from '@/hooks/useSprintIdeas';
import {
  useBumpSprint,
  useCancelSprint,
  useDismissSuggestion,
  useSprintSuggestion,
  useTeamGoals,
  type TeamGoal,
} from '@/hooks/useTeamGoals';

import { daysBetween, getToday } from '@/lib/time-utils';
import { useScrollIntoView, DEEP_LINK_HIGHLIGHT } from '@/hooks/useDeepLink';

/** Days from today until an Eastern "YYYY-MM-DD" date. */
function daysLeft(endsOn: string): number {
  return daysBetween(getToday(), endsOn);
}

/** Days elapsed since an Eastern "YYYY-MM-DD" date. */
function daysSince(startsOn: string): number {
  return daysBetween(startsOn, getToday());
}

function scopeLabel(sprint: TeamGoal) {
  if (sprint.scope === 'department') {
    return sprint.scope_department === 'clerical' ? 'Clerical team' : 'Clinical team';
  }
  if (sprint.scope === 'role') {
    return SPRINT_ROLE_LABELS[sprint.scope_role ?? ''] ?? 'One position';
  }
  if (sprint.scope === 'individual') return 'Personal sprint';
  return 'Whole team';
}

/** The sprint card — everyone in scope sees it, and the AI runs it end to end. */
export default function SprintCard({ highlightId }: { highlightId?: string | null }) {
  const { data: ctx } = useOrgContext();
  const { data } = useTeamGoals();
  const { data: suggestion } = useSprintSuggestion();
  const bump = useBumpSprint();
  const cancel = useCancelSprint();
  const dismiss = useDismissSuggestion();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  // Sprint management opens to admins and to members holding the
  // manage_office_goals grant (team_goals RLS enforces the same rule).
  const grants = useMyPermissionGrants();
  const isManager =
    ctx?.role === 'owner' || ctx?.role === 'manager' || hasGrant(grants, 'manage_office_goals');
  const sprint = data?.active ?? null;
  // A sprint notification scrolls to the card; the ring appears when the
  // running sprint is the one the notification was about.
  const highlightRef = useScrollIntoView<HTMLDivElement>(sprint ? highlightId : false);
  const highlighted = !!sprint && !!highlightId && sprint.id === highlightId;

  // Nothing running and nothing to suggest: stay quiet for the team.
  if (!sprint && !suggestion && !isManager) return null;

  if (!sprint) {
    return (
      <>
        <Card className="card-elevated border-dashed">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Users className="h-4 w-4 text-primary" />
              Team sprint
            </div>
            {suggestion ? (
              <>
                <p className="text-sm text-muted-foreground flex gap-2">
                  <Sparkles className="h-4 w-4 shrink-0 text-primary mt-0.5" />
                  <span>{suggestion.content}</span>
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={() => setDialogOpen(true)}>Set it up</Button>
                  <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(suggestion.id)}>
                    Not now
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">
                  No sprint running. One shared number and a reward the whole team plays for.
                </p>
                <Button size="sm" variant="outline" onClick={() => setDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />Start a sprint
                </Button>
              </>
            )}
          </CardContent>
        </Card>
        <SprintBuilderDialog open={dialogOpen} onOpenChange={setDialogOpen} seed={suggestion?.content} />
      </>
    );
  }

  const left = daysLeft(sprint.ends_on);
  // Fraction of the sprint window already spent — drives the ring's "behind" amber.
  const totalDays = Math.max(1, daysLeft(sprint.ends_on) + daysSince(sprint.starts_on));
  const elapsed = Math.min(1, Math.max(0, daysSince(sprint.starts_on) / totalDays));
  const pending = sprint.status === 'pending_verification';
  const canTally = sprint.verification === 'honor' && !pending;

  return (
    <>
      <Card ref={highlightRef} className={`card-elevated overflow-hidden ${highlighted ? DEEP_LINK_HIGHLIGHT : ''}`}>
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <ProgressRing
              done={sprint.progress}
              total={sprint.target_count}
              monthElapsed={elapsed}
              size={80}
              stroke={8}
            />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-sm font-semibold truncate">{sprint.title}</span>
                <Badge variant="outline" className="text-[10px]">{scopeLabel(sprint)}</Badge>
                {sprint.ai_suggested && <Badge variant="secondary" className="text-[10px]">AI idea</Badge>}
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">{sprint.metric}</p>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
                <Gift className="h-3.5 w-3.5 text-primary" />
                {sprint.reward}
                <span className="mx-1">·</span>
                {pending
                  ? 'waiting on verification'
                  : left > 0
                  ? `${left} day${left === 1 ? '' : 's'} left`
                  : left === 0
                  ? 'last day'
                  : 'wrapping up'}
              </p>
              {sprint.verification !== 'honor' && !pending && (
                <p className="text-xs text-muted-foreground">
                  {sprint.verification === 'document'
                    ? 'Verified at the end against the outside report.'
                    : 'A manager confirms this one at the end.'}
                </p>
              )}
              <div className="flex gap-2 pt-1">
                {canTally && (
                  <Button
                    size="sm"
                    onClick={() =>
                      bump.mutate(
                        { id: sprint.id },
                        { onSuccess: () => toast.success('Counted — thanks.') },
                      )
                    }
                    disabled={!bump.isReady || bump.isPending}
                  >
                    <Plus className="mr-1 h-4 w-4" />1
                  </Button>
                )}
                {!pending && (
                  <AddToMyListButton
                    surface="sprint"
                    title={`Sprint step: ${sprint.title}`}
                    firstStep={sprint.metric}
                    label="Add a step to my list"
                    variant="ghost"
                  />
                )}
                {isManager && pending && (
                  <Button size="sm" onClick={() => setVerifyOpen(true)}>
                    <ShieldCheck className="mr-1 h-4 w-4" />Verify
                  </Button>
                )}
                {isManager && (
                  <Button size="sm" variant="ghost" onClick={() => cancel.mutate(sprint.id)}>
                    <X className="mr-1 h-4 w-4" />Cancel
                  </Button>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
      {isManager && (
        <SprintVerifyDialog sprint={sprint} open={verifyOpen} onOpenChange={setVerifyOpen} />
      )}
    </>
  );

}
