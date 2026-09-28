import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  ageLabel, entryCount, groupAttention, groupHref, itemAction, itemMeta, itemTitle, itemTone,
  KIND_GROUP_LABELS, KIND_NEXT_STEP, type AttentionItem, type QueueEntry,
} from '@/lib/attention';
import type { NeedsYou as NeedsYouModel } from '@/lib/home-brief';
import { formatDate } from '@/lib/time-utils';
import { Arrow, Chip, EmptyState, Panel, SectionLabel, StatusDot, actionClass, focusRing, interactive, toneText } from './kit';

/**
 * Needs you — the same open items Attention lists, as an actionable queue
 * near the top of Home:
 *
 *  - what needs doing, its date or age, why it is the person's, and the
 *    next action, on every row;
 *  - repeated work folded into expandable categories (closeouts awaiting
 *    seal · 3, with the dates underneath), each date still its own record;
 *  - actionable items apart from items waiting on someone else and items
 *    parked until later, which are counted but never mixed in;
 *  - the header count is the unique items that need the person now — the
 *    same number the Management badge shows.
 *
 * Nothing here decides; every row lands on the exact item or the filtered
 * list. Completing it there changes the record, and the queue follows.
 */
/** One Attention item: dot, who and what, when, the next action, and why it is the person's on request. */
export function ItemRow({ item, compact }: { item: AttentionItem; compact?: boolean }) {
  const tone = itemTone(item);
  const [why, setWhy] = useState(false);
  return (
    <div data-item-key={item.key} className="flex min-h-11 items-start gap-3 border-b border-border py-3 last:border-b-0">
      <StatusDot tone={tone} className="mt-2" />
      <div className="min-w-0 flex-1">
        <Link to={`/management?item=${item.key}`} className={cn('group block rounded-md', focusRing)}>
          <span className="block text-[15px] font-medium leading-snug text-foreground group-hover:text-primary">{itemTitle(item)}</span>
          {!compact && item.detail && <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{item.detail}</span>}
        </Link>
        <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className={cn('tabular-nums', tone === 'urgent' && 'font-medium text-destructive', tone === 'attention' && 'font-medium text-[hsl(30_80%_32%)] dark:text-warning')}>{ageLabel(item) || 'open'}</span>
          <span aria-hidden>·</span>
          <span>{KIND_NEXT_STEP[item.kind]}</span>
          {item.work !== 'needs_action' && item.waitingOn && (
            <>
              <span aria-hidden>·</span>
              <span>{item.work === 'waiting_on_employee' ? `Waiting on ${item.subject.name ?? 'the person'}` : item.work === 'waiting_on_reviewer' ? 'Waiting on another reviewer' : 'Followed up'}{item.waitingOn.dueAt ? ` · follow up ${formatDate(item.waitingOn.dueAt)}` : ''}</span>
            </>
          )}
          {!compact && item.why && (
            <>
              <span aria-hidden>·</span>
              <button
                type="button"
                data-home-control="why"
                aria-expanded={why}
                onClick={() => setWhy(o => !o)}
                className={cn('inline-flex items-center gap-0.5 rounded font-medium text-primary hover:underline', interactive, focusRing)}
              >
                Why it’s yours
                <ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-150 motion-reduce:transition-none', why && 'rotate-180')} aria-hidden />
              </button>
            </>
          )}
        </span>
        {why && !compact && <span className="mt-1 block text-[13px] leading-snug text-muted-foreground">{item.why}</span>}
      </div>
      <Link to={`/management?item=${item.key}`} className={cn('group mt-1 rounded-full border border-primary/30 px-3 py-1.5 hover:bg-primary/[0.06]', actionClass, focusRing)}>
        {itemAction(item)}
        <Arrow />
      </Link>
    </div>
  );
}

