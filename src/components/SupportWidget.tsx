import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { buildTicketContext, type TicketContext } from '@/lib/support-context';

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
  AlertTriangle,
  RotateCw,
  History,
  Clock,
  Plus,
  ChevronLeft,
  ExternalLink,
  SlidersHorizontal,
  PenLine,

} from 'lucide-react';
import { toast } from 'sonner';
import { downloadSupportPdf } from '@/lib/support-pdf';
import { slaFor } from '@/lib/support-sla';
import TicketTimeline, { stageFromTicket, type TicketStageTimes } from '@/components/support/TicketTimeline';
import { redactScreenshot } from '@/lib/redact-image';
import type { RedactionCategories } from '@/lib/redact-image';
import {
  useRedactionPrefs,
  describeRedaction,
  REDACTION_LABELS,
} from '@/lib/redaction-prefs';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import RedactionEditor from '@/components/support/RedactionEditor';
import { composeRedaction, type RedactionBox } from '@/lib/manual-redaction';
import { extractPdfText } from '@/lib/extract-pdf-text';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';

type Bubble = {
  id: string;
  role: 'user' | 'assistant' | 'staff';
  content: string;
  tier?: string | null;
  previewUrls?: string[];
  attachmentNames?: string[];
};


/** A report from before, as it appears in the history list. */
type PastTicket = {
  id: string;
  title: string | null;
  status: string | null;
  tier: string | null;
  category: string | null;
  severity: string | null;
  page_path: string | null;
  context_path?: string | null;
  context_label?: string | null;

  created_at: string;
  escalated_at?: string | null;
  resolved_at?: string | null;
};

