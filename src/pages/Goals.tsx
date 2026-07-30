import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Lock, Loader2, Target, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import PathfinderPanel from '@/components/goals/PathfinderPanel';
import GoalUpdateModal from '@/components/goals/GoalUpdateModal';
import {
  currentMonth,
  monthLabel,
  useActiveTeam,
  useCreateGoal,
  useGoalsMonth,
  useToggleGoalTask,
  UPDATE_STATUS_LABELS,
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
  const toggleTask = useToggleGoalTask();

  const [meetingView, setMeetingView] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
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

  const submitOwnGoal = async () => {
    if (!title.trim()) return;
    try {
      await createGoal.mutateAsync({
        title: title.trim(),
        description: description.trim() || undefined,
        month,
        visibility: isPrivate ? 'private' : 'team',
      });
      setTitle('');
      setDescription('');
      setIsPrivate(false);
      toast.success('Goal set — good luck this month.');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your goal');
    }
  };

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
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ---- Meeting view: what the team reads together ----
  if (meetingView) {
    const teamGoals = goals.filter(g => g.visibility === 'team');
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
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
                  {u && <Badge variant="secondary">{UPDATE_STATUS_LABELS[u.status]}</Badge>}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="font-medium">{goal.title}</p>
                <p className="text-sm text-muted-foreground">
                  {t.filter(x => x.done).length} of {t.length} steps done
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {u?.content ?? 'No update shared yet.'}
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    );
  }

  // ---- Main page ----
  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8 space-y-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Goals</h1>
          <p className="text-sm text-muted-foreground">
            One thing each of us is working on this month — {monthLabel(month)}.
          </p>
        </div>
        <div className="flex gap-2">
          {isManager && (
            <Button variant="outline" onClick={() => setPrivateOpen(true)}>
              <Lock className="mr-2 h-4 w-4" />
              Private goal with a member
            </Button>
          )}
          <Button variant="outline" onClick={() => setMeetingView(true)}>
            <Users className="mr-2 h-4 w-4" />
            Meeting view
          </Button>
        </div>
      </header>

      {/* Set my goal */}
      {!myTeamGoal && (
        <Card className="border-primary/40">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Target className="h-4 w-4 text-primary" />
              What are you working on this month?
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Pick something you'd like to get better at. The whole team will see this at the next
              team meeting.
            </p>
            <div className="space-y-1.5">
              <Label htmlFor="goal-title">Goal</Label>
              <Input
                id="goal-title"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="e.g. Get faster and more confident at scheduling follow-ups"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="goal-description">Why it matters (optional)</Label>
              <Textarea
                id="goal-description"
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch id="goal-private" checked={isPrivate} onCheckedChange={setIsPrivate} />
              <Label htmlFor="goal-private" className="text-sm text-muted-foreground">
                Keep this one private (just me and the managers)
              </Label>
            </div>
            <Button
              onClick={submitOwnGoal}
              disabled={!title.trim() || createGoal.isPending || !createGoal.isReady}
            >
              {createGoal.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Set my goal
            </Button>
          </CardContent>
        </Card>
      )}

      {/* My goals */}
      {myGoals.length > 0 && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">My goals</h2>
          {myGoals.map(goal => {
            const t = tasksFor(goal.id);
            const u = latestUpdate(goal.id);
            return (
              <Card key={goal.id}>
                <CardHeader className="pb-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CardTitle className="text-base">{goal.title}</CardTitle>
                    <div className="flex items-center gap-2">
                      {goal.visibility === 'private' && (
                        <Badge variant="outline" className="gap-1">
                          <Lock className="h-3 w-3" /> Private
                        </Badge>
                      )}
                      {u && <Badge variant="secondary">{UPDATE_STATUS_LABELS[u.status]}</Badge>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {goal.description && (
                    <p className="text-sm text-muted-foreground">{goal.description}</p>
                  )}

                  {t.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm text-muted-foreground">
                        {t.filter(x => x.done).length} of {t.length} steps done
                      </p>
                      {t.map(task => (
                        <label key={task.id} className="flex items-start gap-2 text-sm">
                          <Checkbox
                            checked={task.done}
                            onCheckedChange={v =>
                              toggleTask.mutate({ id: task.id, done: v === true })
                            }
                          />
                          <span className={task.done ? 'line-through text-muted-foreground' : ''}>
                            {task.title}
                            {task.due_date && (
                              <span className="ml-2 text-xs text-muted-foreground">
                                {task.due_date}
                              </span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  )}

                  <PathfinderPanel goal={goal} onDone={() => undefined} />

                  <Button variant="outline" size="sm" onClick={() => setUpdateGoal(goal)}>
                    Share an update
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {/* Team grid */}
      <section className="space-y-4">
        <h2 className="text-lg font-semibold">The team this month</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {(team ?? []).map(member => {
            const goal = goals.find(
              g => g.user_id === member.user_id && g.visibility === 'team' && g.status !== 'archived'
            );
            const t = goal ? tasksFor(goal.id) : [];
            const u = goal ? latestUpdate(goal.id) : undefined;
            return (
              <Card key={member.id}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">{member.display_name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {goal ? (
                    <>
                      <p className="text-sm font-medium">{goal.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.filter(x => x.done).length} of {t.length} steps done
                      </p>
                      {u ? (
                        <p className="text-xs text-muted-foreground line-clamp-3">{u.content}</p>
                      ) : (
                        <p className="text-xs text-muted-foreground">No update yet.</p>
                      )}
                    </>
                  ) : (
                    <p className="text-sm text-muted-foreground">No goal set yet</p>
                  )}
                </CardContent>
              </Card>
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
        <DialogContent>
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
