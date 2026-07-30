import { Fragment, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Sparkles, Loader2, Send, FileText, ThumbsUp, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { formatDate } from '@/lib/time-utils';

export interface AnalystCitation {
  id: string;
  who: string;
  kind: string;
  kind_label: string;
  period_start: string;
  period_end: string;
  status: string;
  summary: string;
  member_reason: string | null;
  manager_note: string | null;
  closed_at: string | null;
}

export interface AnalystConcern {
  title: string;
  confidence: 'high' | 'medium' | 'low';
  confidence_reason: string;
  supports: string[];
  weakens: string[];
  record_ids: string[];
}

type Turn = {
  role: 'user' | 'assistant';
  content: string;
  citations?: AnalystCitation[];
  concerns?: AnalystConcern[];
};


const CITE = /\[rec:([0-9a-fA-F-]{6,})\]/g;

/** A short, clickable label for a record — never a raw uuid wall. */
function citeLabel(c: AnalystCitation | undefined, id: string) {
  if (!c) return `#${id.slice(0, 8)}`;
  return `${c.who} · ${formatDate(c.period_start)}`;
}

/** Renders one line of text, turning [rec:<id>] tokens into record chips. */
function CiteLine({
  text,
  byId,
  onOpen,
}: {
  text: string;
  byId: Map<string, AnalystCitation>;
  onOpen: (c: AnalystCitation) => void;
}) {
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  CITE.lastIndex = 0;
  while ((m = CITE.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const c = byId.get(m[1]);
    out.push(
      <button
        key={`${m[1]}-${m.index}`}
        type="button"
        disabled={!c}
        onClick={() => c && onOpen(c)}
        className="mx-0.5 inline-flex items-center gap-1 rounded border border-accent/40 bg-accent/10 px-1.5 py-0.5 align-baseline text-[11px] font-medium text-accent hover:bg-accent/20 disabled:opacity-50"
        title={c ? c.summary : 'Record not found'}
      >
        <FileText className="h-3 w-3" />
        {citeLabel(c, m[1])}
      </button>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return (
    <>
      {out.map((n, i) => (
        <Fragment key={i}>{n}</Fragment>
      ))}
    </>
  );
}

/**
 * Light renderer — the analyst answers in short markdown with [rec:<id>]
 * citation tokens. Every token becomes a chip that opens the real record.
 */
function AnswerText({
  text,
  citations,
  onOpen,
}: {
  text: string;
  citations: AnalystCitation[];
  onOpen: (c: AnalystCitation) => void;
}) {
  const byId = new Map(citations.map(c => [c.id, c]));


  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {text
        .split('\n')
        .filter(l => l.trim())
        .map((line, i) => {
          const clean = line.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#+\s*/, '');
          const bullet = /^[-*•]\s+/.test(clean);
          const heading = /^#+\s/.test(line) || /^\*\*.+\*\*$/.test(line.trim());
          const body = bullet ? `• ${clean.replace(/^[-*•]\s+/, '')}` : clean;
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
              <CiteLine text={body} byId={byId} onOpen={onOpen} />
            </p>
          );
        })}
    </div>
  );
}

const CONFIDENCE: Record<
  AnalystConcern['confidence'],
  { label: string; className: string; blurb: string }
> = {
  high: {
    label: 'High confidence',
    className: 'border-destructive/40 bg-destructive/10 text-destructive',
    blurb: 'Several records point the same way.',
  },
  medium: {
    label: 'Medium confidence',
    className: 'border-accent/40 bg-accent/10 text-accent',
    blurb: 'A real pattern, but thin data or an ordinary explanation.',
  },
  low: {
    label: 'Low confidence',
    className: 'border-muted-foreground/30 bg-muted text-muted-foreground',
    blurb: 'Worth a glance, not a conclusion.',
  },
};

/** A flagged concern with its confidence and both sides of the evidence. */
function ConcernCard({
  concern,
  byId,
  onOpen,
}: {
  concern: AnalystConcern;
  byId: Map<string, AnalystCitation>;
  onOpen: (c: AnalystCitation) => void;
}) {
  const conf = CONFIDENCE[concern.confidence];
  return (
    <div className="space-y-2 rounded-md border bg-background p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="text-sm font-medium">{concern.title}</p>
        <span
          className={`shrink-0 rounded border px-2 py-0.5 text-[11px] font-medium ${conf.className}`}
          title={conf.blurb}
        >
          {conf.label}
        </span>
      </div>
      {concern.confidence_reason && (
        <p className="text-xs italic text-muted-foreground">{concern.confidence_reason}</p>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <ThumbsUp className="h-3 w-3" /> Supports this
          </p>
          {concern.supports.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            concern.supports.map((s, i) => (
              <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                • <CiteLine text={s} byId={byId} onOpen={onOpen} />
              </p>
            ))
          )}
        </div>
        <div className="space-y-1">
          <p className="flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <ThumbsDown className="h-3 w-3" /> Weakens this
          </p>
          {concern.weakens.length === 0 ? (
            <p className="text-xs text-muted-foreground">—</p>
          ) : (
            concern.weakens.map((s, i) => (
              <p key={i} className="text-xs leading-relaxed text-muted-foreground">
                • <CiteLine text={s} byId={byId} onOpen={onOpen} />
              </p>
            ))
          )}
        </div>
      </div>
      {concern.record_ids.length > 0 && (
        <div className="flex flex-wrap gap-1.5 pt-1">
          {concern.record_ids.map(id => {
            const c = byId.get(id);
            if (!c) return null;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onOpen(c)}
                className="rounded border bg-muted/40 px-2 py-1 text-[11px] hover:bg-muted"
              >
                {c.who} · {c.kind_label} · {formatDate(c.period_start)}
              </button>
            );
          })}
        </div>
      )}
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
  const [open, setOpen] = useState<AnalystCitation | null>(null);

  const call = async (action: 'analyze' | 'ask', q?: string) => {
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke('reports-analyst', {
        body: {
          action,
          from,
          to,
          kind,
          question: q,
          history: turns.slice(-8).map(t => ({ role: t.role, content: t.content })),
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      setTurns(prev => [
        ...prev,
        {
          role: 'assistant',
          content: data.answer as string,
          citations: (data.citations ?? []) as AnalystCitation[],
        },
      ]);
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
    <>
      <Card className="card-elevated">
        <CardHeader className="border-b pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-accent" />
            Record analyst
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Reads the records in the range above — patterns, anything worth a look, and what's
            ordinary. Every claim cites a real record you can open. Citations that don't match a
            real record are stripped before you ever see them.
          </p>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <Button size="sm" variant="outline" disabled={busy} onClick={() => call('analyze')}>
            {busy && turns.length === 0 ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="mr-2 h-4 w-4" />
            )}
            Analyze {recordCount} record{recordCount === 1 ? '' : 's'}
          </Button>

          {turns.length > 0 && (
            <div className="max-h-[420px] space-y-4 overflow-y-auto rounded-md border bg-muted/20 p-3">
              {turns.map((t, i) =>
                t.role === 'user' ? (
                  <p key={i} className="text-sm font-medium">
                    {t.content}
                  </p>
                ) : (
                  <div key={i} className="space-y-2">
                    <AnswerText
                      text={t.content}
                      citations={t.citations ?? []}
                      onOpen={setOpen}
                    />
                    {(t.citations?.length ?? 0) > 0 && (
                      <div className="space-y-1 border-t pt-2">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Records used ({t.citations!.length})
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {t.citations!.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setOpen(c)}
                              className="rounded border bg-background px-2 py-1 text-left text-[11px] hover:bg-muted"
                            >
                              <span className="font-medium">{c.who}</span>
                              <span className="text-muted-foreground">
                                {' '}
                                · {c.kind_label} · {formatDate(c.period_start)}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
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

      <Dialog open={!!open} onOpenChange={o => !o && setOpen(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              {open?.who} · {open?.kind_label}
            </DialogTitle>
            <DialogDescription>
              {open ? `${formatDate(open.period_start)} → ${formatDate(open.period_end)}` : ''}
            </DialogDescription>
          </DialogHeader>
          {open && (
            <div className="space-y-3 text-sm">
              <Badge variant="secondary">
                {open.status === 'closed'
                  ? `Closed${open.closed_at ? ` ${formatDate(open.closed_at.slice(0, 10))}` : ''}`
                  : open.status.replace(/_/g, ' ')}
              </Badge>
              <p>{open.summary}</p>
              {open.member_reason && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    What they said
                  </p>
                  <p className="text-muted-foreground">“{open.member_reason}”</p>
                </div>
              )}
              {open.manager_note && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Review note
                  </p>
                  <p className="text-muted-foreground">{open.manager_note}</p>
                </div>
              )}
              <p className="pt-1 font-mono text-[10px] text-muted-foreground">
                Record {open.id}
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
