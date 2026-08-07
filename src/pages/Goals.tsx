import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useConsumedSearchParam, useScrollIntoView, DEEP_LINK_HIGHLIGHT } from '@/hooks/useDeepLink';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Bell, Lock, Loader2, Printer, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import GoalUpdateModal from '@/components/goals/GoalUpdateModal';
import GoalProgress from '@/components/goals/GoalProgress';
import GoalMonthTimeline from '@/components/goals/GoalMonthTimeline';
import ProgressRing from '@/components/ProgressRing';
import TargetProgress from '@/components/goals/TargetProgress';
import GoalStatusBadge from '@/components/goals/GoalStatusBadge';
import MyGoalCard from '@/components/goals/MyGoalCard';
import SetGoalCard from '@/components/goals/SetGoalCard';
import GoalsAnalytics from '@/components/goals/GoalsAnalytics';
import GoalsCsvImport from '@/components/goals/GoalsCsvImport';
import TeamGoalCard from '@/components/goals/TeamGoalCard';
import GoalsPrintSheet, { type GoalsReportRow } from '@/components/goals/GoalsPrintSheet';
import BrandPrintStyle from '@/components/BrandPrintStyle';
import { useOrgBranding } from '@/hooks/useOrgBranding';
import {
  currentMonth,
  monthElapsedFraction,
  monthLabel,
  useActiveTeam,
  useCreateGoal,
  useGoalEvents,
  useGoalsMonth,
  useLinkReplacement,
  type Goal,
  type GoalTask,
  type GoalUpdate,
} from '@/hooks/useGoals';