/** A file waiting to be sent, plus its scrubbed twin. */
type Attachment = {
  key: string;
  original: File;
  redacted: File | null;
  masked: number;
  working: boolean;
  /** Text read off the file, safe version (masked words hidden). */
  text: string;
  /** Text read off the file with nothing hidden. */
  rawText: string;
  /** Set once the file has landed in storage, so a retry never re-uploads it. */
  uploadedPath?: string | null;
  /** Last upload problem for this specific file. */
  uploadError?: string | null;
  /** Boxes the person drew by hand, on top of (or undoing) the auto pass. */
  boxes?: RedactionBox[];
  /** The hand-edited image — this is what gets sent when it exists. */
  manual?: File | null;
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
  const navigate = useNavigate();


  const [open, setOpen] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Attachment[]>([]);
  const [redactOn, setRedactOn] = useState(true);
  /** Which data types get painted over before upload — the person's own choice. */
  const { prefs: redactPrefs, toggle: toggleRedactPref } = useRedactionPrefs();
  const redactPrefsRef = useRef<RedactionCategories>(redactPrefs);
  redactPrefsRef.current = redactPrefs;
  const [category, setCategory] = useState('other');
  const [severity, setSeverity] = useState('medium');
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; name: string } | null>(
    null,
  );
  const [sendError, setSendError] = useState<
    { message: string; kind: 'send' | 'agent'; tier: 'standard' | 'senior' } | null
  >(null);
  const dragDepth = useRef(0);
  const [busy, setBusy] = useState(false);
  const [tier, setTier] = useState<'standard' | 'senior'>('standard');
  const [suggested, setSuggested] = useState<string | null>(null);
  const [resolved, setResolved] = useState(false);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [history, setHistory] = useState<PastTicket[] | null>(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [stageTimes, setStageTimes] = useState<TicketStageTimes>({});
  /** Where this report came from, so any status line can jump back to it. */
  const [ticketContext, setTicketContext] = useState<TicketContext | null>(null);
  /** Which attachment is open in the draw-your-own-mask editor. */
  const [editingKey, setEditingKey] = useState<string | null>(null);



  const filesRef = useRef<Attachment[]>([]);
  filesRef.current = files;

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
    setEditingKey(null);
    setTier('standard');
    setSuggested(null);
    setResolved(false);
    setStageTimes({});
    setTicketContext(null);

    setCategory('other');
    setSeverity('medium');
  }, []);

  /**
   * Screenshots get scrubbed on this device before anything is uploaded:
   * names, punch times, dates, emails and record IDs are painted over.
   */
  const redactOne = useCallback(async (key: string, file: File) => {
    try {
      const { file: clean, maskedCount, text, rawText } = await redactScreenshot(
        file,
        [],
        redactPrefsRef.current,
      );
      const auto = maskedCount >= 0 ? clean : null;
      let manual: File | null = null;
      const existing = filesRef.current.find(a => a.key === key);
      // Hand-drawn boxes survive a re-scrub: recompose them over the new pass.
      if (existing?.boxes?.length) {
        try {
          manual = (await composeRedaction(existing.original, auto, existing.boxes)).file;
        } catch {
          manual = null;
        }
      }
      setFiles(prev =>
        prev.map(a =>
          a.key === key
            ? {
                ...a,
                redacted: auto,
                manual,
                masked: Math.max(maskedCount, 0),
                text,
                rawText,
                working: false,
              }
            : a,
        ),
      );
    } catch {
      setFiles(prev => prev.map(a => (a.key === key ? { ...a, working: false } : a)));
      toast.error('Could not scrub that screenshot — it will be sent as-is unless you remove it.');
    }
  }, []);

  // Changing what gets hidden re-scrubs anything already attached, from the
  // original file — so turning a category back on can never leak a stale copy.
  const prefsKey = JSON.stringify(redactPrefs);
  const lastPrefsKey = useRef(prefsKey);
  useEffect(() => {
    if (lastPrefsKey.current === prefsKey) return;
    lastPrefsKey.current = prefsKey;
    const images = files.filter(a => a.original.type.startsWith('image/') && !a.uploadedPath);
    if (images.length === 0) return;
    setFiles(prev =>
      prev.map(a =>
        images.some(i => i.key === a.key) ? { ...a, working: true } : a,
      ),
    );
    for (const a of images) void redactOne(a.key, a.original);
  }, [prefsKey, files, redactOne]);

  /** PDFs get read too, so the agent can quote the page instead of the filename. */
  const readPdf = useCallback(async (key: string, file: File) => {
    const text = await extractPdfText(file);
    setFiles(prev =>
      prev.map(a => (a.key === key ? { ...a, text, rawText: text, working: false } : a)),
    );
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
          const isPdf = f.type === 'application/pdf';
          const item: Attachment = {
            key: crypto.randomUUID(),
            original: f,
            redacted: null,
            masked: 0,
            working: isImage || isPdf,
            text: '',
            rawText: '',
          };
          next.push(item);
          if (isImage || isPdf) queued.push(item);
        }
        return next;
      });
      for (const item of queued) {
        if (item.original.type === 'application/pdf') void readPdf(item.key, item.original);
        else void redactOne(item.key, item.original);
      }
    },
    [redactOne, readPdf],
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

  /** Every report this person has filed, newest first. */
  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('support_tickets')
      .select(
        'id, title, status, tier, category, severity, page_path, context_path, context_label, created_at, escalated_at, resolved_at',
      )

      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(25);
    if (error) {
      toast.error('Could not load your past reports.');
      setHistory([]);
      return;
    }
    setHistory((data ?? []) as PastTicket[]);
  }, [user]);

  /**
   * Reopen an old report exactly as it was: the whole back-and-forth plus the
   * screenshots that were sent with it (fresh links, since the files are private).
   */
  const openTicket = useCallback(async (t: PastTicket) => {
    setLoadingThread(true);
    setView('chat');
    setSendError(null);
    setSuggested(null);
    setFiles([]);
    setText('');
    setTicketId(t.id);
    setTier(t.tier === 'senior' ? 'senior' : 'standard');
    setResolved(t.status === 'resolved');
    setTicketContext(
      t.context_path ? { path: t.context_path, label: t.context_label ?? 'what this was about' } : null,
    );

    try {
      const { data, error } = await supabase
        .from('support_messages')
        .select('id, role, content, attachment_path, created_at')
        .eq('ticket_id', t.id)
        .order('created_at', { ascending: true });
      if (error) throw error;

      const rows = data ?? [];
      const restored: Bubble[] = [];
      for (const m of rows) {
        const path = m.attachment_path as string | null;
        let previewUrls: string[] | undefined;
        let attachmentNames: string[] | undefined;
        if (path) {
          const name = path.split('/').pop() ?? 'attachment';
          attachmentNames = [name];
          if (/\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(path)) {
            const { data: signed } = await supabase.storage
              .from('support-attachments')
              .createSignedUrl(path, 600);
            if (signed?.signedUrl) previewUrls = [signed.signedUrl];
          }
        }
        restored.push({
          id: String(m.id),
          role: m.role === 'assistant' ? 'assistant' : m.role === 'staff' ? 'staff' : 'user',
          content: String(m.content ?? ''),
          previewUrls,
          attachmentNames,
        });
      }
      setBubbles(restored);
      // Rebuild the clock: the first agent reply is when the analyst started trying.
      const firstAnswer = rows.find(m => m.role !== 'user')?.created_at ?? null;
      setStageTimes({
        open: t.created_at,
        analyst: firstAnswer,
        escalated: t.escalated_at ?? null,
        solved: t.resolved_at ?? null,
      });
    } catch {
      toast.error('Could not open that report.');
    } finally {
      setLoadingThread(false);
    }
  }, []);

  // Keep the list of past reports current whenever the panel is open.
  useEffect(() => {
    if (open && view === 'history') void loadHistory();
  }, [open, view, loadHistory]);

  /** Turn a raw storage/network failure into something a human can act on. */
  const plainError = (e: unknown, what: string): string => {
    const raw = e instanceof Error ? e.message : String(e ?? '');
    const low = raw.toLowerCase();
    if (!navigator.onLine || low.includes('failed to fetch') || low.includes('network')) {
      return `${what} didn't go through — you look offline. Reconnect and hit Retry.`;
    }
    if (low.includes('exceeded') || low.includes('too large') || low.includes('payload')) {
      return `${what} is too big to upload. Remove it and try a smaller screenshot.`;
    }
    if (low.includes('timeout') || low.includes('timed out')) {
      return `${what} timed out. Nothing was lost — hit Retry.`;
    }
    if (low.includes('permission') || low.includes('policy') || low.includes('unauthorized')) {
      return `${what} was blocked — you may have been signed out. Refresh and try again.`;
    }
    return raw ? `${what} failed: ${raw}` : `${what} failed.`;
  };

  /** Ask the help desk agent for an answer. Split out so retry can redo just this. */
  const runAgent = async (id: string, asTier: 'standard' | 'senior') => {
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
    const answeredAt = new Date().toISOString();
    setStageTimes(prev => ({
      ...prev,
      ...(asTier === 'senior'
        ? { escalated: prev.escalated ?? answeredAt }
        : { analyst: prev.analyst ?? answeredAt }),
    }));
    if (data.escalate && asTier === 'standard') setSuggested(String(data.escalate));
  };

  const send = async (asTier: 'standard' | 'senior' = tier) => {
    const body = text.trim();
    if ((!body && files.length === 0) || busy || !user || !orgId) return;
    setBusy(true);
    setSuggested(null);
    setSendError(null);

    try {
      let id = ticketId;
      if (!id) {
        const ctx = buildTicketContext(location.pathname, location.search, rangeStart, rangeEnd);
        const { data, error } = await supabase
          .from('support_tickets')
          .insert({
            org_id: orgId,
            user_id: user.id,
            page_path: location.pathname,
            context_path: ctx.path,
            context_label: ctx.label,
            title: (body || 'Screenshot report').slice(0, 80),
            category,
            severity,
            range_start: rangeStart || null,
            range_end: rangeEnd || null,
          })
          .select('id, created_at')
          .single();
        if (error) throw error;
        id = data.id;
        setTicketId(id);
        setTicketContext(ctx);
        setStageTimes({ open: data.created_at ?? new Date().toISOString() });
      }


      const uploaded: { path: string; file: File; text: string }[] = [];
      const total = files.length;
      for (let i = 0; i < files.length; i += 1) {
        const a = files[i];
        // Send the scrubbed copy whenever we have one and redaction is on.
        const f = redactOn ? (a.manual ?? a.redacted ?? a.original) : a.original;
        setProgress({ done: i, total, name: a.original.name });

        // Same version of the text as the file: scrubbed image, scrubbed text.
        const text = redactOn && (a.manual || a.redacted) ? a.text : a.rawText || a.text;

        // A retry after a half-finished send picks up where it left off.
        if (a.uploadedPath) {
          uploaded.push({ path: a.uploadedPath, file: f, text });
          continue;
        }

        const ext = f.name.split('.').pop()?.toLowerCase() || 'png';
        const path = `${orgId}/${id}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('support-attachments')
          .upload(path, f, { contentType: f.type });
        if (upErr) {
          const msg = plainError(upErr, a.original.name);
          setFiles(prev => prev.map(x => (x.key === a.key ? { ...x, uploadError: msg } : x)));
          throw new Error(msg);
        }
        setFiles(prev =>
          prev.map(x => (x.key === a.key ? { ...x, uploadedPath: path, uploadError: null } : x)),
        );
        uploaded.push({ path, file: f, text });
      }
      if (total > 0) setProgress({ done: total, total, name: 'Sending…' });

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
              ocr_text: u.text ? u.text.slice(0, 6000) : null,
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
      if (msgErr) throw new Error(plainError(msgErr, 'Your report'));

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
      setProgress(null);

      // From here on the report is safely saved — a retry only re-asks the agent.
      try {
        await runAgent(id, asTier);
      } catch (e) {
        setSendError({
          message: plainError(e, 'The answer'),
          kind: 'agent',
          tier: asTier,
        });
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Could not send that.';
      setSendError({ message, kind: 'send', tier: asTier });
      toast.error(message);
    } finally {
      setProgress(null);
      setBusy(false);
      setTimeout(() => textRef.current?.focus(), 40);
    }
  };

  /** One button: redo whichever step actually failed. */
  const retrySend = async () => {
    if (!sendError || busy) return;
    const { kind, tier: failedTier } = sendError;
    setSendError(null);
    if (kind === 'send') {
      void send(failedTier);
      return;
    }
    if (!ticketId) return;
    setBusy(true);
    try {
      await runAgent(ticketId, failedTier);
    } catch (e) {
      setSendError({ message: plainError(e, 'The answer'), kind: 'agent', tier: failedTier });
    } finally {
      setBusy(false);
    }
  };

  /** Hand the whole thread to the senior agent and flag it for the owner. */
  const escalate = async () => {
    if (!ticketId || busy) return;
    setBusy(true);
    setTier('senior');
    setSuggested(null);
    const escalatedAt = new Date().toISOString();
    try {
      await supabase
        .from('support_tickets')
        .update({ status: 'escalated', tier: 'senior', escalated_at: escalatedAt })
        .eq('id', ticketId);
      setStageTimes(prev => ({ ...prev, escalated: prev.escalated ?? escalatedAt }));

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
    const resolvedAt = new Date().toISOString();
    await supabase
      .from('support_tickets')
      .update({ status: 'resolved', resolved_at: resolvedAt })
      .eq('id', ticketId);
    setStageTimes(prev => ({ ...prev, solved: resolvedAt }));
    setResolved(true);
    toast.success('Thanks — closed out.');
  };

  const anyWorking = files.some(a => a.working);
  const totalMasked = files.reduce((n, a) => n + (a.redacted ? a.masked : 0), 0);
  const handDrawn = files.reduce((n, a) => n + (a.boxes?.filter(b => b.tool === 'mask').length ?? 0), 0);
  const editingAttachment = files.find(a => a.key === editingKey) ?? null;

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
              {view === 'chat' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setView('history')}
                  title="Your past reports"
                >
                  <History className="mr-1 h-3 w-3" /> Past
                </Button>
              )}
              {view === 'history' && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => {
                    reset();
                    setView('chat');
                  }}
                >
                  <Plus className="mr-1 h-3 w-3" /> New
                </Button>
              )}
              {view === 'chat' && bubbles.length > 0 && (
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
              {view === 'chat' && ticketId && !resolved && (
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

          {view === 'history' && (
            <div className="flex-1 overflow-y-auto p-3">
              <button
                type="button"
                onClick={() => setView('chat')}
                className="mb-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ChevronLeft className="h-3 w-3" /> Back to this report
              </button>
              {history === null && <p className="text-sm text-muted-foreground">Loading…</p>}
              {history?.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  Nothing here yet — reports you send are kept here.
                </p>
              )}
              <div className="space-y-2">
                {(history ?? []).map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => void openTicket(t)}
                    className="w-full rounded-lg border p-2 text-left transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="line-clamp-2 text-sm font-medium">
                        {t.title || t.page_path || 'Problem report'}
                      </span>
                      <Badge variant="secondary" className="shrink-0 text-[10px] capitalize">
                        {(t.status ?? 'open').replace('_', ' ')}
                      </Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span>{new Date(t.created_at).toLocaleString()}</span>
                      {t.category && <span className="capitalize">{t.category}</span>}
                      {t.tier === 'senior' && (
                        <span className="inline-flex items-center gap-1">
                          <ShieldCheck className="h-3 w-3" /> Senior
                        </span>
                      )}
                    </div>
                    {(() => {
                      const sla = slaFor(t);
                      return (
                        <p
                          className={`mt-1 text-[11px] ${
                            sla.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                          }`}
                        >
                          {sla.label}
                        </p>
                      );
                    })()}
                    {t.context_path && (
                      <span
                        role="link"
                        tabIndex={0}
                        onClick={e => {
                          e.stopPropagation();
                          navigate(t.context_path as string);
                          setOpen(false);
                        }}
                        onKeyDown={e => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(t.context_path as string);
                            setOpen(false);
                          }
                        }}
                        className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
                      >
                        <ExternalLink className="h-3 w-3" />
                        Jump back to {t.context_label ?? 'what this was about'}
                      </span>
                    )}
                  </button>

                ))}
              </div>
            </div>
          )}

          {view === 'chat' && (ticketId || bubbles.length > 0) && (
            <div className="border-b bg-muted/30 px-3 py-2">
              <TicketTimeline
                stage={stageFromTicket(
                  resolved ? 'resolved' : tier === 'senior' ? 'escalated' : 'open',
                  tier,
                  bubbles.some(b => b.role !== 'user'),
                )}
                working={busy}
                times={stageTimes}
                contextPath={ticketContext?.path ?? null}
                contextLabel={ticketContext?.label ?? null}
              />

              {(() => {
                const sla = slaFor({
                  status: resolved ? 'resolved' : tier === 'senior' ? 'escalated' : 'open',
                  tier,
                  severity,
                  created_at: stageTimes.open ?? new Date().toISOString(),
                  escalated_at: stageTimes.escalated ?? null,
                  resolved_at: stageTimes.solved ?? null,
                });
                return (
                  <p
                    className={`mt-1.5 flex items-center gap-1 text-[10px] ${
                      sla.overdue ? 'font-medium text-destructive' : 'text-muted-foreground'
                    }`}
                  >
                    {sla.overdue ? (
                      <AlertTriangle className="h-3 w-3" />
                    ) : (
                      <Clock className="h-3 w-3" />
                    )}
                    {sla.label}
                  </p>
                );
              })()}
            </div>
          )}

          {view === 'chat' && (
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto p-3">
            {loadingThread && (
              <p className="text-sm text-muted-foreground">Opening that report…</p>
            )}
            {bubbles.length === 0 && !loadingThread && (
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

            {busy && progress && (
              <div className="space-y-1">
                <p className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="truncate">Uploading {progress.name}</span>
                  <span className="shrink-0 tabular-nums">
                    {progress.done}/{progress.total}
                  </span>
                </p>
                <Progress
                  value={progress.total ? (progress.done / progress.total) * 100 : 0}
                  className="h-1.5"
                />
              </div>
            )}

            {busy && !progress && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                {tier === 'senior' ? 'Digging into it…' : 'Looking at it…'}
              </p>
            )}

            {sendError && !busy && (
              <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-2">
                <p className="flex items-start gap-2 text-xs text-foreground">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <span>{sendError.message}</span>
                </p>
                {sendError.kind === 'send' && (
                  <p className="pl-[22px] text-[10px] text-muted-foreground">
                    Nothing already uploaded will be sent twice.
                  </p>
                )}
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={retrySend}>
                  <RotateCw className="mr-1 h-3 w-3" /> Retry
                </Button>
              </div>
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
          )}

          {view === 'chat' && !resolved && (
            <div className="space-y-2 border-t p-2">
              {files.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-2">
                    {files.map(a => {
                      const shown = redactOn
                        ? (a.manual ?? a.redacted ?? a.original)
                        : a.original;
                      return (
                        <div
                          key={a.key}
                          className={`relative h-16 w-16 overflow-hidden rounded border bg-muted ${
                            a.uploadError ? 'border-destructive' : ''
                          }`}
                          title={a.uploadError ?? a.original.name}
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
                          {a.uploadedPath && !a.working && (
                            <span className="absolute bottom-0 left-0 rounded-tr bg-background/90 p-0.5">
                              <CheckCircle2 className="h-3 w-3 text-primary" />
                            </span>
                          )}
                          {a.uploadError && !a.working && (
                            <span className="absolute bottom-0 left-0 rounded-tr bg-background/90 p-0.5">
                              <AlertTriangle className="h-3 w-3 text-destructive" />
                            </span>
                          )}
                          {a.original.type.startsWith('image/') && !a.working && !a.uploadedPath && (
                            <button
                              type="button"
                              onClick={() => setEditingKey(a.key)}
                              aria-label={`Draw masks on ${a.original.name}`}
                              title="Cover something yourself"
                              className="absolute bottom-0 right-0 rounded-tl bg-background/90 p-0.5"
                            >
                              <PenLine className="h-3 w-3 text-muted-foreground" />
                            </button>
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
                        Hide sensitive details
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {anyWorking
                          ? 'Scrubbing on this device…'
                          : redactOn
                            ? totalMasked > 0
                              ? `${totalMasked + handDrawn} item${totalMasked + handDrawn === 1 ? '' : 's'} covered · ${describeRedaction(redactPrefs)}`
                              : describeRedaction(redactPrefs) + ' · nothing found to cover'
                            : 'The screenshot will be sent exactly as-is'}
                      </p>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 shrink-0"
                          aria-label="Choose what gets hidden"
                          title="Choose what gets hidden"
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="z-[60] w-60 p-3">
                        <p className="text-xs font-medium text-foreground">What gets hidden</p>
                        <p className="mt-0.5 text-[10px] leading-tight text-muted-foreground">
                          Masking happens on this device, before anything uploads.
                        </p>
                        <div className="mt-2 space-y-2">
                          {(
                            Object.keys(REDACTION_LABELS) as (keyof typeof REDACTION_LABELS)[]
                          ).map(k => (
                            <div key={k} className="flex items-center justify-between gap-2">
                              <label htmlFor={`redact-${k}`} className="text-[11px] text-foreground">
                                {REDACTION_LABELS[k]}
                              </label>
                              <Switch
                                id={`redact-${k}`}
                                checked={redactPrefs[k]}
                                disabled={!redactOn}
                                onCheckedChange={v => toggleRedactPref(k, v)}
                              />
                            </div>
                          ))}
                        </div>
                      </PopoverContent>
                    </Popover>
                    <Switch
                      checked={redactOn}
                      onCheckedChange={setRedactOn}
                      aria-label="Hide sensitive details in screenshots"
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

      {editingAttachment && (
        <RedactionEditor
          open
          onOpenChange={o => !o && setEditingKey(null)}
          original={editingAttachment.original}
          autoRedacted={redactOn ? editingAttachment.redacted : null}
          boxes={editingAttachment.boxes ?? []}
          onSave={(boxes, composed) => {
            setFiles(prev =>
              prev.map(a =>
                a.key === editingAttachment.key
                  ? { ...a, boxes, manual: boxes.length > 0 ? composed : null }
                  : a,
              ),
            );
          }}
        />
      )}
    </>

  );
}
