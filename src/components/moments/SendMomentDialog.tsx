import { useMemo, useState } from 'react';
import { PartyPopper } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import {
  CONTEXT_MAX,
  MESSAGE_MAX,
  REACTIONS,
  getReaction,
  groupRecipients,
  roleLabel,
  validateDraft,
  type ReactionKey,
} from '@/components/moments/reactions';
import {
  useEmployeeNameLookup,
  useMomentHistory,
  useMomentPrefs,
  useMomentRecipients,
  useMomentSettings,
  useSendMoment,
  useUpdateMomentPrefs,
} from '@/hooks/useTeamMoments';
import { useOrgContext } from '@/hooks/useOrgContext';

type Tab = 'send' | 'history' | 'settings';

/**
 * Entry point for Team Moments in the authenticated shell: send one, look back
 * at the ones you have received, and mute the motion.
 *
 * Recognition only. This is never a place for corrective feedback, required
 * acknowledgments, or anything that belongs in the accountability record.
 */
export default function SendMomentDialog() {
  const { data: ctx } = useOrgContext();
  const { data: settings } = useMomentSettings();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('send');

  if (!ctx || settings?.enabled === false) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {/* A party popper, not the envelope: the entry point reads as a
            celebration before the dialog even opens. */}
        <Button variant="ghost" size="icon" aria-label="Team moments">
          <PartyPopper className="h-5 w-5" />
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Team moments</DialogTitle>
        </DialogHeader>

        <div className="flex gap-1 border-b">
          {(['send', 'history', 'settings'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                'px-3 py-2 text-xs uppercase tracking-wide',
                tab === t ? 'border-b-2 border-primary font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {t === 'send' ? 'Send' : t === 'history' ? 'Received' : 'Preferences'}
            </button>
          ))}
        </div>

        {tab === 'send' && <SendForm allowMessage={settings?.allow_message !== false} onSent={() => setTab('history')} />}
        {tab === 'history' && <HistoryList />}
        {tab === 'settings' && <PrefsPanel />}
      </DialogContent>
    </Dialog>
  );
}

