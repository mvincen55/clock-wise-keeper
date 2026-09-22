import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Loader2, PauseCircle, AlarmClock, MessageSquare, StickyNote, Undo2 } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useSetManagerFollowup } from '@/hooks/useManagerFollowups';
import { useEnsureDm, useSendMessage } from '@/hooks/useMessaging';
import { easternWallToUtcIso, formatDate, getToday, shiftDate } from '@/lib/time-utils';
import type { AttentionItem } from '@/lib/attention';

/**
 * Layer 2 and 3 actions. None of these corrects a record: asking moves the
 * item to "Waiting on others", parking and snoozing move it to "Later", a
 * note satisfies a rule that asks for one. Park and Snooze keep a
 * ten-second undo; nothing else does (design §5.4).
 */

const UNDO_MS = 10_000;

function nextWeekday(from: string, weekday: number): string {
  const d = new Date(`${from}T12:00:00Z`);
  const delta = (weekday - d.getUTCDay() + 7) % 7 || 7;
  return shiftDate(from, delta);
}

export function ParkButton({ item, onDone }: { item: AttentionItem; onDone?: () => void }) {
  const set = useSetManagerFollowup();
  const [custom, setCustom] = useState(false);
  const [date, setDate] = useState('');
  const today = getToday();
  const park = async (until: string, label: string) => {
    try {
      await set.mutateAsync({ item_key: item.key, parked_until: until });
      toast(`Parked until ${label} · still open`, {
        duration: UNDO_MS,
        action: { label: 'Undo', onClick: () => { void set.mutateAsync({ item_key: item.key, parked_until: null }); } },
      });
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not park this item');
    }
  };
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" disabled={set.isPending}><PauseCircle className="mr-1.5 h-4 w-4" />Park</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onClick={() => park(shiftDate(today, 1), 'tomorrow')}>Until tomorrow</DropdownMenuItem>
          <DropdownMenuItem onClick={() => park(nextWeekday(today, 5), `Fri ${formatDate(nextWeekday(today, 5)).replace(/^\w+, /, '')}`)}>Until Friday</DropdownMenuItem>
          <DropdownMenuItem onClick={() => park(nextWeekday(today, 1), 'Monday')}>Until Monday</DropdownMenuItem>
          <DropdownMenuItem onClick={() => setCustom(true)}>Pick a date…</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={custom} onOpenChange={setCustom}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Park until</DialogTitle>
            <DialogDescription>The item stays open and counted; it comes back that morning.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1">
            <Label htmlFor="park-date">Date</Label>
            <Input id="park-date" type="date" min={shiftDate(today, 1)} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCustom(false)}>Cancel</Button>
            <Button disabled={!date || date <= today || set.isPending} onClick={() => { setCustom(false); void park(date, formatDate(date)); }}>Park</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function SnoozeButton({ item, label = 'Still working', onDone }: { item: AttentionItem; label?: string; onDone?: () => void }) {
  const set = useSetManagerFollowup();
  const snooze = async (until: string, text: string) => {
    try {
      await set.mutateAsync({ item_key: item.key, snoozed_until: until });
      toast(`Reminder ${text} · still on the clock`, {
        duration: UNDO_MS,
        action: { label: 'Undo', onClick: () => { void set.mutateAsync({ item_key: item.key, snoozed_until: null }); } },
      });
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not set a reminder');
    }
  };
  const inMinutes = (m: number) => new Date(Date.now() + m * 60_000).toISOString();
  const tomorrowMorning = easternWallToUtcIso(shiftDate(getToday(), 1), 8, 0);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={set.isPending}><AlarmClock className="mr-1.5 h-4 w-4" />{label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => snooze(inMinutes(30), 'in 30 minutes')}>Remind me in 30 minutes</DropdownMenuItem>
        <DropdownMenuItem onClick={() => snooze(inMinutes(60), 'in an hour')}>Remind me in an hour</DropdownMenuItem>
        <DropdownMenuItem onClick={() => snooze(tomorrowMorning, 'tomorrow at 8:00 AM')}>Tomorrow morning</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Bring a parked or snoozed item back now, or take back an ask. */
export function BringBackButton({ item }: { item: AttentionItem }) {
  const set = useSetManagerFollowup();
  const waiting = item.work !== 'needs_action';
  return (
    <Button
      variant="ghost"
      size="sm"
      disabled={set.isPending}
      onClick={() => set.mutate(waiting
        ? { item_key: item.key, work_state: 'needs_action', owner_user_id: null, requested_at: null, due_at: null }
        : { item_key: item.key, parked_until: null, snoozed_until: null })}
    >
      <Undo2 className="mr-1.5 h-4 w-4" />{waiting ? 'Take back' : 'Bring back'}
    </Button>
  );
}

/**
 * A manager note that satisfies an office rule's follow-up. The reason or
 * answer stays owed on the person's record; only the manager step is done.
 */
export function NoteButton({ item, label = 'Add a note', onDone }: { item: AttentionItem; label?: string; onDone?: () => void }) {
  const set = useSetManagerFollowup();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const save = async () => {
    try {
      await set.mutateAsync({ item_key: item.key, work_state: 'followed_up', note: note.trim() });
      toast.success('Follow-up noted');
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the note');
    }
  };
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}><StickyNote className="mr-1.5 h-4 w-4" />{label}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add a follow-up note</DialogTitle>
            <DialogDescription>
              {item.kind === 'bypass_followup'
                ? `A note on ${item.subject.name ?? 'the person'}’s record satisfies the manager follow-up the rule asks for. The reason stays owed; the reminder continues.`
                : 'A note records what you did about this answer. The closeout itself is unchanged.'}
            </DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={e => setNote(e.target.value)} rows={4} placeholder="What you talked about and what changes." autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={note.trim().length < 3 || set.isPending} onClick={save}>
              {set.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Ask the person to explain or confirm a day. Sends them a message in
 * Inbox (communication from people) and moves the item to "Waiting on
 * others" with an owner and a follow-up date. The day stays unresolved and
 * stays a payroll issue until its record is corrected.
 */
export function AskEmployeeButton({ item, onDone }: { item: AttentionItem; onDone?: () => void }) {
  const { user } = useAuth();
  const set = useSetManagerFollowup();
  const ensureDm = useEnsureDm();
  const send = useSendMessage();
  const [open, setOpen] = useState(false);
  const name = item.subject.name ?? 'the person';
  const first = name.split(/[ ,]/)[0];
  const day = item.occurredAt && item.occurredAt.length === 10 ? formatDate(item.occurredAt) : 'that day';
  const defaultText = item.kind === 'missing_clock_out'
    ? `Hi ${first}, your clock-out on ${day} was not recorded. What time did you leave? I will fix the day once you confirm.`
    : item.kind === 'missing_day'
      ? `Hi ${first}, ${day} shows scheduled with no time recorded and no day off on file. Can you tell me what happened that day?`
      : `Hi ${first}, the punches on ${day} do not pair up. Can you walk me through your in and out times so I can correct the day?`;
  const [text, setText] = useState(defaultText);
  const [due, setDue] = useState(shiftDate(getToday(), 2));
  const canMessage = !!item.subject.userId && item.subject.userId !== user?.id;
  const [pending, setPending] = useState(false);

  const ask = async () => {
    setPending(true);
    try {
      if (canMessage && text.trim()) {
        const conversationId = await ensureDm.mutateAsync(item.subject.userId!);
        await send.mutateAsync({ conversationId, content: text.trim() });
      }
      await set.mutateAsync({
        item_key: item.key,
        work_state: 'waiting_on_employee',
        owner_user_id: item.subject.userId ?? null,
        requested_at: new Date().toISOString(),
        due_at: due,
        note: canMessage ? null : 'Asked in person (no login to message).',
      });
      toast.success(canMessage ? `Asked ${first} · waiting on the answer · still unresolved for payroll` : `Marked as asked · waiting on ${first}`);
      setOpen(false);
      onDone?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not send the request');
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}><MessageSquare className="mr-1.5 h-4 w-4" />Ask {first}</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ask {name}</DialogTitle>
            <DialogDescription>
              {canMessage
                ? `This sends ${first} a message in Inbox and moves the item to “Waiting on others”. The day stays unresolved: it still counts for payroll until the record is fixed.`
                : `${name} has no login to message. This marks the item as asked in person and moves it to “Waiting on others”. The day stays unresolved for payroll until the record is fixed.`}
            </DialogDescription>
          </DialogHeader>
          {canMessage && (
            <div className="space-y-1">
              <Label htmlFor="ask-text">Message</Label>
              <Textarea id="ask-text" value={text} onChange={e => setText(e.target.value)} rows={4} />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="ask-due">Follow up by</Label>
            <Input id="ask-due" type="date" min={getToday()} value={due} onChange={e => setDue(e.target.value)} className="w-44" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={pending || (canMessage && text.trim().length < 3) || !due} onClick={ask}>
              {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{canMessage ? 'Send request' : 'Mark as asked'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
