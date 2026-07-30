import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  LifeBuoy,
  X,
  Send,
  Loader2,
  ImagePlus,
  ArrowUpCircle,
  ShieldCheck,
  CheckCircle2,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadSupportPdf } from '@/lib/support-pdf';
import TicketTimeline, { stageFromTicket } from '@/components/support/TicketTimeline';

type Bubble = {
  id: string;
  role: 'user' | 'assistant' | 'staff';
  content: string;
  tier?: string | null;
  previewUrls?: string[];
  attachmentNames?: string[];
};


const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_FILES = 5;
const ACCEPTED = 'image/*,application/pdf';


/**
 * "Report a problem" — the little life-ring in the corner of every page.
 *
 * The everyday agent answers first (fast and cheap). If it can't fix it, or
 * the person says it's a real problem, one tap hands the whole thread to the
 * senior agent — the expensive, careful one.
 */
export default function SupportWidget() {
  const { user } = useAuth();
  const { data: org } = useOrgContext();
  const orgId = org?.org_id ?? null;
  const location = useLocation();

  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState<'standard' | 'senior'>('standard');
  const [suggested, setSuggested] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);


  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (open) setTimeout(() => textRef.current?.focus(), 60);
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [bubbles, busy]);

  const reset = useCallback(() => {
    setTicketId(null);
    setBubbles([]);
    setText('');
    setFiles([]);
    setTier('standard');
    setSuggested(null);
    setResolved(false);
  }, []);

  const addFiles = useCallback((incoming: File[]) => {
    if (incoming.length === 0) return;
    setFiles(prev => {
      const next = [...prev];
      for (const f of incoming) {
        if (next.length >= MAX_FILES) {
          toast.error(`You can attach up to ${MAX_FILES} files.`);
          break;
        }
        if (f.size > MAX_IMAGE_BYTES) {
          toast.error(`${f.name} is over 8MB — try a smaller one.`);
          continue;
        }
        next.push(f);
      }
      return next;
    });
  }, []);

  /** Paste screenshots straight into the box — the fastest way to report. */
  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
    if (imgs.length) {
      e.preventDefault();
      addFiles(imgs);
    }
  };

  const send = async (asTier: 'standard' | 'senior' = tier) => {
    const body = text.trim();
    if ((!body && files.length === 0) || busy || !user || !orgId) return;
    setBusy(true);
    setSuggested(null);

    try {
      let id = ticketId;
      if (!id) {
        const { data, error } = await supabase
          .from('support_tickets')
          .insert({
            org_id: orgId,
            user_id: user.id,
            page_path: location.pathname,
            title: (body || 'Screenshot report').slice(0, 80),
          })
          .select('id')
          .single();
        if (error) throw error;
        id = data.id;
        setTicketId(id);
      }

      const uploaded: { path: string; file: File }[] = [];
      for (const f of files) {
        const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${orgId}/${id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('support-attachments')
          .upload(path, f, { contentType: f.type });
        if (upErr) throw upErr;
        uploaded.push({ path, file: f });
      }

      // One row per attachment so the agent sees each file; the first row
      // carries the typed message.
      const rows =
        uploaded.length > 0
          ? uploaded.map((u, i) => ({
              ticket_id: id,
              org_id: orgId,
              role: 'user',
              author_user_id: user.id,
              content: i === 0 ? body || `(${u.file.name})` : `(${u.file.name})`,
              attachment_path: u.path,
            }))
          : [
              {
                ticket_id: id,
                org_id: orgId,
                role: 'user',
                author_user_id: user.id,
                content: body,
                attachment_path: null,
              },
            ];

      const { error: msgErr } = await supabase.from('support_messages').insert(rows);
      if (msgErr) throw msgErr;

      setBubbles(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: body || `${uploaded.length} file${uploaded.length === 1 ? '' : 's'} attached`,
          previewUrls: uploaded
            .filter(u => u.file.type.startsWith('image/'))
            .map(u => URL.createObjectURL(u.file)),
          attachmentNames: uploaded.map(u => u.file.name),
        },
      ]);
      setText('');
      setFiles([]);


      const { data, error } = await supabase.functions.invoke('support-agent', {
        body: { ticket_id: id, tier: asTier },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setBubbles(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: String(data.answer ?? ''),
          tier: data.tier,
        },
      ]);
      if (data.escalate && asTier === 'standard') setSuggested(String(data.escalate));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send that.');
    } finally {
      setBusy(false);
      setTimeout(() => textRef.current?.focus(), 40);
    }
  };

  /** Hand the whole thread to the senior agent and flag it for the owner. */
  const escalate = async () => {
    if (!ticketId || busy) return;
    setBusy(true);
    setTier('senior');
    setSuggested(null);
    try {
      await supabase
        .from('support_tickets')
        .update({ status: 'escalated', tier: 'senior', escalated_at: new Date().toISOString() })
        .eq('id', ticketId);

      const { data, error } = await supabase.functions.invoke('support-agent', {
        body: { ticket_id: ticketId, tier: 'senior' },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setBubbles(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: String(data.answer ?? ''),
          tier: 'senior',
        },
      ]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not hand this up.');
    } finally {
      setBusy(false);
    }
  };

  /** A printable copy of the whole thread — for the person's own records. */
  const exportPdf = () => {
    downloadSupportPdf({
      ticketId,
      pagePath: location.pathname,
      reporter: user?.email ?? 'Team member',
      tier,
      resolved,
      bubbles: bubbles.map(b => ({
        role: b.role,
        content: b.content,
        tier: b.tier,
        attachments: b.attachmentNames,
      })),
    });
  };

  const markResolved = async () => {
    if (!ticketId) return;
    await supabase
      .from('support_tickets')
      .update({ status: 'resolved', resolved_at: new Date().toISOString() })
      .eq('id', ticketId);
    setResolved(true);
    toast.success('Thanks — closed out.');
  };

  if (!user || !orgId) return null;

  return (
    <>
      {!open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Report a problem"
          className="fixed bottom-4 right-4 z-50 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card text-muted-foreground shadow-lg transition-all hover:w-auto hover:gap-2 hover:px-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring group"
        >
          <LifeBuoy className="h-5 w-5 shrink-0" />
          <span className="hidden whitespace-nowrap text-sm group-hover:inline">
            Report a problem
          </span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-50 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
          <div className="flex items-center justify-between border-b px-3 py-2">
            <div className="flex items-center gap-2">
              <LifeBuoy className="h-4 w-4 text-accent" />
              <span className="text-sm font-medium">Report a problem</span>
              {tier === 'senior' && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <ShieldCheck className="h-3 w-3" /> Senior agent
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              {bubbles.length > 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={exportPdf}
                  title="Download this conversation as a PDF"
                >
                  <Download className="mr-1 h-3 w-3" /> PDF
                </Button>
              )}
              {ticketId && !resolved && (
                <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={markResolved}>
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Solved
                </Button>
              )}
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  setOpen(false);
                  if (resolved) reset();
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {(ticketId || bubbles.length > 0) && (
            <div className="border-b bg-muted/30 px-3 py-2">
              <TicketTimeline
                stage={stageFromTicket(
                  resolved ? 'resolved' : tier === 'senior' ? 'escalated' : 'open',
                  tier,
                  bubbles.some(b => b.role !== 'user'),
                )}
                working={busy}
              />
            </div>
          )}

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {bubbles.length === 0 && (
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>What went wrong? A sentence is plenty.</p>
                <p className="text-xs">
                  You can paste or attach a screenshot. The everyday agent answers first — if it's a
                  real problem, one tap hands it to the senior agent.
                </p>
              </div>
            )}

            {bubbles.map(b =>
              b.role === 'user' ? (
                <div key={b.id} className="ml-auto max-w-[85%] space-y-1">
                  <div className="rounded-lg bg-primary px-3 py-2 text-sm text-primary-foreground">
                    {b.content}
                  </div>
                  {!!b.previewUrls?.length && (
                    <div className="flex flex-wrap justify-end gap-1">
                      {b.previewUrls.map(u => (
                        <img
                          key={u}
                          src={u}
                          alt="Screenshot attached to this problem report"
                          className="max-h-28 rounded-md border"
                        />
                      ))}
                    </div>
                  )}

                </div>
              ) : (
                <div key={b.id} className="max-w-[92%] space-y-1">
                  {b.tier === 'senior' && (
                    <p className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-accent">
                      <ShieldCheck className="h-3 w-3" /> Senior agent
                    </p>
                  )}
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {b.content}
                  </div>
                </div>
              ),
            )}

            {busy && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {tier === 'senior' ? 'Digging into it…' : 'Looking at it…'}
              </p>
            )}

            {suggested && !busy && (
              <div className="space-y-2 rounded-md border border-accent/40 bg-accent/5 p-2">
                <p className="text-xs text-muted-foreground">
                  This looks like a real problem: {suggested}
                </p>
                <Button size="sm" className="h-7 text-xs" onClick={escalate}>
                  <ArrowUpCircle className="mr-1 h-3 w-3" /> Send to the senior agent
                </Button>
              </div>
            )}

            {ticketId && !suggested && !busy && tier === 'standard' && bubbles.length > 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={escalate}
              >
                <ArrowUpCircle className="mr-1 h-3 w-3" /> That didn't fix it — escalate
              </Button>
            )}
          </div>

          {!resolved && (
            <div className="space-y-2 border-t p-2">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div
                      key={`${f.name}-${i}`}
                      className="relative h-16 w-16 overflow-hidden rounded border bg-muted"
                    >
                      {f.type.startsWith('image/') ? (
                        <img
                          src={URL.createObjectURL(f)}
                          alt={`Attachment preview: ${f.name}`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] leading-tight text-muted-foreground">
                          {f.name}
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                        aria-label={`Remove ${f.name}`}
                        className="absolute right-0 top-0 rounded-bl bg-background/90 p-0.5"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <Textarea
                ref={textRef}
                value={text}
                onChange={e => setText(e.target.value)}
                onPaste={onPaste}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="What's happening?"
                className="resize-none text-sm"
                disabled={busy}
              />
              <div className="flex items-center justify-between">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => fileRef.current?.click()}
                  disabled={busy}
                >
                  <ImagePlus className="mr-1 h-3.5 w-3.5" /> Attach
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  accept={ACCEPTED}
                  multiple
                  className="hidden"
                  onChange={e => {
                    addFiles(Array.from(e.target.files ?? []));
                    e.target.value = '';
                  }}
                />
                <Button
                  size="sm"
                  className="h-7"
                  onClick={() => send()}
                  disabled={busy || (!text.trim() && files.length === 0)}

                >
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}

          {resolved && (
            <div className="border-t p-3 text-center">
              <Button size="sm" variant="outline" onClick={reset}>
                Report something else
              </Button>
            </div>
          )}
        </div>
      )}
    </>
  );
}