function SendForm({ allowMessage, onSent }: { allowMessage: boolean; onSent: () => void }) {
  const { data: ctx } = useOrgContext();
  const recipients = useMomentRecipients();
  const grouped = useMemo(() => groupRecipients(recipients), [recipients]);
  const send = useSendMoment();
  const [recipientId, setRecipientId] = useState('');
  const [reaction, setReaction] = useState<ReactionKey | null>(null);
  const [message, setMessage] = useState('');
  const [context, setContext] = useState('');
  const [touched, setTouched] = useState(false);

  const problems = validateDraft(
    { recipientEmployeeId: recipientId || null, reaction, message, contextLabel: context },
    { senderEmployeeId: ctx?.employee_id, allowMessage },
  );
  const problemFor = (field: string) => problems.find((p) => p.field === field)?.text;

  return (
    <form
      className="space-y-4 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        setTouched(true);
        if (problems.length > 0) return;
        const r = recipients.find((x) => x.id === recipientId);
        if (!r) return;
        send.mutate(
          {
            recipientEmployeeId: r.id,
            recipientUserId: r.userId,
            reaction: reaction as ReactionKey,
            message,
            contextLabel: context,
          },
          {
            onSuccess: () => {
              setReaction(null);
              setMessage('');
              setContext('');
              onSent();
            },
          },
        );
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="moment-recipient" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Who is this for
        </label>
        <select
          id="moment-recipient"
          value={recipientId}
          onChange={(e) => setRecipientId(e.target.value)}
          className="h-10 w-full border border-input bg-background px-3 text-sm"
        >
          <option value="">Choose a teammate, manager, or owner…</option>
          {grouped.teammates.length > 0 && (
            <optgroup label="Teammates">
              {grouped.teammates.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </optgroup>
          )}
          {grouped.leaders.length > 0 && (
            <optgroup label="Managers & owners">
              {grouped.leaders.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name} — {roleLabel(r.role)}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {touched && problemFor('recipient') && <p className="text-xs text-destructive">{problemFor('recipient')}</p>}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Reaction</legend>
        <div className="grid grid-cols-2 gap-2">
          {REACTIONS.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={reaction === r.key}
              onClick={() => setReaction(r.key)}
              className={cn(
                'flex items-center gap-2 border px-3 py-2 text-left text-sm',
                reaction === r.key ? 'border-primary bg-primary/10 font-medium' : 'border-input',
              )}
            >
              <span aria-hidden>{r.emoji}</span>
              <span>{r.label}</span>
            </button>
          ))}
        </div>
        {touched && problemFor('reaction') && <p className="text-xs text-destructive">{problemFor('reaction')}</p>}
      </fieldset>

      {allowMessage && (
        <div className="space-y-1.5">
          <label htmlFor="moment-message" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Short message <span className="normal-case">(optional)</span>
          </label>
          <Textarea
            id="moment-message"
            value={message}
            maxLength={MESSAGE_MAX}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Thank you for covering assisting yesterday."
            rows={3}
          />
          <p className="text-right text-[11px] text-muted-foreground">
            {message.trim().length}/{MESSAGE_MAX}
          </p>
          {touched && problemFor('message') && <p className="text-xs text-destructive">{problemFor('message')}</p>}
        </div>
      )}

      <div className="space-y-1.5">
        <label htmlFor="moment-context" className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Context <span className="normal-case">(optional, e.g. “Covering Assisting”)</span>
        </label>
        <Input
          id="moment-context"
          value={context}
          maxLength={CONTEXT_MAX}
          onChange={(e) => setContext(e.target.value)}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Your name is always attached. Moments are recognition only — they are never part of a performance record, and
        managers cannot browse them.
      </p>

      <Button type="submit" className="w-full" disabled={send.isPending}>
        {send.isPending ? 'Sending…' : 'Send moment'}
      </Button>
    </form>
  );
}

function HistoryList() {
  const { data, isLoading } = useMomentHistory();
  const nameOf = useEmployeeNameLookup();
  const received = data?.received ?? [];
  const sent = data?.sent ?? [];

  if (isLoading) return <p className="py-6 text-sm text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6 pt-4">
      <Section title="Received" empty="Nothing yet.">
        {received.map((m) => (
          <Row key={m.id} who={`From ${nameOf(m.sender_employee_id)}`} m={m} />
        ))}
      </Section>
      <Section title="Sent" empty="You have not sent one yet.">
        {sent.map((m) => (
          <Row key={m.id} who={`To ${nameOf(m.recipient_employee_id)}`} m={m} />
        ))}
      </Section>
    </div>
  );
}

function Section({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const items = useMemo(() => (Array.isArray(children) ? children : [children]).filter(Boolean), [children]);
  const isEmpty = items.length === 0 || (Array.isArray(children) && children.length === 0);
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {isEmpty ? (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="mt-2 divide-y border-y">{children}</ul>
      )}
    </div>
  );
}

function Row({ who, m }: { who: string; m: { reaction: string; message: string | null; context_label: string | null; created_at: string } }) {
  const r = getReaction(m.reaction);
  return (
    <li className="py-3">
      <p className="text-sm font-medium">
        <span aria-hidden className="mr-1.5">
          {r?.emoji}
        </span>
        {r?.label ?? 'Recognition'} · <span className="font-normal text-muted-foreground">{who}</span>
      </p>
      {m.message && <p className="mt-1 text-sm text-muted-foreground">“{m.message}”</p>}
      {m.context_label && <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{m.context_label}</p>}
    </li>
  );
}

function PrefsPanel() {
  const { data: prefs } = useMomentPrefs();
  const update = useUpdateMomentPrefs();
  return (
    <div className="space-y-5 pt-4">
      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Mute the opening animation</span>
          <span className="block text-xs text-muted-foreground">
            Moments still arrive — they just appear already opened.
          </span>
        </span>
        <Switch
          checked={!!prefs?.animations_muted}
          onCheckedChange={(v) => update.mutate({ animations_muted: v })}
          aria-label="Mute the opening animation"
        />
      </label>
      <label className="flex items-start justify-between gap-4">
        <span>
          <span className="block text-sm font-medium">Receive team moments</span>
          <span className="block text-xs text-muted-foreground">Turn this off and coworkers cannot send you one.</span>
        </span>
        <Switch
          checked={prefs?.receive_enabled !== false}
          onCheckedChange={(v) => update.mutate({ receive_enabled: v })}
          aria-label="Receive team moments"
        />
      </label>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Purple Envelope also respects your device's reduced-motion setting.
      </p>
    </div>
  );
}