/** A category of repeated work: one row with the count, the items underneath on request. */
export function GroupRow({ entry }: { entry: Extract<QueueEntry, { type: 'group' }> }) {
  const [open, setOpen] = useState(false);
  const controls = `group-${entry.kind}`;
  const oldest = entry.items.map(i => i.ageHours ?? 0).reduce((a, b) => Math.max(a, b), 0);
  const deadline = entry.items.map(i => i.deadline).find(Boolean);
  return (
    <div data-group-kind={entry.kind} className="border-b border-border py-3 last:border-b-0">
      <div className="flex min-h-11 items-start gap-3">
        <StatusDot tone={entry.tone} className="mt-2" />
        <button
          type="button"
          data-home-control="group"
          aria-expanded={open}
          aria-controls={controls}
          onClick={() => setOpen(o => !o)}
          className={cn('group min-w-0 flex-1 rounded-md text-left', focusRing)}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-medium leading-snug text-foreground group-hover:text-primary">{entry.label}</span>
            <Chip tone={entry.tone === 'calm' ? 'calm' : 'steady'}>{entry.count}</Chip>
            <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
          </span>
          <span className="mt-1 block text-[13px] text-muted-foreground">
            {deadline ? `${deadline.label}${deadline.days > 0 ? ` · ${deadline.days}d` : ''}` : oldest >= 24 ? `oldest ${Math.round(oldest / 24)}d` : oldest >= 1 ? `oldest ${Math.round(oldest)}h` : 'new'}
            <span aria-hidden> · </span>
            {entry.next}
            <span aria-hidden> · </span>
            each one is reviewed on its own
          </span>
        </button>
        <Link to={groupHref(entry.kind)} className={cn('group mt-1 rounded-full border border-primary/30 px-3 py-1.5 hover:bg-primary/[0.06]', actionClass, focusRing)}>
          Open all
          <Arrow />
        </Link>
      </div>
      {open && (
        <div id={controls} className="ml-5 mt-1 border-l-2 border-border pl-3">
          {entry.items.map(item => <ItemRow key={item.key} item={item} compact />)}
        </div>
      )}
    </div>
  );
}

export function QueueEntries({ entries }: { entries: QueueEntry[] }) {
  return (
    <>
      {entries.map(e => (e.type === 'group' ? <GroupRow key={`group:${e.kind}`} entry={e} /> : <ItemRow key={e.item.key} item={e.item} />))}
    </>
  );
}

/** A collapsed list: "Waiting on others · 2", opened on request. */
function CollapsedList({ id, label, items, note }: { id: string; label: string; items: AttentionItem[]; note: string }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="pt-3">
      <button
        type="button"
        data-home-control="collapsed"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(o => !o)}
        className={cn('flex w-full min-h-10 items-center justify-between gap-3 rounded-md text-left', focusRing)}
      >
        <span className="flex items-center gap-2">
          <SectionLabel as="span" className="text-foreground">{label}</SectionLabel>
          <Chip tone="calm">{items.length}</Chip>
          <span className="text-[13px] text-muted-foreground">{note}</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id={id} className="mt-1">
          {items.map(item => <ItemRow key={item.key} item={item} compact />)}
        </div>
      )}
    </div>
  );
}

/** The rows under a Needs you panel: the grouped queue, then what waits on others, then what is parked. */
export function NeedsYouRows({ needs, emptyTitle, emptyDetail, lead }: { needs: NeedsYouModel; emptyTitle: string; emptyDetail: string; lead?: ReactNode }) {
  const entries = groupAttention(needs.now);
  const nowCount = entryCount(entries);
  return (
    <>
      {lead}
      {nowCount > 0 ? (
        <div>
          <QueueEntries entries={entries} />
        </div>
      ) : needs.degraded ? (
        <EmptyState
          tone="error"
          title="Some records could not be read."
          detail="Attention names which. Nothing here is confirmed clear."
          action={{ label: 'Open Attention', to: '/management' }}
        />
      ) : (
        <EmptyState tone="good" title={emptyTitle} detail={emptyDetail} />
      )}
      <CollapsedList id="needs-waiting" label="Waiting on others" items={needs.waitingItems} note="still open · needs nothing from you yet" />
      <CollapsedList id="needs-parked" label="Parked" items={needs.deferredItems} note="parked or snoozed · still open, still due" />
    </>
  );
}

/** The whole panel, titled and counted with the unique items that need the person now. */
export function NeedsYouPanel({ needs, title = 'Needs you', emptyTitle, emptyDetail, lead, id = 'needs-you' }: {
  needs: NeedsYouModel; title?: string; emptyTitle: string; emptyDetail: string; lead?: ReactNode; id?: string;
}) {
  const count = needs.now.length;
  const urgent = needs.now.some(i => itemTone(i) === 'urgent');
  return (
    <Panel
      id={id}
      title={title}
      count={count}
      countTone={count > 0 ? 'steady' : 'calm'}
      tone={urgent ? 'urgent' : count > 0 ? 'attention' : undefined}
      action={{ label: 'Open Attention', to: '/management' }}
      description={count > 0 ? 'In order of consequence. Each row opens the exact record; a category opens its own list.' : undefined}
    >
      <NeedsYouRows needs={needs} emptyTitle={emptyTitle} emptyDetail={emptyDetail} lead={lead} />
    </Panel>
  );
}
