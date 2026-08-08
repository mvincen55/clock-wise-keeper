import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertTriangle, ArrowLeft, Loader2, Pencil, Shuffle, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useOrgEmployees } from '@/hooks/useEmployees';
import { useOperationalRoles } from '@/hooks/useOperationalRoles';
import {
  useCreateSprint,
  type SprintDepartment,
  type SprintPeriod,
  type SprintScope,
  type SprintVerification,
} from '@/hooks/useTeamGoals';
import {
  SPRINT_ROLE_LABELS,
  useRewardIdeas,
  useSprintIdeas,
  type SprintAudience,
  type SprintConcern,
  type SprintIdea,
  type SprintIdeasResult,
} from '@/hooks/useSprintIdeas';
import { getToday, shiftDate } from '@/lib/time-utils';
import type { OperationalRole } from '@/lib/schedule-reader/types';

// The Intelligent Sprint Builder. Position first, then either the architect's
// grounded suggestions or the manual form the office already knows. The AI
// suggests and explains; the manager edits everything and decides.

type AudienceValue =
  | 'team'
  | 'individual'
  | `role:${string}`
  | 'department:clinical'
  | 'department:clerical';

function parseAudience(value: AudienceValue): {
  scope: SprintScope;
  scopeRole: string | null;
  department: SprintDepartment | null;
} {
  if (value.startsWith('role:')) return { scope: 'role', scopeRole: value.slice(5), department: null };
  if (value.startsWith('department:')) {
    return { scope: 'department', scopeRole: null, department: value.slice(11) as SprintDepartment };
  }
  return { scope: value as SprintScope, scopeRole: null, department: null };
}

const CONCERN_DIRECTION_PREFIX = 'Build a careful, policy-respecting sprint that supports this: ';

