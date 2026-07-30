import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ShieldCheck } from 'lucide-react';
import { PASS_MARK, type AttemptSummary, type TrainingModule } from '@/hooks/useTraining';

type Props = {
  modules: TrainingModule[];
  attempts: AttemptSummary[];
  nameFor: (userId: string) => string;
};

type Tally = { attempts: number; passed: number; failed: number; best: number | null };

const emptyTally = (): Tally => ({ attempts: 0, passed: 0, failed: 0, best: null });

function add(t: Tally, a: AttemptSummary): Tally {
  return {
    attempts: t.attempts + 1,
    passed: t.passed + (a.passed ? 1 : 0),
    failed: t.failed + (a.passed ? 0 : 1),
    best: t.best === null ? a.score : Math.max(t.best, a.score),
  };
}

function TallyRow({ label, tally }: { label: string; tally: Tally }) {
  const rate = tally.attempts ? Math.round((tally.passed / tally.attempts) * 100) : 0;
  return (
    <div className="space-y-1.5 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-center gap-1.5">
          <Badge variant="outline" className="text-success">
            {tally.passed} passed
          </Badge>
          <Badge variant="outline" className={tally.failed ? 'text-warning' : ''}>
            {tally.failed} not yet
          </Badge>
        </div>
      </div>
      <Progress value={rate} className="h-1.5" />
      <p className="text-xs text-muted-foreground">
        {tally.attempts} {tally.attempts === 1 ? 'attempt' : 'attempts'} · {rate}% pass rate
        {tally.best !== null && ` · best score ${tally.best}%`}
      </p>
    </div>
  );
}

/**
 * Manager view of roleplay outcomes. Scores and pass/fail only — transcripts,
 * quiz answers, and coaching feedback stay private to the trainee.
 */
export default function TrainingStatusDashboard({ modules, attempts, nameFor }: Props) {
  const roleplay = useMemo(() => attempts.filter(a => a.type === 'roleplay'), [attempts]);

  const byModule = useMemo(() => {
    const map = new Map<string, Tally>();
    roleplay.forEach(a => map.set(a.module_id, add(map.get(a.module_id) ?? emptyTally(), a)));
    return [...map.entries()].sort((a, b) => b[1].attempts - a[1].attempts);
  }, [roleplay]);

  const byPerson = useMemo(() => {
    const map = new Map<string, Tally>();
    roleplay.forEach(a => map.set(a.user_id, add(map.get(a.user_id) ?? emptyTally(), a)));
    return [...map.entries()].sort((a, b) => b[1].attempts - a[1].attempts);
  }, [roleplay]);

  const totals = useMemo(
    () => roleplay.reduce((t, a) => add(t, a), emptyTally()),
    [roleplay]
  );

  if (roleplay.length === 0) {
    return (
      <Card>
        <CardContent className="p-10 text-center text-sm text-muted-foreground">
          No roleplay assessments yet. Once the team practices a conversation, pass and fail counts
          show up here.
        </CardContent>
      </Card>
    );
  }

  const titleFor = (id: string) => modules.find(m => m.id === id)?.title ?? 'a retired module';

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div>
            <p className="text-sm font-medium">
              {totals.passed} of {totals.attempts} roleplay attempts cleared {PASS_MARK}%
            </p>
            <p className="text-xs text-muted-foreground">
              Across {byModule.length} {byModule.length === 1 ? 'module' : 'modules'} and{' '}
              {byPerson.length} {byPerson.length === 1 ? 'person' : 'people'}.
            </p>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            Transcripts and answers stay private
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By module</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byModule.map(([moduleId, tally]) => (
              <TallyRow key={moduleId} label={titleFor(moduleId)} tally={tally} />
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">By team member</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {byPerson.map(([userId, tally]) => (
              <TallyRow key={userId} label={nameFor(userId)} tally={tally} />
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
