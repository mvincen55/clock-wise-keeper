import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Compass, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import NoPhiNote from '@/components/NoPhiNote';
import { callPathfinder } from '@/hooks/useGoals';
import {
  boundTranscript,
  FINDER_OPENER,
  parseCandidates,
  type FinderTurn,
  type GoalCandidate,
} from '@/lib/goal-finder';

/**
 * Pick a goal by talking it through. The member says what they are looking
 * at; Pathfinder asks one question if it has to, then offers two or three
 * goals that fit that situation and this office — the member's own words
 * kept, each with a measurable target and a reason. Picking one fills the
 * form. Nothing is saved from here, and the member can keep talking to
 * adjust the options.
 */
export default function GoalFinder({
  onPick,
  onTranscript,
}: {
  onPick: (candidate: GoalCandidate) => void;
  /** The conversation so far, after each exchange — carried into the goal's thread on save. */
  onTranscript?: (turns: FinderTurn[]) => void;
}) {
  const [turns, setTurns] = useState<FinderTurn[]>([
    { author: 'pathfinder', content: FINDER_OPENER },
  ]);
  const [candidates, setCandidates] = useState<GoalCandidate[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [turns.length, candidates.length, pending]);

  const send = async () => {
    const text = input.trim();
    if (!text || pending) return;
    const asked: FinderTurn[] = [...turns, { author: 'member', content: text }];
    setTurns(asked);
    setInput('');
    setPending(true);
    try {
      const result = await callPathfinder({ mode: 'find_goal', messages: boundTranscript(asked) });
      const reply =
        result.reply?.trim() ||
        "I couldn't turn that into a goal yet — tell me a little more about what you're seeing.";
      const answered: FinderTurn[] = [...asked, { author: 'pathfinder', content: reply }];
      setTurns(answered);
      setCandidates(parseCandidates(result.candidates));
      onTranscript?.(answered);
    } catch (e) {
      setTurns(turns);
      setInput(text);
      toast.error(e instanceof Error ? e.message : 'Pathfinder could not reply');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/[0.03] p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Compass className="h-4 w-4 text-primary" />
        Not sure what to pick? Talk it through.
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
        {turns.map((t, i) => (
          <div
            key={`${i}-${t.author}`}
            className={cn('flex', t.author === 'member' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                t.author === 'member' ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
              )}
            >
              {t.content}
            </div>
          </div>
        ))}
        {pending && <p className="text-sm text-muted-foreground">Pathfinder is thinking…</p>}
        <div ref={endRef} />
      </div>

      {candidates.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-medium text-muted-foreground">
            Pick one, or keep talking to adjust them.
          </p>
          {candidates.map((c, i) => (
            <div key={`${i}-${c.title}`} className="rounded-md border border-border/60 bg-background p-2.5">
              <p className="text-sm font-medium leading-snug">{c.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Measured by: {c.target || 'you decide'}
                {c.weeks ? ` · about ${c.weeks} week${c.weeks === 1 ? '' : 's'}` : ''}
              </p>
              {c.why && <p className="mt-1 text-xs text-muted-foreground">{c.why}</p>}
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => onPick(c)}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Use this goal
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        <Textarea
          rows={2}
          value={input}
          placeholder="What are you looking at?"
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          className="flex-1"
          aria-label="Tell Pathfinder what you are looking at"
        />
        <Button size="sm" onClick={send} disabled={!input.trim() || pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
        </Button>
      </div>

      <NoPhiNote what="What you tell Pathfinder" />
    </div>
  );
}
