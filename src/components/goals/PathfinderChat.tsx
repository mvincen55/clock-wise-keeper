import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useGoalMessages, useSendPathfinderMessage } from '@/hooks/useGoals';
import NoPhiNote from '@/components/NoPhiNote';

/** Persistent Pathfinder conversation for one goal — remembers everything. */
export default function PathfinderChat({ goalId }: { goalId: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const { data: messages, isLoading } = useGoalMessages(goalId, open);
  const send = useSendPathfinderMessage(goalId);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ block: 'nearest' });
  }, [open, messages?.length, send.isPending]);

  const submit = async () => {
    const text = input.trim();
    if (!text || send.isPending) return;
    setInput('');
    try {
      await send.mutateAsync(text);
    } catch (e) {
      setInput(text);
      toast.error(e instanceof Error ? e.message : 'Pathfinder could not reply');
    }
  };

  return (
    <div className="rounded-lg border">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium"
        aria-expanded={open}
      >
        <MessageCircle className="h-4 w-4 text-primary" />
        Talk to Pathfinder
        {open ? (
          <ChevronUp className="ml-auto h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t p-3">
          <div className="max-h-80 space-y-3 overflow-y-auto pr-1">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {!isLoading && (messages ?? []).length === 0 && (
              <p className="text-sm text-muted-foreground">
                Ask anything about this goal — where to start, what to do when the week gets busy,
                how to word your update.
              </p>
            )}
            {(messages ?? []).map(m => (
              <div
                key={m.id}
                className={cn('flex', m.author === 'member' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
                    m.author === 'member'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-foreground'
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {send.isPending && (
              <p className="text-sm text-muted-foreground">Pathfinder is thinking…</p>
            )}
            <div ref={endRef} />
          </div>

          <div className="flex items-end gap-2">
            <Textarea
              rows={2}
              value={input}
              placeholder="Ask Pathfinder…"
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              className="flex-1"
            />
            <Button size="sm" onClick={submit} disabled={!input.trim() || send.isPending}>
              {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}
            </Button>
          </div>

          <NoPhiNote />
        </div>
      )}
    </div>
  );
}
