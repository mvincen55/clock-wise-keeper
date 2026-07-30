import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, RotateCcw, Send, XCircle } from 'lucide-react';
import { PASS_MARK, useRecordAttempt, type TrainingModule } from '@/hooks/useTraining';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Turn = { role: 'persona' | 'trainee'; content: string };

type Score = {
  score: number;
  passed: boolean;
  summary: string;
  criteria: { criterion: string; score: number; note: string }[];
  line_feedback: { line: number; quote: string; note: string; good: boolean }[];
  do_next_time: string[];
};

type Props = {
  module: TrainingModule;
  onPassed: () => void | Promise<void>;
  onBack: () => void;
};

/**
 * Live practice conversation with a grounded AI persona, then a rubric score.
 * Unlimited retakes — the whole point is reps.
 */
export default function RoleplayChat({ module, onPassed, onBack }: Props) {
  const roleplay = module.content.roleplay!;
  const [turns, setTurns] = useState<Turn[]>([
    { role: 'persona', content: roleplay.opening },
  ]);
  const [draft, setDraft] = useState('');
  const [thinking, setThinking] = useState(false);
  const [scoring, setScoring] = useState(false);
  const [result, setResult] = useState<Score | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const recordAttempt = useRecordAttempt();

  const traineeTurns = turns.filter(t => t.role === 'trainee').length;
  const wrapUp = traineeTurns >= 8;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [turns, result, thinking]);

  async function send() {
    const message = draft.trim();
    if (!message || thinking || result) return;
    const next: Turn[] = [...turns, { role: 'trainee', content: message }];
    setTurns(next);
    setDraft('');
    setThinking(true);
    try {
      const { data, error } = await supabase.functions.invoke('training-roleplay', {
        body: { mode: 'turn', module_id: module.id, transcript: next },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      setTurns([...next, { role: 'persona', content: data.reply as string }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The conversation stalled — try again.');
      setTurns(turns);
      setDraft(message);
    } finally {
      setThinking(false);
    }
  }

  async function finish() {
    if (scoring) return;
    setScoring(true);
    try {
      const { data, error } = await supabase.functions.invoke('training-roleplay', {
        body: { mode: 'score', module_id: module.id, transcript: turns },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      const scored = data as Score;
      setResult(scored);
      await recordAttempt.mutateAsync({
        moduleId: module.id,
        score: scored.score,
        passed: scored.passed,
        type: 'roleplay',
        answers: { transcript: turns, feedback: scored },
      });
      if (scored.passed) {
        await onPassed();
        toast.success(`Passed with ${scored.score}%.`);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not score the conversation.');
    } finally {
      setScoring(false);
    }
  }

  function retake() {
    setResult(null);
    setTurns([{ role: 'persona', content: roleplay.opening }]);
    setDraft('');
  }

  return (
    <div className="space-y-4">
      <Card className="border-primary/40 bg-primary/5">
        <CardContent className="space-y-1 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{roleplay.persona.name}</Badge>
            <span className="text-xs text-muted-foreground">{roleplay.persona.role}</span>
          </div>
          <p className="text-sm text-muted-foreground">{roleplay.scenario}</p>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {turns.map((turn, i) => (
          <div
            key={i}
            className={cn('flex', turn.role === 'trainee' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] rounded-lg px-3.5 py-2.5 text-sm leading-relaxed',
                turn.role === 'trainee'
                  ? 'bg-primary text-primary-foreground'
                  : 'border border-border bg-card'
              )}
            >
              {turn.role === 'persona' && (
                <p className="mb-0.5 text-xs font-medium opacity-70">{roleplay.persona.name}</p>
              )}
              {turn.content}
            </div>
          </div>
        ))}
        {thinking && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            {roleplay.persona.name} is thinking…
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {!result && (
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Type what you'd actually say…"
            rows={3}
            disabled={thinking || scoring}
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => void send()} disabled={!draft.trim() || thinking || scoring}>
              <Send className="mr-1.5 h-4 w-4" />
              Reply
            </Button>
            <Button
              variant={wrapUp ? 'default' : 'outline'}
              onClick={() => void finish()}
              disabled={traineeTurns === 0 || thinking || scoring}
            >
              {scoring && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
              Finish and get feedback
            </Button>
            {wrapUp && (
              <span className="text-xs text-muted-foreground">
                That's a full conversation — wrap it up whenever you're ready.
              </span>
            )}
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
              {result.summary && (
                <p className="text-sm text-muted-foreground">{result.summary}</p>
              )}
            </CardContent>
          </Card>

          {result.criteria.length > 0 && (
            <Card>
              <CardContent className="space-y-3 p-4">
                {result.criteria.map((c, i) => (
                  <div key={i} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">{c.criterion}</span>
                      <span className="text-muted-foreground">{c.score}%</span>
                    </div>
                    <Progress value={c.score} className="h-1.5" />
                    {c.note && <p className="text-xs text-muted-foreground">{c.note}</p>}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {result.line_feedback.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Line by line</h3>
              {result.line_feedback.map((l, i) => (
                <div key={i} className="flex gap-2.5 rounded-md border border-border p-3 text-sm">
                  {l.good ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <div>
                    {l.quote && <p className="italic text-muted-foreground">"{l.quote}"</p>}
                    <p>{l.note}</p>
                  </div>
                </div>
              ))}
            </div>
          )}

          {result.do_next_time.length > 0 && (
            <Card className="bg-muted/40">
              <CardContent className="space-y-1.5 p-4">
                <p className="text-sm font-medium">Next time</p>
                <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                  {result.do_next_time.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          <div className="flex flex-wrap gap-2">
            <Button variant={result.passed ? 'outline' : 'default'} onClick={retake}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              Practise again
            </Button>
            <Button variant="ghost" onClick={onBack}>
              Done
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
