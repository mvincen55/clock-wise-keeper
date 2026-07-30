import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sparkles, Loader2, Send } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

type Turn = { role: 'user' | 'assistant'; content: string };

/** Light renderer — the analyst answers in short markdown. */
function AnswerText({ text }: { text: string }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text.split('\n').filter(l => l.trim()).map((line, i) => {
        const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/, '');
        const bullet = /^[-*•]\s+/.test(clean);
        const heading = /^#+\s/.test(line) || /^\*\*.+\*\*$/.test(line.trim());
        return (
          <p
            key={i}
            className={
              heading
                ? 'font-semibold text-foreground'
                : bullet
                  ? 'pl-4 text-muted-foreground'
                  : 'text-muted-foreground'
            }
          >
            {bullet ? `• ${clean.replace(/^[-*•]\s+/, '')}` : clean}
          </p>
        );
      })}
    </div>
  );
}

/**
 * The AI reader over the accountability record book. Same filters as the list
 * below it: it only ever sees the records in the selected range and kind.
 */
export default function ReportsAnalyst({
  from,
  to,
  kind,
  recordCount,
}: {
  from: string;
  to: string;
  kind: string;
  recordCount: number;
}) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);

  const call = async (action: 'analyze' | 'ask', q?: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('reports-analyst', {
        body: { action, from, to, kind, question: q, history: turns.slice(-8) },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTurns(prev => [...prev, { role: 'assistant', content: data.answer as string }]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'The analyst could not answer.');
    } finally {
      setBusy(false);
    }
  };

  const ask = () => {
    const q = question.trim();
    if (!q || busy) return;
    setTurns(prev => [...prev, { role: 'user', content: q }]);
    setQuestion('');
    call('ask', q);
  };

  return (
    <Card className="card-elevated">
      <CardHeader className="border-b pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-accent" />
          Record analyst
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Reads the records in the range above — patterns, anything worth a look, and what's
          ordinary. Every claim cites a real record.
        </p>
      </CardHeader>
      <CardContent className="space-y-3 p-4">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => call('analyze')}
        >
          {busy && turns.length === 0 ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="mr-2 h-4 w-4" />
          )}
          Analyze {recordCount} record{recordCount === 1 ? '' : 's'}
        </Button>

        {turns.length > 0 && (
          <div className="max-h-[420px] space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3">
            {turns.map((t, i) =>
              t.role === 'user' ? (
                <p key={i} className="text-sm font-medium">
                  {t.content}
                </p>
              ) : (
                <AnswerText key={i} text={t.content} />
              ),
            )}
            {busy && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Reading the records…
              </p>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Input
            value={question}
            onChange={e => setQuestion(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                ask();
              }
            }}
            placeholder="Ask about these records — e.g. who has repeats, or which reviews stalled"
            disabled={busy}
          />
          <Button size="icon" onClick={ask} disabled={busy || !question.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