export default function Goals() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const month = currentMonth();
  const { data, isLoading } = useGoalsMonth(month);
  const { data: team } = useActiveTeam();
  const { data: branding } = useOrgBranding();
  const createGoal = useCreateGoal();
  const { data: goalEvents } = useGoalEvents(month);
  const linkReplacement = useLinkReplacement();

  const [meetingView, setMeetingView] = useState(false);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [privateFor, setPrivateFor] = useState('');
  const [privateTitle, setPrivateTitle] = useState('');
  const [privateDescription, setPrivateDescription] = useState('');
  const [updateGoal, setUpdateGoal] = useState<Goal | null>(null);
  // When a goal is archived, the next goal set becomes its replacement.
  const [pendingReplacement, setPendingReplacement] = useState<string | null>(null);

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const goals = data?.goals ?? [];
  const tasks = data?.tasks ?? [];
  const updates = data?.updates ?? [];

  const tasksFor = (goalId: string): GoalTask[] => tasks.filter(t => t.goal_id === goalId);
  const latestUpdate = (goalId: string): GoalUpdate | undefined =>
    updates.find(u => u.goal_id === goalId);

  const myGoals = useMemo(() => goals.filter(g => g.user_id === user?.id), [goals, user?.id]);
  const myTeamGoal = myGoals.find(g => g.visibility === 'team' && g.status === 'active');

  // A reminder about a goal (?goal=) or one of its steps (?task=) lands with
  // that goal card highlighted rather than leaving the reader to hunt.
  const linkedGoalId = useConsumedSearchParam('goal');
  const linkedTaskId = useConsumedSearchParam('task');
  const highlightGoalId = useMemo(() => {
    if (linkedGoalId) return linkedGoalId;
    if (linkedTaskId) return tasks.find(t => t.id === linkedTaskId)?.goal_id ?? null;
    return null;
  }, [linkedGoalId, linkedTaskId, tasks]);
  const highlightRef = useScrollIntoView<HTMLDivElement>(
    !!highlightGoalId && myGoals.some(g => g.id === highlightGoalId)
  );

  const nameOf = (userId: string) =>
    team?.find(t => t.user_id === userId)?.display_name ?? 'Team member';

  const submitPrivateGoal = async () => {
    if (!privateTitle.trim() || !privateFor) return;
    try {
      await createGoal.mutateAsync({
        title: privateTitle.trim(),
        description: privateDescription.trim() || undefined,
        month,
        visibility: 'private',
        forUserId: privateFor,
      });
      setPrivateOpen(false);
      setPrivateTitle('');
      setPrivateDescription('');
      setPrivateFor('');
      toast.success('Private goal saved.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the goal');
    }
  };

  // One row per active team member (me included), each with their shared
  // goal for the month, its plan, and the latest check-in — the report.
  const reportRows: GoalsReportRow[] = useMemo(() => {
    const members = team ?? [];
    return members.map(m => {
      const goal = goals.find(
        g => g.user_id === m.user_id && g.visibility === 'team' && g.status !== 'archived'
      );
      return {
        name: m.display_name,
        goal,
        tasks: goal ? tasks.filter(t => t.goal_id === goal.id) : [],
        latestUpdate: goal ? updates.find(u => u.goal_id === goal.id) : undefined,
      };
    });
  }, [team, goals, tasks, updates]);

  const myName = team?.find(t => t.user_id === user?.id)?.display_name;

  const printSheet = (
    <>
      <BrandPrintStyle branding={branding ?? { brandColor: '#53406e', brandTint: '#f3f0f8' }} />
      <GoalsPrintSheet
        month={month}
        rows={reportRows}
        branding={{
          displayName: branding?.displayName ?? '',
          legalName: branding?.legalName ?? '',
          logoUrl: branding?.logoUrl ?? '',
        }}
        preparedBy={myName}
      />
    </>
  );

  const printRoot =
    typeof document !== 'undefined'
      ? createPortal(<div className="goals-print-root">{printSheet}</div>, document.body)
      : null;

  if (isLoading) {
    return (
      <div className="goals-theme flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ---- Meeting view: what the team reads together ----
  if (meetingView) {
    const teamGoals = goals.filter(g => g.visibility === 'team');
    return (
      <div className="goals-theme mx-auto max-w-3xl space-y-6 p-4 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Team meeting — {monthLabel(month)}</h1>
            <p className="text-sm text-muted-foreground">Where everyone is with their goal.</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="mr-2 h-4 w-4" />
              Print report
            </Button>
            <Button variant="outline" onClick={() => setMeetingView(false)}>
              Back to Goals
            </Button>
          </div>
        </div>

        {teamGoals.length === 0 && (
          <p className="text-sm text-muted-foreground">No goals shared with the team yet.</p>
        )}

        {teamGoals.map(goal => {
          const t = tasksFor(goal.id);
          const u = latestUpdate(goal.id);
          return (
            <Card key={goal.id}>
              <CardHeader className="pb-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-base">{nameOf(goal.user_id)}</CardTitle>
                  {u && <GoalStatusBadge status={u.status} />}
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="break-words font-medium">{goal.title}</p>
                <div className="flex items-start gap-4">
                  <ProgressRing
                    done={t.filter(x => x.done).length}
                    total={t.length}
                    monthElapsed={monthElapsedFraction(goal.month)}
                    size={48}
                  />
                  <div className="min-w-0 flex-1">
                    <GoalMonthTimeline
                      month={goal.month}
                      done={t.filter(x => x.done).length}
                      total={t.length}
                    />
                  </div>
                </div>
                <GoalProgress
                  done={t.filter(x => x.done).length}
                  total={t.length}
                  monthElapsed={monthElapsedFraction(goal.month)}
                />
                <TargetProgress
                  target={goal.smart_target}
                  done={t.filter(x => x.done).length}
                  total={t.length}
                />
                {u ? (
                  <p className="whitespace-pre-wrap text-sm">{u.content}</p>
                ) : (
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground/70">
                    No update yet
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
        {printRoot}
      </div>
    );
  }

  // ---- Main page ----
  return (
    <div className="goals-theme mx-auto max-w-5xl space-y-8 p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Goals</h1>
          <p className="text-sm text-muted-foreground">
            One thing each of us is working on this month — {monthLabel(month)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {isManager && (
            <>
              <Button variant="ghost" size="sm" onClick={() => setPrivateOpen(true)}>
                <Lock className="mr-2 h-4 w-4" />
                Private goal with a member
              </Button>
              <GoalsCsvImport />
            </>
          )}
          <Button asChild variant="ghost" size="sm">
            <Link to="/settings/reminders">
              <Bell className="mr-2 h-4 w-4" />
              Reminder settings
            </Link>
          </Button>
          <Button variant="ghost" size="sm" onClick={() => window.print()}>
            <Printer className="mr-2 h-4 w-4" />
            Print report
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setMeetingView(true)}>
            <Users className="mr-2 h-4 w-4" />
            Meeting view
          </Button>
        </div>
      </header>

      {!myTeamGoal && (
        <SetGoalCard
          month={month}
          onCreated={title => {
            if (!pendingReplacement) return;
            linkReplacement.mutate({ eventId: pendingReplacement, newTitle: title });
            setPendingReplacement(null);
          }}
        />
      )}

      {myGoals.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">My goals</h2>
          {myGoals.map(goal => (
            <div
              key={goal.id}
              ref={goal.id === highlightGoalId ? highlightRef : undefined}
              className={goal.id === highlightGoalId ? `rounded-xl ${DEEP_LINK_HIGHLIGHT}` : undefined}
            >
              <MyGoalCard
                goal={goal}
                tasks={tasksFor(goal.id)}
                latestUpdate={latestUpdate(goal.id)}
                onShareUpdate={() => setUpdateGoal(goal)}
                events={(goalEvents ?? []).filter(ev => ev.goal_id === goal.id)}
                onArchived={setPendingReplacement}
              />
            </div>
          ))}
        </section>
      )}

      <GoalsAnalytics />

      <section className="space-y-4">
        <h2 className="text-lg font-semibold">The team this month</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(team ?? []).map(member => {
            const goal = goals.find(
              g => g.user_id === member.user_id && g.visibility === 'team' && g.status !== 'archived'
            );
            return (
              <TeamGoalCard
                key={member.id}
                name={member.display_name}
                goal={goal}
                tasks={goal ? tasksFor(goal.id) : []}
                latestUpdate={goal ? latestUpdate(goal.id) : undefined}
              />
            );
          })}
        </div>
      </section>

      {updateGoal && (
        <GoalUpdateModal
          goal={updateGoal}
          open={!!updateGoal}
          onOpenChange={open => !open && setUpdateGoal(null)}
        />
      )}

      {/* Manager: private goal set with a member */}
      <Dialog open={privateOpen} onOpenChange={setPrivateOpen}>
        <DialogContent className="goals-theme">
          <DialogHeader>
            <DialogTitle>Private goal with a team member</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Only that person and the managers can see this. It never appears in the team grid or
              meeting view.
            </p>
            <div className="space-y-1.5">
              <Label>Team member</Label>
              <Select value={privateFor} onValueChange={setPrivateFor}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a team member" />
                </SelectTrigger>
                <SelectContent>
                  {(team ?? []).map(m => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      {m.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="private-title">Goal</Label>
              <Input
                id="private-title"
                value={privateTitle}
                onChange={e => setPrivateTitle(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="private-description">Notes (optional)</Label>
              <Textarea
                id="private-description"
                rows={3}
                value={privateDescription}
                onChange={e => setPrivateDescription(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPrivateOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={submitPrivateGoal}
                disabled={!privateTitle.trim() || !privateFor || createGoal.isPending}
              >
                Save goal
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden print copy, portaled outside #root so print CSS shows only it. */}
      {printRoot}
    </div>
  );
}
