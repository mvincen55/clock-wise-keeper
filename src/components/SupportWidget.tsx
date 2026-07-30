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
  EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import { downloadSupportPdf } from '@/lib/support-pdf';
import TicketTimeline, { stageFromTicket } from '@/components/support/TicketTimeline';
import { redactScreenshot } from '@/lib/redact-image';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';

type Bubble = {
  id: string;
  role: 'user' | 'assistant' | 'staff';
  content: string;
  tier?: string | null;
  previewUrls?: string[];
  attachmentNames?: string[];
};


/** A file waiting to be sent, plus its scrubbed twin. */
type Attachment = {
  key: string;
  original: File;
  redacted: File | null;
  masked: number;
  working: boolean;
};

const CATEGORIES = [
  { value: 'time_clock', label: 'Clock in / out' },
  { value: 'timesheet', label: 'Timesheet or hours' },
  { value: 'pto', label: 'PTO or time off' },
  { value: 'schedule', label: 'Schedule' },
  { value: 'payroll', label: 'Payroll numbers' },
  { value: 'access', label: 'Login or access' },
  { value: 'display', label: 'Something looks wrong' },
  { value: 'other', label: 'Something else' },
];

const SEVERITIES = [
  { value: 'low', label: 'Minor — annoying' },
  { value: 'medium', label: 'Slowing me down' },
  { value: 'high', label: "Can't finish my work" },
  { value: 'critical', label: 'Pay or records are wrong' },
];

