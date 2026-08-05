import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Cake, Check, Loader2, PenLine, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import PrivacyTermsBody from '@/components/onboarding/PrivacyTermsBody';
import RankQuestion from '@/components/onboarding/RankQuestion';
import SetGoalCard from '@/components/goals/SetGoalCard';
import { PRIVACY_TERMS_ACKNOWLEDGMENT } from '@/lib/privacy-terms';
import {
  FAVORITE_QUESTIONS,
  rankingToAnswer,
  WORK_STYLE_QUESTIONS,
} from '@/lib/work-style-questions';

import { currentMonth, useGoalsMonth } from '@/hooks/useGoals';
import {
  freeTag,
  suggestTag,
  TAG_PATTERN,
  useCompleteStep,
  useOnboardingStatus,
  useSaveBasics,
  useSaveWorkStyle,
  useSignTerms,
  useTagRegistry,
} from '@/hooks/useOnboarding';

const STEPS = ['Privacy', 'About you', 'Basics', 'First goal'] as const;

/**
 * The flow a new member completes after accepting their invite. Four screens,
 * in order, and the app stays closed until the last one is done.
 * (Their operational role isn't asked here — the inviting owner/manager
 * already answered that on the invite.)
 */
export default function Onboarding() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const { data: status, isReady } = useOnboardingStatus();

  const [step, setStep] = useState(0);

  // Land on the first thing that still needs doing.
  useEffect(() => {
    if (!status) return;
    if (!status.termsSigned) setStep(0);
    else if (!status.progress?.work_style_done_at) setStep(1);
    else if (!status.progress?.basics_done_at) setStep(2);
    else setStep(3);
  }, [status]);

  if (isReady && status?.complete) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <header className="space-y-2 text-center">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Welcome to {ctx?.org_name ?? 'the office'}
          </p>
          <h1 className="text-2xl font-bold">Let's get you set up</h1>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            {STEPS.map((label, i) => (
              <Badge
                key={label}
                variant={i === step ? 'default' : i < step ? 'secondary' : 'outline'}
                className="text-[11px]"
              >
                {i < step && <Check className="mr-1 h-3 w-3" />}
                {label}
              </Badge>
            ))}
          </div>
        </header>

        {!isReady ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : step === 0 ? (
          <TermsStep onDone={() => setStep(1)} />
        ) : step === 1 ? (
          <WorkStyleStep onDone={() => setStep(2)} />
        ) : step === 2 ? (
          <BasicsStep onDone={() => setStep(3)} />
        ) : (
          <GoalStep onDone={() => navigate('/', { replace: true })} />
        )}

        {user && (
          <p className="text-center text-xs text-muted-foreground">
            Signed in as {user.email}
          </p>
        )}
      </div>
    </div>
  );
}