export default function SprintBuilderDialog({
  open,
  onOpenChange,
  seed,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  seed?: string;
}) {
  const create = useCreateSprint();
  const ideasApi = useSprintIdeas();
  const rewardsApi = useRewardIdeas();
  const { data: employees } = useOrgEmployees();
  const { data: rolesByEmployee } = useOperationalRoles();

  const [view, setView] = useState<'ideas' | 'form'>('ideas');
  const [audienceValue, setAudienceValue] = useState<AudienceValue>('team');
  const [scopeUser, setScopeUser] = useState('');
  const [direction, setDirection] = useState('');
  const [result, setResult] = useState<SprintIdeasResult | null>(null);
  const [shownTitles, setShownTitles] = useState<string[]>([]);
  const [concernOpen, setConcernOpen] = useState(false);
  const [concernDismissed, setConcernDismissed] = useState(false);

  // Form fields (populated by "Use this sprint" or typed by hand).
  const [title, setTitle] = useState('');
  const [metric, setMetric] = useState('');
  const [target, setTarget] = useState('20');
  const [period, setPeriod] = useState<SprintPeriod>('month');
  const [reward, setReward] = useState('');
  const [verification, setVerification] = useState<SprintVerification>('honor');
  const [category, setCategory] = useState<string | null>(null);
  const [fromIdea, setFromIdea] = useState(false);
  const [rewardIdeas, setRewardIdeas] = useState<string[]>([]);

  const audience = parseAudience(audienceValue);

  // Positions: the core dental-office roles are always offered, and any role
  // someone in this office actually holds joins them with a head count. An
  // office that hasn't configured roles yet still gets the standard choices.
  const positionOptions = useMemo(() => {
    const counts = new Map<OperationalRole, number>();
    for (const roles of rolesByEmployee?.values() ?? []) {
      const seen = new Set<OperationalRole>();
      for (const r of roles) {
        if (!seen.has(r.operational_role)) {
          seen.add(r.operational_role);
          counts.set(r.operational_role, (counts.get(r.operational_role) ?? 0) + 1);
        }
      }
    }
    const core: OperationalRole[] = ['front_desk', 'hygienist', 'dental_assistant', 'dentist', 'office_manager'];
    const extras = [...counts.keys()].filter(r => !core.includes(r));
    return [...core, ...extras].map(role => ({ role, count: counts.get(role) ?? 0 }));
  }, [rolesByEmployee]);

  const audienceApi: SprintAudience = {
    scope: audience.scope,
    scope_role: audience.scopeRole,
    scope_department: audience.department,
  };

  const generate = async (opts?: { direction?: string; shuffle?: boolean }) => {
    try {
      const alreadyShown = opts?.shuffle ? shownTitles : [];
      const res = await ideasApi.mutateAsync({
        audience: audienceApi,
        direction: opts?.direction ?? direction,
        exclude: alreadyShown,
      });
      // The server already drops echoes of shown titles; this is the belt to
      // its braces so a shuffle never silently re-displays the same cards.
      const seen = new Set(alreadyShown.map(t => t.toLowerCase()));
      const fresh = res.suggestions.filter(s => !seen.has(s.title.toLowerCase()));
      if (opts?.shuffle && fresh.length === 0) {
        toast.info('No different angles this time — try adding a direction above, or shuffle again.');
        return; // keep the cards already on screen
      }
      setResult({ ...res, suggestions: fresh });
      setShownTitles([...new Set([...alreadyShown, ...fresh.map(s => s.title)])]);
      setConcernDismissed(false);
      setConcernOpen(false);
      if (fresh.length === 0) {
        toast.info('Nothing worth suggesting right now — the office data may be thin. You can still create your own.');
      }
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const applyIdea = (idea: SprintIdea) => {
    setTitle(idea.title);
    setMetric(idea.metric);
    setTarget(String(idea.target));
    setPeriod(idea.period);
    setReward(idea.reward);
    setVerification(idea.verification);
    setCategory(idea.category);
    setFromIdea(true);
    setRewardIdeas([]);
    setView('form');
  };

  const startBlank = () => {
    setFromIdea(false);
    setCategory(null);
    setRewardIdeas([]);
    setView('form');
  };

  const fetchRewardIdeas = async () => {
    try {
      const ideas = await rewardsApi.mutateAsync({ audience: audienceApi, sprintTitle: title });
      setRewardIdeas(ideas);
      if (ideas.length === 0) toast.info('No reward ideas right now.');
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const resetAll = () => {
    setView('ideas');
    setAudienceValue('team');
    setScopeUser('');
    setDirection('');
    setResult(null);
    setShownTitles([]);
    setConcernOpen(false);
    setConcernDismissed(false);
    setTitle(''); setMetric(''); setTarget('20'); setPeriod('month');
    setReward(''); setVerification('honor'); setCategory(null);
    setFromIdea(false); setRewardIdeas([]);
  };

  const submit = async () => {
    if (!title.trim() || !metric.trim() || !reward.trim()) {
      toast.error('Give the sprint a name, something to count, and a reward.');
      return;
    }
    if (audience.scope === 'individual' && !scopeUser) {
      toast.error('Pick who this one is for.');
      return;
    }
    const today = getToday();
    const count = Math.max(1, Number(target) || 0);
    try {
      await create.mutateAsync({
        title: title.trim(),
        metric: metric.trim(),
        target_count: count,
        period,
        starts_on: today,
        ends_on: shiftDate(today, period === 'week' ? 6 : 29),
        reward: reward.trim(),
        scope: audience.scope,
        scope_department: audience.department,
        scope_user_id: audience.scope === 'individual' ? scopeUser : null,
        scope_role: audience.scopeRole,
        category,
        verification,
        ai_suggested: fromIdea || !!seed,
      });
      toast.success('Sprint started — the office AI will announce it.');
      onOpenChange(false);
      resetAll();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const audienceSelect = (
    <div className="space-y-1.5">
      <Label>Who do you want to challenge?</Label>
      <Select
        value={audienceValue}
        onValueChange={v => { setAudienceValue(v as AudienceValue); setResult(null); setShownTitles([]); }}
      >
        <SelectTrigger><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="team">Whole team</SelectItem>
          {positionOptions.map(({ role, count }) => (
            <SelectItem key={role} value={`role:${role}`}>
              {SPRINT_ROLE_LABELS[role] ?? role}{count > 0 ? ` (${count})` : ''}
            </SelectItem>
          ))}
          <SelectItem value="department:clinical">Clinical team</SelectItem>
          <SelectItem value="department:clerical">Clerical team</SelectItem>
          <SelectItem value="individual">One person</SelectItem>
        </SelectContent>
      </Select>
      {audience.scope === 'individual' && (
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
      )}
    </div>
  );

  const concern: SprintConcern | null = result?.concern ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        {view === 'ideas' ? (
          <>
            <DialogHeader>
              <DialogTitle>Start a sprint</DialogTitle>
              <DialogDescription>
                One number, one reward. Pick who it's for and the office AI will suggest sprints
                grounded in what's actually happening here.
              </DialogDescription>
            </DialogHeader>
            {seed && (
              <p className="rounded-md border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                {seed}
              </p>
            )}
            <div className="space-y-3">
              {audienceSelect}
              <div className="space-y-1.5">
                <Label htmlFor="sprint-direction">Anything you want to work on? <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Input
                  id="sprint-direction"
                  value={direction}
                  onChange={e => setDirection(e.target.value)}
                  placeholder="Example: cancellations, communication, schedule openings..."
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  onClick={() => generate()}
                  disabled={!ideasApi.isReady || ideasApi.isPending || (audience.scope === 'individual' && !scopeUser)}
                >
                  {ideasApi.isPending
                    ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Thinking…</>
                    : <><Sparkles className="mr-2 h-4 w-4" />Give me sprint ideas</>}
                </Button>
                <Button size="sm" variant="outline" onClick={startBlank}>
                  <Pencil className="mr-2 h-4 w-4" />Create my own
                </Button>
              </div>

              {concern && !concernDismissed && (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3 space-y-2">
                  <p className="text-sm font-medium flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                    <span>The office AI noticed something</span>
                  </p>
                  <p className="text-sm text-muted-foreground">{concern.headline}</p>
                  {concernOpen && (
                    <div className="space-y-1.5">
                      {concern.detail && <p className="text-sm text-muted-foreground">{concern.detail}</p>}
                      {concern.receipts.map((r, i) => (
                        <p key={i} className="text-xs text-muted-foreground border-l-2 border-warning/40 pl-2">{r}</p>
                      ))}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => setConcernOpen(v => !v)}>
                      {concernOpen ? 'Hide detail' : 'Review the issue'}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={ideasApi.isPending}
                      onClick={() => {
                        const focus = `${CONCERN_DIRECTION_PREFIX}${concern.headline}`;
                        setDirection(focus);
                        generate({ direction: focus });
                      }}
                    >
                      Build a sprint around it
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConcernDismissed(true)}>
                      Not now
                    </Button>
                  </div>
                </div>
              )}

              {result && result.suggestions.length > 0 && (
                <div className="space-y-2">
                  {result.suggestions.map((idea, i) => (
                    <div key={`${idea.title}-${i}`} className="rounded-md border p-3 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold">{idea.title}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {idea.period === 'week' ? 'This week' : 'This month'}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">Target {idea.target}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{idea.goal}</p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">What counts:</span> {idea.metric}
                      </p>
                      {idea.why && (
                        <p className="text-xs text-muted-foreground flex gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary mt-px" />
                          <span>{idea.why}</span>
                        </p>
                      )}
                      <div className="pt-1">
                        <Button size="sm" onClick={() => applyIdea(idea)}>Use this sprint</Button>
                      </div>
                    </div>
                  ))}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => generate({ shuffle: true })}
                    disabled={ideasApi.isPending}
                  >
                    {ideasApi.isPending
                      ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Thinking…</>
                      : <><Shuffle className="mr-2 h-4 w-4" />Show me different ideas</>}
                  </Button>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                <button
                  type="button"
                  onClick={() => setView('ideas')}
                  className="mr-2 inline-flex items-center text-muted-foreground hover:text-foreground align-middle"
                  aria-label="Back to ideas"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {fromIdea ? 'Review your sprint' : 'Create your own sprint'}
              </DialogTitle>
              <DialogDescription>
                {fromIdea
                  ? 'Everything below is editable — the AI filled it in, you decide.'
                  : 'One number, one reward. No rankings, no per-person tallies — the AI announces and runs it.'}
              </DialogDescription>
            </DialogHeader>
            {seed && !fromIdea && (
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
              {audienceSelect}
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
                <div className="flex items-center justify-between">
                  <Label htmlFor="sprint-reward">Reward if we hit it</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs text-muted-foreground"
                    onClick={fetchRewardIdeas}
                    disabled={rewardsApi.isPending}
                  >
                    {rewardsApi.isPending
                      ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />
                      : <Sparkles className="mr-1 h-3.5 w-3.5" />}
                    Reward ideas
                  </Button>
                </div>
                <Input id="sprint-reward" value={reward} onChange={e => setReward(e.target.value)} placeholder="Lunch on the practice, Friday" />
                {rewardIdeas.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {rewardIdeas.map((r, i) => (
                      <button
                        key={`${r}-${i}`}
                        type="button"
                        onClick={() => setReward(r)}
                        className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={!create.isReady || create.isPending}>
                {create.isPending ? 'Starting…' : 'Start sprint'}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
