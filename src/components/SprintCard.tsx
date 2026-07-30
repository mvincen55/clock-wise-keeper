import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { AddToMyListButton } from '@/components/copilot/AddToMyListButton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Gift, Plus, ShieldCheck, Sparkles, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOrgEmployees } from '@/hooks/useEmployees';
import SprintVerifyDialog from '@/components/SprintVerifyDialog';
import {
  useBumpSprint,
  useCancelSprint,
  useCreateSprint,
  useDismissSuggestion,
  useSprintSuggestion,
  useTeamGoals,
  type SprintDepartment,
  type SprintPeriod,
  type SprintScope,
  type SprintVerification,
  type TeamGoal,
} from '@/hooks/useTeamGoals';

import { getToday } from '@/lib/time-utils';

/** Days between two "YYYY-MM-DD" dates, Eastern calendar. */
function daysLeft(endsOn: string): number {
  return Math.round((Date.parse(`${endsOn}T12:00:00Z`) - Date.parse(`${getToday()}T12:00:00Z`)) / 86_400_000);
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function ProgressRing({ pct }: { pct: number }) {
  const r = 34;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90">
      <circle cx="40" cy="40" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        strokeWidth="8"
        strokeLinecap="round"
        className="stroke-primary transition-all duration-700 ease-out"
        strokeDasharray={c}
        strokeDashoffset={c - (Math.min(100, pct) / 100) * c}
      />
    </svg>
  );
}

function NewSprintDialog({
  open,
  onOpenChange,
  seed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seed?: string;
}) {
  const create = useCreateSprint();
  const { data: employees } = useOrgEmployees();
  const today = getToday();
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState('');
  const [target, setTarget] = useState('20');
  const [period, setPeriod] = useState<SprintPeriod>('month');
  const [reward, setReward] = useState('');
  const [scope, setScope] = useState<SprintScope>('team');
  const [department, setDepartment] = useState<SprintDepartment>('clinical');
  const [scopeUser, setScopeUser] = useState('');
  const [verification, setVerification] = useState<SprintVerification>('honor');

  const submit = async () => {
    if (!title.trim() || !metric.trim() || !reward.trim()) {
      toast.error('Give the sprint a name, something to count, and a reward.');
      return;
    }
    if (scope === 'individual' && !scopeUser) {
      toast.error('Pick who this one is for.');
      return;
    }
    const count = Math.max(1, Number(target) || 0);
    try {
      await create.mutateAsync({
        title: title.trim(),
        metric: metric.trim(),
        target_count: count,
        period,
        starts_on: today,
        ends_on: addDays(today, period === 'week' ? 6 : 29),
        reward: reward.trim(),
        scope,
        scope_department: scope === 'department' ? department : null,
        scope_user_id: scope === 'individual' ? scopeUser : null,
        verification,
        ai_suggested: !!seed,
      });
      toast.success('Sprint started — the office AI will announce it.');
      onOpenChange(false);
      setTitle(''); setMetric(''); setReward(''); setTarget('20');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Start a sprint</DialogTitle>
          <DialogDescription>
            One number, one reward. No rankings, no per-person tallies — the AI announces and runs it.
          </DialogDescription>
        </DialogHeader>
        {seed && (
          <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            {seed}
          </p>
        )}
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="sprint-title">Sprint</Label>
            <Input id="sprint-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Same-day reappointments" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sprint-metric">What are we counting?</Label>
            <Input id="sprint-metric" value={metric} onChange={e => setMetric(e.target.value)} placeholder="reappointments booked before the patient leaves" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sprint-target">Target</Label>
              <Input id="sprint-target" type="number" min={1} value={target} onChange={e => setTarget(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Length</Label>
              <Select value={period} onValueChange={v => setPeriod(v as SprintPeriod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="week">This week</SelectItem>
                  <SelectItem value="month">This month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Who's it for?</Label>
            <Select value={scope} onValueChange={v => setScope(v as SprintScope)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="team">The whole team</SelectItem>
                <SelectItem value="department">One department</SelectItem>
                <SelectItem value="individual">One person</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {scope === 'department' && (
            <div className="space-y-1.5">
              <Label>Department</Label>
              <Select value={department} onValueChange={v => setDepartment(v as SprintDepartment)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinical">Clinical</SelectItem>
                  <SelectItem value="clerical">Clerical</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {scope === 'individual' && (
            <div className="space-y-1.5">
              <Label>Team member</Label>
              <Select value={scopeUser} onValueChange={setScopeUser}>
                <SelectTrigger><SelectValue placeholder="Pick someone" /></SelectTrigger>
                <SelectContent>
                  {(employees ?? [])
                    .filter(e => !!e.user_id)
                    .map(e => (
                      <SelectItem key={e.id} value={e.user_id as string}>
                        {e.display_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>How does it get verified?</Label>
            <Select value={verification} onValueChange={v => setVerification(v as SprintVerification)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="honor">Honour — the tally speaks for itself</SelectItem>
                <SelectItem value="manager_approval">Manager confirms at the end</SelectItem>
                <SelectItem value="document">Checked against the outside report</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {verification === 'honor'
                ? 'Anyone in scope taps +1 as they go. Pizza-tier goals live here.'
                : verification === 'manager_approval'
                ? 'One tap from the manager (or the owner) closes it out.'
                : 'At the end the verifier uploads the report and the AI reads the number out of it.'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="sprint-reward">Reward if we hit it</Label>
            <Input id="sprint-reward" value={reward} onChange={e => setReward(e.target.value)} placeholder="Lunch on the practice, Friday" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={!create.isReady || create.isPending}>
            {create.isPending ? 'Starting…' : 'Start sprint'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function scopeLabel(sprint: TeamGoal) {
  if (sprint.scope === 'department') {
    return sprint.scope_department === 'clerical' ? 'Clerical team' : 'Clinical team';
  }
  if (sprint.scope === 'individual') return 'Personal sprint';
  return 'Whole team';
}

/** The sprint card — everyone in scope sees it, and the AI runs it end to end. */
export default function SprintCard() {
  const { data: ctx } = useOrgContext();
  const { data } = useTeamGoals();
  const { data: suggestion } = useSprintSuggestion();
  const bump = useBumpSprint();
  const cancel = useCancelSprint();
  const dismiss = useDismissSuggestion();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);

  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const sprint = data?.active ?? null;

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
        <NewSprintDialog open={dialogOpen} onOpenChange={setDialogOpen} seed={suggestion?.content} />
      </>
    );
  }

  const pct = Math.round((sprint.progress / Math.max(1, sprint.target_count)) * 100);
  const left = daysLeft(sprint.ends_on);
  const pending = sprint.status === 'pending_verification';
  const canTally = sprint.verification === 'honor' && !pending;

  return (
    <>
      <Card className="card-elevated overflow-hidden">
        <CardContent className="p-4">
          <div className="flex items-start gap-4">
            <div className="relative">
              <ProgressRing pct={pct} />
              <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums">
                {sprint.progress}/{sprint.target_count}
              </span>
            </div>
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
