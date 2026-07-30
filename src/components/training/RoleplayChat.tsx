import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageCircle, RotateCcw, Send, ShieldAlert } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { PASS_MARK, useRecordAttempt, type TrainingModule } from '@/hooks/useTraining';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

/** The conversation ends (or can be scored) after this many trainee turns. */
const MAX_EXCHANGES = 8;

type Turn = { role: 'member' | 'persona'; content: string };

type Score = {
  score: number;
  passed: boolean;
  summary: string;
  rubric: { item: string; met: boolean; note: string }[];
  line_feedback: { quote: string; note: string }[];
};

type Props = {
  module: TrainingModule;
  onPassed: () => void | Promise<void>;
  onExit: () => void;
};

/**
 * Practice the conversation: the trainee talks with an AI persona grounded in
 * how this office runs, then the strong model scores the transcript at the 80%
 * bar. Transcripts belong to the trainee — admins only ever see pass/fail.
 */
export default function RoleplayChat({ module, onPassed, onExit }: Props) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState<Score | null>(null);
  const started = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);
  const recordAttempt = useRecordAttempt();

  const memberTurns = turns.filter(t => t.role === 'member').length;

  async function callRoleplay(mode: 'start' | 'reply' | 'score', payload: Turn[]) {
    const { data, error } = await supabase.functions.invoke('training-roleplay', {
      body: { mode, module_id: module.id, turns: payload },
    });
    if (error) throw new Error(data?.error || error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    (async () => {
      setBusy(true);
      try {
        const data = await callRoleplay('start', []);
        setTurns([{ role: 'persona', content: data.reply }]);
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusy(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth' });
  }, [turns, result]);

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const next: Turn[] = [...turns, { role: 'member', content: text }];
    setTurns(next);
    setDraft('');
    setBusy(true);
    try {
      const data = await callRoleplay('reply', next);
      setTurns([...next, { role: 'persona', content: data.reply }]);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function score() {
    if (memberTurns === 0 || scoring) return;
    setScoring(true);
    try {
      const data = (await callRoleplay('score', turns)) as Score;
      setResult(data);
      await recordAttempt.mutateAsync({
        moduleId: module.id,
        score: data.score,
        passed: data.passed,
        type: 'roleplay',
        answers: { transcript: turns, feedback: data },
      });
      if (data.passed) {
        await onPassed();
        toast.success(`Passed with ${data.score}%.`);
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setScoring(false);
    }
  }

  function retake() {
    setResult(null);
    setTurns([]);
    setDraft('');
    started.current = false;
    setBusy(true);
    (async () => {
      try {
        const data = await callRoleplay('start', []);
        setTurns([{ role: 'persona', content: data.reply }]);
        started.current = true;
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="flex gap-3 p-4">
          <MessageCircle className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
          <div className="text-sm">
            <p className="font-medium">Practice the conversation</p>
            <p className="text-muted-foreground">
              {module.content.roleplay?.scenario ||
                'Talk it through the way you would in the office. Nobody sees this but you.'}
            </p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {turns.map((turn, i) => (
          <div
            key={i}
            className={cn(
              'max-w-[85%] rounded-lg px-3 py-2 text-sm',
              turn.role === 'member'
                ? 'ml-auto bg-primary text-primary-foreground'
                : 'bg-muted text-foreground'
            )}
          >
            {turn.content}
          </div>
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={bottom} />
      </div>

      {!result && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder="Type what you would say…"
            rows={3}
            disabled={busy || memberTurns >= MAX_EXCHANGES}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send();
            }}
          />
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            This conversation runs through an external AI service — never include a patient's name
            or details. Everyone in the scenario is fictional.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={send} disabled={busy || !draft.trim() || memberTurns >= MAX_EXCHANGES}>
              <Send className="mr-1.5 h-4 w-4" />
              Send
            </Button>
            <Button variant="outline" onClick={score} disabled={memberTurns === 0 || scoring || busy}>
              {scoring && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Finish and see feedback
            </Button>
            <span className="text-xs text-muted-foreground">
              {memberTurns}/{MAX_EXCHANGES} turns
            </span>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-4">
          <Card className={cn(result.passed ? 'border-primary/50 bg-primary/5' : 'border-warning/50')}>
            <CardContent className="space-y-2 p-4">
              <div className="flex items-center justify-between">
                <p className="font-medium">
                  {result.passed ? `Passed — ${result.score}%` : `${result.score}% — not quite yet`}
                </p>
                <span className="text-xs text-muted-foreground">{PASS_MARK}% to pass</span>
              </div>
              <Progress value={result.score} />
              {result.summary && <p className="text-sm text-muted-foreground">{result.summary}</p>}
            </CardContent>
          </Card>

          {result.rubric.length > 0 && (
            <Card>
              <CardContent className="space-y-2 p-4">
                <p className="text-sm font-medium">What was being looked for</p>
                {result.rubric.map((r, i) => (
                  <div key={i} className="text-sm">
                    <span className={cn('font-medium', r.met ? 'text-primary' : 'text-muted-foreground')}>
                      {r.met ? '✓' : '•'} {r.item}
                    </span>
                    {r.note && <span className="text-muted-foreground"> — {r.note}</span>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result.line_feedback.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-4">
                <p className="text-sm font-medium">Line by line</p>
                {result.line_feedback.map((f, i) => (
                  <div key={i} className="rounded-md bg-muted/50 p-2.5 text-sm">
                    <p className="italic text-foreground">“{f.quote}”</p>
                    <p className="text-muted-foreground">{f.note}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant={result.passed ? 'outline' : 'default'} onClick={retake}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Practice again
            </Button>
            <Button variant="ghost" onClick={onExit}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
