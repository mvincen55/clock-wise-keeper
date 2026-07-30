import { useMemo, useState } from 'react';
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
import { Lock, Loader2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import GoalUpdateModal from '@/components/goals/GoalUpdateModal';
import GoalProgress from '@/components/goals/GoalProgress';
import GoalStatusBadge from '@/components/goals/GoalStatusBadge';
import MyGoalCard from '@/components/goals/MyGoalCard';
import SetGoalCard from '@/components/goals/SetGoalCard';
import TeamGoalCard from '@/components/goals/TeamGoalCard';
import {
  currentMonth,
  monthElapsedFraction,
  monthLabel,
  useActiveTeam,
  useCreateGoal,
  useGoalsMonth,
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
  const createGoal = useCreateGoal();

  const [meetingView, setMeetingView] = useState(false);
  const [privateOpen, setPrivateOpen] = useState(false);
  const [privateFor, setPrivateFor] = useState('');
  const [privateTitle, setPrivateTitle] = useState('');
  const [privateDescription, setPrivateDescription] = useState('');
  const [updateGoal, setUpdateGoal] = useState<Goal | null>(null);

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const goals = data?.goals ?? [];
  const tasks = data?.tasks ?? [];
  const updates = data?.updates ?? [];

  const tasksFor = (goalId: string): GoalTask[] => tasks.filter(t => t.goal_id === goalId);
  const latestUpdate = (goalId: string): GoalUpdate | undefined =>
    updates.find(u => u.goal_id === goalId);

  const myGoals = useMemo(() => goals.filter(g => g.user_id === user?.id), [goals, user?.id]);
  const myTeamGoal = myGoals.find(g => g.visibility === 'team' && g.status === 'active');

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
          <Button variant="outline" onClick={() => setMeetingView(false)}>
            Back to Goals
          </Button>
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
                {goal.smart_target && (
                  <p className="text-xs text-muted-foreground">Target: {goal.smart_target}</p>
                )}
                <GoalProgress
                  done={t.filter(x => x.done).length}
                  total={t.length}
                  monthElapsed={monthElapsedFraction(goal.month)}
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
            <Button variant="ghost" size="sm" onClick={() => setPrivateOpen(true)}>
              <Lock className="mr-2 h-4 w-4" />
              Private goal with a member
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={() => setMeetingView(true)}>
            <Users className="mr-2 h-4 w-4" />
            Meeting view
          </Button>
        </div>
      </header>

      {!myTeamGoal && <SetGoalCard month={month} />}

      {myGoals.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">My goals</h2>
          {myGoals.map(goal => (
            <MyGoalCard
              key={goal.id}
              goal={goal}
              tasks={tasksFor(goal.id)}
              latestUpdate={latestUpdate(goal.id)}
              onShareUpdate={() => setUpdateGoal(goal)}
            />
          ))}
        </section>
      )}

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
    </div>
  );
}