/** Best guess at what this page is about, so nobody has to think about it. */
function guessCategory(path: string): string {
  if (path.startsWith('/timesheet')) return 'timesheet';
  if (path.startsWith('/pto') || path.includes('time-off')) return 'pto';
  if (path.startsWith('/schedule')) return 'schedule';
  if (path.startsWith('/reports') || path.includes('payroll')) return 'payroll';
  if (path === '/' || path.startsWith('/dashboard')) return 'time_clock';
  if (path.startsWith('/auth') || path.startsWith('/login')) return 'access';
  return 'other';
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

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
  const [files, setFiles] = useState<Attachment[]>([]);
  const [redactOn, setRedactOn] = useState(true);
  const [category, setCategory] = useState('other');
  const [severity, setSeverity] = useState('medium');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
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

  // Prefill from wherever they are: the page decides the category, and any date
  // range already on screen (?from=&to=) carries over so nobody retypes it.
  useEffect(() => {
    if (!open || ticketId) return;
    const params = new URLSearchParams(location.search);
    const from = params.get('from') ?? params.get('start') ?? '';
    const to = params.get('to') ?? params.get('end') ?? '';
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 6 * 86400000);
    setCategory(guessCategory(location.pathname));
    setRangeStart(from || isoDay(weekAgo));
    setRangeEnd(to || isoDay(today));
  }, [open, ticketId, location.pathname, location.search]);

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
    setCategory('other');
    setSeverity('medium');
  }, []);

  /**
   * Screenshots get scrubbed on this device before anything is uploaded:
   * names, punch times, dates, emails and record IDs are painted over.
   */
  const redactOne = useCallback(async (key: string, file: File) => {
    try {
      const { file: clean, maskedCount } = await redactScreenshot(file);
      setFiles(prev =>
        prev.map(a =>
          a.key === key
            ? { ...a, redacted: maskedCount >= 0 ? clean : null, masked: Math.max(maskedCount, 0), working: false }
            : a,
        ),
      );
    } catch {
      setFiles(prev => prev.map(a => (a.key === key ? { ...a, working: false } : a)));
      toast.error('Could not scrub that screenshot — it will be sent as-is unless you remove it.');
    }
  }, []);

  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;
      const queued: Attachment[] = [];
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
          const isImage = f.type.startsWith('image/');
          const item: Attachment = {
            key: crypto.randomUUID(),
            original: f,
            redacted: null,
            masked: 0,
            working: isImage,
          };
          next.push(item);
          if (isImage) queued.push(item);
        }
        return next;
      });
      for (const item of queued) void redactOne(item.key, item.original);
    },
    [redactOne],
  );

  /** Paste screenshots straight into the box — the fastest way to report. */
  const onPaste = (e: React.ClipboardEvent) => {
    const imgs = Array.from(e.clipboardData.files).filter(f => f.type.startsWith('image/'));
    if (imgs.length) {
      e.preventDefault();
      addFiles(imgs);
    }
  };

  /** Drop a screenshot anywhere on the panel — same as attaching it. */
  const onDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };

  const onDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length === 0) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (resolved || busy) return;
    const usable = dropped.filter(
      f => f.type.startsWith('image/') || f.type === 'application/pdf',
    );
    if (usable.length === 0) {
      toast.error('Images and PDFs only.');
      return;
    }
    addFiles(usable);
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
            category,
            severity,
            range_start: rangeStart || null,
            range_end: rangeEnd || null,
          })
          .select('id')
          .single();
        if (error) throw error;
        id = data.id;
        setTicketId(id);
      }

      const uploaded: { path: string; file: File }[] = [];
      for (const a of files) {
        // Send the scrubbed copy whenever we have one and redaction is on.
        const f = redactOn && a.redacted ? a.redacted : a.original;
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

  const anyWorking = files.some(a => a.working);
  const totalMasked = files.reduce((n, a) => n + (a.redacted ? a.masked : 0), 0);

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
        <div
          className="fixed bottom-4 right-4 z-50 flex max-h-[70vh] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl"
          onDragEnter={onDragEnter}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          {dragging && !resolved && (
            <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-primary bg-card/95">
              <ImagePlus className="h-6 w-6 text-primary" />
              <p className="text-sm font-medium text-foreground">Drop it here</p>
              <p className="text-xs text-muted-foreground">Images or PDFs, up to {MAX_FILES}</p>
            </div>
          )}
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
                  Drag a screenshot in, paste one, or attach a file. The everyday agent answers first — if it's a
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
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {files.map(a => {
                      const shown = redactOn && a.redacted ? a.redacted : a.original;
                      return (
                        <div
                          key={a.key}
                          className="relative h-16 w-16 overflow-hidden rounded border bg-muted"
                        >
                          {shown.type.startsWith('image/') ? (
                            <img
                              src={URL.createObjectURL(shown)}
                              alt={`Attachment preview: ${a.original.name}`}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <span className="flex h-full w-full items-center justify-center px-1 text-center text-[9px] leading-tight text-muted-foreground">
                              {a.original.name}
                            </span>
                          )}
                          {a.working && (
                            <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setFiles(prev => prev.filter(x => x.key !== a.key))}
                            aria-label={`Remove ${a.original.name}`}
                            className="absolute right-0 top-0 rounded-bl bg-background/90 p-0.5"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-2 py-1.5">
                    <EyeOff className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 leading-tight">
                      <p className="text-[11px] font-medium text-foreground">
                        Hide names, times &amp; IDs
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {anyWorking
                          ? 'Scrubbing on this device…'
                          : redactOn
                            ? totalMasked > 0
                              ? `${totalMasked} item${totalMasked === 1 ? '' : 's'} covered before sending`
                              : 'Nothing sensitive found to cover'
                            : 'The screenshot will be sent exactly as-is'}
                      </p>
                    </div>
                    <Switch
                      checked={redactOn}
                      onCheckedChange={setRedactOn}
                      aria-label="Hide names, times and IDs in screenshots"
                    />
                  </div>
                </div>
              )}

              {!ticketId && (
                <div className="space-y-2 rounded-md border border-border/60 bg-muted/30 p-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground">
                        What's it about
                      </label>
                      <Select value={category} onValueChange={setCategory}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[60]">
                          {CATEGORIES.map(c => (
                            <SelectItem key={c.value} value={c.value} className="text-xs">
                              {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-medium text-muted-foreground">
                        How bad
                      </label>
                      <Select value={severity} onValueChange={setSeverity}>
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="z-[60]">
                          {SEVERITIES.map(sv => (
                            <SelectItem key={sv.value} value={sv.value} className="text-xs">
                              {sv.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-medium text-muted-foreground">
                      Dates involved
                    </label>
                    <div className="flex items-center gap-1">
                      <Input
                        type="date"
                        value={rangeStart}
                        onChange={e => setRangeStart(e.target.value)}
                        className="h-7 text-xs"
                        aria-label="Start of the date range this problem covers"
                      />
                      <span className="text-[10px] text-muted-foreground">to</span>
                      <Input
                        type="date"
                        value={rangeEnd}
                        onChange={e => setRangeEnd(e.target.value)}
                        className="h-7 text-xs"
                        aria-label="End of the date range this problem covers"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    Prefilled from {location.pathname} — change anything that's off.
                  </p>
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
                  disabled={busy || anyWorking || (!text.trim() && files.length === 0)}

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
