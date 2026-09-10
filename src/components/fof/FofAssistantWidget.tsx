import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  GitCommitHorizontal,
  Loader2,
  MessageCircle,
  MessageSquare,
  Minus,
  Send,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import CodeNotesPanel from '@/components/fof/CodeNotesPanel';
import { fofTextNeedsReview } from '../../../supabase/functions/_shared/fof-privacy';
import { answerCurrentForm, type CurrentFofContext } from '@/lib/fof/current-form-assistant';
import { useCodeNotes } from '@/hooks/useAssistantMemory';
import { useQueryClient } from '@tanstack/react-query';

/**
 * Current-form answers run locally against the live calculation. General
 * office questions use kimi-agent; owner/manager Training explicitly enables
 * shared office guidance updates. The assistant cannot change application code.
 *
 * Privacy boundary: no form context is transmitted. The browser-only name
 * is used to block accidental mentions before sending chat. Pattern checks
 * are defense in depth, not a complete de-identification mechanism. Chat
 * history lives in component memory and clears on patient/office changes.
 */

export interface AgentAction {
  type: string;
  summary: string;
  url?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  savedRules?: string[];
  actions?: AgentAction[];
}

interface Props {
  context: CurrentFofContext | null;
  /** Browser-only comparison; never include this value in a request. */
  patientName?: string;
}

