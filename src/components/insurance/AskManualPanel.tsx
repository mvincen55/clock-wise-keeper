/**
 * Ask AI, scoped to the manual on screen.
 *
 * Questions go to the office agent with the insurance scope AND the
 * selected manual's id, so answers come from this carrier's wording —
 * never generalized from another carrier. Every answer lists its
 * sources with section and page; when the current section is open,
 * one click asks about exactly that section. The panel reminds staff
 * that no patient information belongs here.
 */
import { useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronRight, FileText, Loader2, Send, ShieldAlert, Sparkles } from 'lucide-react';
import type { OfficeDoc } from '@/hooks/useOfficeDocs';

interface ManualAskSource {
  id: string;
  title: string;
  category: string;
  section_title?: string | null;
  page_number?: number | null;
}

interface PanelMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: ManualAskSource[];
}

function useAskManual(doc: OfficeDoc | null) {
  return useMutation({
    mutationFn: async (input: {
      question: string;
      history: PanelMessage[];
    }): Promise<{ answer: string; sources: ManualAskSource[] }> => {
      const { data, error } = await supabase.functions.invoke('kimi-agent', {
        body: {
          mode: 'ask',
          scope: 'insurance',
          ...(doc ? { scope_doc_ids: [doc.id] } : {}),
          messages: [
            ...input.history.slice(-10).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: input.question },
          ],
        },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return {
        answer: data?.reply ?? '',
        sources: Array.isArray(data?.sources) ? data.sources : [],
      };
    },
  });
}

export default function AskManualPanel({
  doc,
  sectionTitle,
  sectionPage,
  onOpenPage,
}: {
  doc: OfficeDoc | null;
  /** The section currently on screen, for "Ask about this section". */
  sectionTitle: string | null;
  sectionPage: number | null;
  onOpenPage: ((page: number) => void) | null;
}) {
  const [messages, setMessages] = useState<PanelMessage[]>([]);
  const [input, setInput] = useState('');
  const ask = useAskManual(doc);
  const scrollRef = useRef<HTMLDivElement>(null);

  const send = (question: string) => {
    const trimmed = question.trim();
    if (!trimmed || ask.isPending) return;
    const history = messages;
    setMessages(prev => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    ask.mutate(
      { question: trimmed, history },
      {
        onSuccess: result => {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: result.answer, sources: result.sources },
          ]);
          requestAnimationFrame(() =>
            scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
          );
        },
        onError: err => {
          setMessages(prev => [
            ...prev,
            { role: 'assistant', content: `Sorry — that didn't work: ${err.message}` },
          ]);
        },
      }
    );
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-2 pb-3">
        <p className="text-xs text-muted-foreground">
          Answers come only from{' '}
          <span className="font-medium text-foreground">{doc?.title ?? 'the insurance library'}</span>{' '}
          and cite the section and page they used. Rules from other carriers are never applied.
        </p>
        <p className="flex items-start gap-1.5 rounded-lg bg-destructive/5 px-2.5 py-1.5 text-[11px] leading-snug text-destructive">
          <ShieldAlert className="mt-px h-3.5 w-3.5 shrink-0" />
          Ask general carrier questions only. Do not enter patient information.
        </p>
        {sectionTitle && (
          <Button
            variant="outline"
            size="sm"
            className="h-8 w-full justify-start overflow-hidden"
            onClick={() => setInput(`About the section "${sectionTitle}": `)}
          >
            <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="truncate">Ask about “{sectionTitle}”</span>
          </Button>
        )}
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain pr-1">
        {messages.length === 0 && (
          <p className="rounded-xl border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
            e.g. “What is the filing deadline for claims?” or “When is a predetermination
            recommended?”
          </p>
        )}
        {messages.map((message, i) =>
          message.role === 'user' ? (
            <p
              key={i}
              className="ml-6 rounded-2xl rounded-br-md bg-primary px-3 py-2 text-sm text-primary-foreground"
            >
              {message.content}
            </p>
          ) : (
            <div key={i} className="mr-2 space-y-2">
              <div className="whitespace-pre-wrap rounded-2xl rounded-bl-md border border-border bg-card px-3 py-2 text-sm leading-relaxed">
                {message.content}
              </div>
              {message.sources && message.sources.length > 0 && (
                <div className="space-y-1">
                  {message.sources.map(source => (
                    <div
                      key={`${source.id}:${source.section_title ?? ''}:${source.page_number ?? ''}`}
                      className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-muted-foreground"
                    >
                      <FileText className="h-3 w-3 shrink-0 text-primary" />
                      <span className="font-medium text-foreground/80">{source.title}</span>
                      {source.section_title && (
                        <>
                          <ChevronRight className="h-2.5 w-2.5" />
                          <span className="max-w-[12rem] truncate">{source.section_title}</span>
                        </>
                      )}
                      {source.page_number &&
                        (onOpenPage ? (
                          <button
                            type="button"
                            onClick={() => onOpenPage(source.page_number!)}
                            className="rounded bg-muted px-1 py-px font-medium tabular-nums hover:bg-primary/10 hover:text-primary"
                          >
                            p. {source.page_number}
                          </button>
                        ) : (
                          <span className="rounded bg-muted px-1 py-px font-medium tabular-nums">
                            p. {source.page_number}
                          </span>
                        ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
        {ask.isPending && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            Searching {doc ? 'this manual' : 'the insurance library'}…
          </div>
        )}
      </div>

      <form
        className="shrink-0 pt-3"
        onSubmit={e => {
          e.preventDefault();
          send(input);
        }}
      >
        <div className="flex items-end gap-2">
          <Textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                send(input);
              }
            }}
            rows={2}
            placeholder={sectionPage ? `Ask about ${doc?.title ?? 'this manual'}…` : 'Ask a carrier question…'}
            className="min-h-[3.25rem] resize-none text-sm focus-visible:ring-primary"
          />
          <Button type="submit" size="icon" disabled={!input.trim() || ask.isPending} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}