function TermsStep({ onDone }: { onDone: () => void }) {
  const sign = useSignTerms();
  const [name, setName] = useState('');

  const submit = async () => {
    if (name.trim().length < 3) {
      toast.error('Please type your full name to sign.');
      return;
    }
    try {
      await sign.mutateAsync(name);
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your signature');
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="text-lg">Your privacy, in plain language</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-5">
        <PrivacyTermsBody />

        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <Label htmlFor="signed-name" className="flex items-center gap-2 text-sm font-medium">
            <PenLine className="h-4 w-4 text-primary" />
            {PRIVACY_TERMS_ACKNOWLEDGMENT}
          </Label>
          <Input
            id="signed-name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Type your full name"
            autoComplete="name"
            maxLength={120}
          />
          <p className="text-xs text-muted-foreground">
            Typing your name signs this. You can read it again any time from Settings.
          </p>
        </div>

        <Button onClick={submit} disabled={sign.isPending || !sign.isReady} className="w-full">
          {sign.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Sign and continue
        </Button>
      </CardContent>
    </Card>
  );
}

function WorkStyleStep({ onDone }: { onDone: () => void }) {
  const save = useSaveWorkStyle();
  const [orders, setOrders] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(WORK_STYLE_QUESTIONS.map(q => [q.id, q.options.map(o => o.value)])),
  );
  const [favorites, setFavorites] = useState<Record<string, string>>({});

  const submit = async () => {
    try {
      const answers = Object.fromEntries(
        Object.entries(orders).map(([id, order]) => [id, rankingToAnswer(order)]),
      );
      await save.mutateAsync({ answers, favorites });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save your answers');
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="text-lg">Help the office get to know you</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-5">
        <p className="text-sm text-muted-foreground">
          Five quick ones — put each list in your own order, most like you at the top. There are
          no wrong answers, and your answers stay private to you.
        </p>

        {WORK_STYLE_QUESTIONS.map(q => (
          <RankQuestion
            key={q.id}
            question={q}
            order={orders[q.id]}
            onChange={next => setOrders(o => ({ ...o, [q.id]: next }))}
          />
        ))}

        <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              <Cake className="h-4 w-4 text-primary" />
              The fun ones
            </p>
            <p className="text-xs text-muted-foreground">
              These ones <strong>are</strong> shared with the office — that's the point. They get
              used for birthdays, thank-yous, and the occasional surprise. Skip any you'd rather
              not answer.
            </p>
          </div>
          {FAVORITE_QUESTIONS.map(f => (
            <div key={f.id} className="space-y-1">
              <Label htmlFor={`fav-${f.id}`} className="text-xs">{f.label}</Label>
              <Input
                id={`fav-${f.id}`}
                value={favorites[f.id] ?? ''}
                onChange={e => setFavorites(v => ({ ...v, [f.id]: e.target.value }))}
                placeholder={f.placeholder}
                maxLength={80}
              />
            </div>
          ))}
        </div>

        <Button onClick={submit} disabled={save.isPending || !save.isReady} className="w-full">
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}


function BasicsStep({ onDone }: { onDone: () => void }) {
  const { data: ctx } = useOrgContext();
  const { data: registry } = useTagRegistry();
  const save = useSaveBasics();

  const [preferred, setPreferred] = useState('');
  const [team, setTeam] = useState<string>('clinical');
  const [tag, setTag] = useState('');
  const [touchedTag, setTouchedTag] = useState(false);

  const taken = useMemo(
    () => new Set((registry ?? []).map(r => String(r.tag).toUpperCase())),
    [registry],
  );

  // Suggest a tag from their name until they type their own.
  useEffect(() => {
    if (touchedTag) return;
    const base = suggestTag(preferred || ctx?.org_name === undefined ? preferred : preferred);
    setTag(base ? freeTag(base, taken) : '');
  }, [preferred, taken, touchedTag, ctx?.org_name]);

  const tagValid = TAG_PATTERN.test(tag);
  const tagFree = tagValid && !taken.has(tag.toUpperCase());

  const submit = async () => {
    if (!preferred.trim()) {
      toast.error('What should we call you?');
      return;
    }
    if (!tagFree) {
      toast.error('Pick a free 3–4 character staff code.');
      return;
    }
    try {
      await save.mutateAsync({
        preferred_name: preferred,
        team,
        tag,
        markStep: true,
      });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    }
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b">
        <CardTitle className="text-lg">The basics</CardTitle>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <div className="space-y-1.5">
          <Label htmlFor="preferred">What should we call you?</Label>
          <Input
            id="preferred"
            value={preferred}
            onChange={e => setPreferred(e.target.value)}
            placeholder="Megan"
            maxLength={40}
          />
          <p className="text-xs text-muted-foreground">
            This is the name used across the app. Add your last name too if you'd like a tag
            suggested from it.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Which side of the office are you on?</Label>
          <Select value={team} onValueChange={setTeam}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="clinical">Clinical</SelectItem>
              <SelectItem value="clerical">Clerical</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            This decides which team announcements reach you.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tag">Your tag</Label>
          <Input
            id="tag"
            value={tag}
            onChange={e => {
              setTouchedTag(true);
              setTag(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4));
            }}
            placeholder="MEG"
            className="w-24 font-mono tracking-widest"
          />
          <p className="text-xs text-muted-foreground">
            3–4 characters. Used on reports, print sheets, and exports instead of your full name —
            everywhere else you're just {preferred || 'you'}. A code is never reused, so it stays
            yours.
          </p>
          {tag && !tagValid && (
            <p className="text-xs text-destructive">Staff codes are 3–4 letters or numbers.</p>
          )}
          {tagValid && !tagFree && (
            <p className="text-xs text-destructive">That tag is already taken in this office.</p>
          )}
        </div>

        <Button onClick={submit} disabled={save.isPending || !save.isReady} className="w-full">
          {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Continue
        </Button>
      </CardContent>
    </Card>
  );
}

function GoalStep({ onDone }: { onDone: () => void }) {
  const month = currentMonth();
  const { user } = useAuth();
  const { data } = useGoalsMonth(month);
  const goal = data?.goals.find(g => g.user_id === user?.id);
  const completeStep = useCompleteStep();

  // The moment a goal exists, the last box ticks itself.
  useEffect(() => {
    if (!goal) return;
    completeStep.mutate('goal', { onSuccess: onDone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goal?.id]);

  return (
    <div className="space-y-4">
      <Card className="card-elevated border-primary/30">
        <CardContent className="flex gap-3 p-4">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Last one: pick <strong className="text-foreground">one thing you want to get better
            at this month</strong>. Keep it small and real — you can change it later.
          </p>
        </CardContent>
      </Card>

      <SetGoalCard month={month} />
    </div>
  );
}