/** Chips for what the assistant actually did this turn (saves, commits, PRs). */
export function ActionChips({ actions }: { actions: AgentAction[] }) {
  if (actions.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {actions.map((action, i) => {
        // A conflict isn't an accomplishment — it's a question for the
        // manager, so it reads as a warning rather than a done-chip.
        const isConflict = action.type === 'memory_conflict';
        return (
          <div
            key={i}
            className={
              isConflict
                ? 'flex items-center gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] text-amber-900'
                : 'flex items-center gap-1.5 rounded-md border border-sky-300 bg-sky-50 px-2 py-1 text-[11px] text-sky-900'
            }
          >
            {isConflict ? (
              <AlertTriangle className="h-3 w-3 shrink-0" />
            ) : action.type.startsWith('github') ? (
              <GitCommitHorizontal className="h-3 w-3 shrink-0" />
            ) : (
              <Wrench className="h-3 w-3 shrink-0" />
            )}
            <span className="min-w-0 flex-1 truncate" title={action.summary}>
              {action.summary}
            </span>
            {action.url && (
              <a
                href={action.url}
                target="_blank"
                rel="noreferrer"
                className="shrink-0 underline decoration-dotted"
                aria-label="Open on GitHub"
              >
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function FofAssistantWidget({ context, patientName = '' }: Props) {
  const { data: ctx } = useOrgContext();
  const { data: codeNotes } = useCodeNotes();
  const queryClient = useQueryClient();
  const isManager = ctx?.role === 'owner' || ctx?.role === 'manager';
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  // Managers can pause training (click the badge) — chat keeps working,
  // nothing gets saved as a rule while it's off.
  const [training, setTraining] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [formMessages, setFormMessages] = useState<ChatMessage[]>([]);
  const [channel, setChannel] = useState<'form' | 'office'>('form');
  // This comparison stays in component memory, never query keys or storage.
  const formVersion = JSON.stringify(context);
  useEffect(() => { setFormMessages([]); }, [formVersion]);
  // Managers can flip to the code notes while training, to see everything
  // already written about the codes.
  const [view, setView] = useState<'chat' | 'notes'>('chat');
  const scrollRef = useRef<HTMLDivElement>(null);
  const conversationScope = useRef(0);
  useEffect(() => {
    conversationScope.current += 1;
    setMessages([]);
    setFormMessages([]);
    setInput('');
    setBusy(false);
  }, [ctx?.org_id, patientName]);
  useEffect(() => { setTraining(false); }, [ctx?.org_id, ctx?.role]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, formMessages, busy, open]);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (channel === 'form') {
      setFormMessages(previous => [...previous, { role: 'user', content: text },
        { role: 'assistant', content: answerCurrentForm(text, context, codeNotes) }]);
      setInput('');
      return;
    }
    const nameParts: string[] = patientName.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? [];
    const words = new Set<string>(text.toLocaleLowerCase().match(/[\p{L}]+/gu) ?? []);
    if (fofTextNeedsReview(text) || nameParts.some(part => part.length > 1 && words.has(part))) {
      setMessages(m => [...m, { role: 'assistant', content: 'Please remove patient names, dates, identifiers, and personal insurance details before sending. Ask about the general office rule or procedure code.' }]);
      return;
    }
    const scope = conversationScope.current;
    const next: ChatMessage[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('kimi-agent', {
        body: {
          mode: 'fof',
          orgId: ctx?.org_id,
          messages: next.slice(-10).map(m => ({ role: m.role, content: m.content })),
          trainingEnabled: isManager && training,
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      if (scope !== conversationScope.current) return;
      const reply: string = data?.reply ?? '';
      if (!reply) throw new Error('No reply');
      setMessages(m => [
        ...m,
        {
          role: 'assistant',
          content: reply,
          savedRules: Array.isArray(data?.savedRules) ? data.savedRules : undefined,
          actions: Array.isArray(data?.actions) ? data.actions : undefined,
        },
      ]);
      if (data?.savedRules?.length || data?.actions?.length) {
        await queryClient.invalidateQueries({ queryKey: ['assistant-code-notes', ctx?.org_id] });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['fof-office-guidance', ctx?.org_id] }),
          queryClient.invalidateQueries({ queryKey: ['assistant-memories', ctx?.org_id] }),
          queryClient.invalidateQueries({ queryKey: ['code-knowledge', ctx?.org_id] }),
        ]);
      }
    } catch (err) {
      if (scope !== conversationScope.current) return;
      const detail = err instanceof Error && err.message !== 'No reply' ? ` (${err.message})` : '';
      setMessages(m => [
        ...m,
        {
          role: 'assistant',
          content: `Sorry — I couldn't reach the assistant. Try again in a moment.${detail}`,
        },
      ]);
    } finally {
      if (scope === conversationScope.current) setBusy(false);
    }
  };

  // Sits just above the global "Report a problem" bubble (bottom-4 right-4,
  // h-11) so the two corner widgets stack instead of overlapping.
  return (
    <div className="fixed bottom-[4.5rem] right-4 z-50 print:hidden">
      {open ? (
        <div className="flex h-[28rem] max-h-[calc(100vh-5.5rem)] w-96 max-w-[calc(100vw-3rem)] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
          <div className="flex items-center gap-2 border-b bg-primary px-4 py-3 text-primary-foreground">
            <Sparkles className="h-4 w-4" />
            <span className="text-sm font-semibold">FOF Assistant</span>
            {isManager ? (
              <button
                type="button"
                onClick={() => { setTraining(t => !t); setChannel('office'); }}
                title={training ? 'Click to pause training' : 'Click to resume training'}
                className="ml-1"
              >
                <Badge
                  variant="secondary"
                  className={
                    training
                      ? 'cursor-pointer text-[10px] font-medium'
                      : 'cursor-pointer bg-white/20 text-[10px] font-medium text-white/50'
                  }
                >
                  {training ? 'Training mode' : 'Training off'}
                </Badge>
              </button>
            ) : (
              <Badge variant="secondary" className="ml-1 text-[10px] font-medium">
                Q&A
              </Badge>
            )}
            {isManager && (
              <button
                type="button"
                className="ml-auto rounded p-1 hover:bg-white/15"
                onClick={() => setView(v => (v === 'chat' ? 'notes' : 'chat'))}
                title={view === 'chat' ? 'Show what I know about the codes' : 'Back to chat'}
                aria-label={view === 'chat' ? 'Show code notes' : 'Back to chat'}
              >
                {view === 'chat' ? (
                  <BookOpen className="h-4 w-4" />
                ) : (
                  <MessageSquare className="h-4 w-4" />
                )}
              </button>
            )}
            <button
              className={isManager ? 'rounded p-1 hover:bg-white/15' : 'ml-auto rounded p-1 hover:bg-white/15'}
              onClick={() => setOpen(false)}
              aria-label="Minimize assistant"
            >
              <Minus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex gap-1 border-b p-2" aria-label="Assistant question scope">
            <Button size="sm" variant={channel === 'form' ? 'default' : 'outline'} onClick={() => { setChannel('form'); setView('chat'); setInput(''); }}>Current form</Button>
            <Button size="sm" variant={channel === 'office' ? 'default' : 'outline'} onClick={() => { setChannel('office'); setView('chat'); setInput(''); }}>Office knowledge</Button>
          </div>
          {view === 'notes' ? (
            <div className="flex-1 overflow-y-auto p-3">
              <CodeNotesPanel />
            </div>
          ) : (
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {(channel === 'form' ? formMessages : messages).length === 0 && (
              <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
                {channel === 'form' ? 'Ask about this form’s total, payment schedule, treatment groups, insurance estimate, or code-bank notes. These answers use the current form here in your browser. Answers clear when the form changes.' : isManager
                  ? training
                    ? 'Ask about procedure codes, insurance rules, or office policies. Training mode can save general guidance to the office code bank. Patient-specific corrections belong in the form.'
                    : 'Ask about procedure codes, insurance rules, or office policies. Training is off; no office knowledge will be changed.'
                  : 'Ask about procedure codes, insurance rules, or office policies. An owner or manager can update office guidance with Training mode on.'}
              </div>

            )}
            {(channel === 'form' ? formMessages : messages).map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    m.role === 'user'
                      ? 'max-w-[85%] rounded-xl rounded-br-sm bg-primary px-3 py-2 text-sm text-primary-foreground'
                      : 'max-w-[85%] rounded-xl rounded-bl-sm bg-muted px-3 py-2 text-sm'
                  }
                >
                  <div className="whitespace-pre-wrap">{m.content}</div>
                  {(m.savedRules ?? []).map((rule, j) => (
                    <div
                      key={j}
                      className="mt-2 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800"
                    >
                      ✓ Saved wording rule: {rule}
                    </div>
                  ))}
                  <ActionChips actions={m.actions ?? []} />
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking…
              </div>
            )}
          </div>
          )}

          <div className="border-t p-2">
            <div className="flex items-center gap-2">
              <Input
                value={input}
                autoComplete="off"
                onFocus={() => setView('chat')}
                placeholder={channel === 'form' ? 'Ask about this form…' : 'Ask about a code or office policy…'}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button size="icon" onClick={send} disabled={busy || input.trim() === ''}>
                <Send className="h-4 w-4" />
              </Button>
            </div>
            {/* Persistent, at the point of typing — the accepted PHI mitigation. */}
            <p className="mt-1.5 px-0.5 text-[11px] text-muted-foreground">
              {channel === 'form' ? 'Current-form questions and answers stay in this browser. No patient form is sent to AI.' : 'Patient names stay in this browser. Office knowledge uses external AI: enter general office questions only, without patient details.'}
            </p>
          </div>

        </div>
      ) : (
        <Button
          className="h-12 gap-2 rounded-full px-4 shadow-lg"
          onClick={() => setOpen(true)}
        >
          <MessageCircle className="h-5 w-5" />
          FOF Assistant
        </Button>
      )}
    </div>
  );
}
