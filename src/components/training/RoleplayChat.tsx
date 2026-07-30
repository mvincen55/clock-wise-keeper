import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessagesSquare, RotateCcw, Send } from 'lucide-react';
import {
  useRoleplayTurn,
  useScoreRoleplay,
  type RoleplayMessage,
  type RoleplayResult,
  type TrainingModule,
} from '@/hooks/useTraining';
import RoleplayRubricCard from './RoleplayRubricCard';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Props = { module: TrainingModule; onPassed?: () => void };

/** Practice conversation with an AI persona, then an item-by-item rubric debrief. */
export default function RoleplayChat({ module, onPassed }: Props) {
  const [messages, setMessages] = useState<RoleplayMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [result, setResult] = useState<RoleplayResult | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const turn = useRoleplayTurn();
  const score = useScoreRoleplay();

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, turn.isPending]);

  const traineeTurns = messages.filter(m => m.role === 'user').length;

  async function start() {
    try {
      const reply = await turn.mutateAsync({ moduleId: module.id, messages: [] });
      setMessages([{ role: 'assistant', content: reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not start the roleplay.');
    }
  }

  async function send() {
    const content = draft.trim();
    if (!content) return;
    const next: RoleplayMessage[] = [...messages, { role: 'user', content }];
    setMessages(next);
    setDraft('');
    try {
      const reply = await turn.mutateAsync({ moduleId: module.id, messages: next });
      setMessages([...next, { role: 'assistant', content: reply }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not continue the roleplay.');
    }
  }

  async function finish() {
    try {
      const graded = await score.mutateAsync({ moduleId: module.id, messages });
      setResult(graded);
      // Transcript is dropped the moment it is graded — nothing to reveal later.
      setMessages([]);
      if (graded.passed) onPassed?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not score the roleplay.');
    }
  }

  function reset() {
    setResult(null);
    setMessages([]);
    setDraft('');
  }

  if (result) {
    return (
      <div className="space-y-4">
        <RoleplayRubricCard result={result} />
        <Button variant="outline" onClick={reset}>
          <RotateCcw className="mr-1.5 h-4 w-4" />
          Practice again
        </Button>
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <Card>
        <CardContent className="space-y-3 p-4">
          <div className="flex gap-2.5">
            <MessagesSquare className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
            <div className="text-sm">
              <p className="font-medium">Practice the conversation</p>
              <p className="text-muted-foreground">
                Talk it through with a patient who behaves like a real one. When you're done you'll get
                a rubric breakdown showing exactly where your points came from — your conversation is
                never saved or shown to anyone.
              </p>
            </div>
          </div>
          <Button onClick={start} disabled={turn.isPending}>
            {turn.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            Start roleplay
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="max-h-[420px] space-y-2 overflow-y-auto rounded-md border border-border p-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn(
              'max-w-[85%] rounded-lg px-3 py-2 text-sm',
              m.role === 'user'
                ? 'ml-auto bg-primary/10 text-foreground'
                : 'bg-muted text-foreground/90'
            )}
          >
            {m.content}
          </div>
        ))}
        {turn.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>

      <Textarea
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder="Say it the way you would on the phone…"
        rows={3}
      />

      <div className="flex flex-wrap gap-2">
        <Button onClick={send} disabled={!draft.trim() || turn.isPending}>
          <Send className="mr-1.5 h-4 w-4" />
          Send
        </Button>
        <Button variant="outline" onClick={finish} disabled={traineeTurns < 2 || score.isPending}>
          {score.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          End and get my breakdown
        </Button>
      </div>
      {traineeTurns < 2 && (
        <p className="text-xs text-muted-foreground">
          A couple more turns and you can end it for scoring.
        </p>
      )}
    </div>
  );
}
