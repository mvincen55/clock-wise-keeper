import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MyWork, WorkItem } from '@/lib/my-work';
import { Arrow, Chip, EmptyState, Panel, SectionLabel, StatusDot, actionClass, focusRing, interactive } from './kit';

/**
 * My work — the signed-in person's own open items: what needs them now,
 * and what they are waiting on someone else for. Every row opens the exact
 * record; the count in the header is the items that need the person.
 */
export function WorkRow({ item }: { item: WorkItem }) {
  return (
    <div data-work-id={item.id} className="flex min-h-11 items-start gap-3 border-b border-border py-3 last:border-b-0">
      <StatusDot tone={item.tone} className="mt-2" />
      <div className="min-w-0 flex-1">
        <Link to={item.href} className={cn('group block rounded-md', focusRing)}>
          <span className="block text-[15px] font-medium leading-snug text-foreground group-hover:text-primary">{item.title}</span>
          <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">{item.detail}</span>
        </Link>
        {item.when && <span className="mt-1 block text-[13px] tabular-nums text-muted-foreground">{item.when}</span>}
      </div>
      <Link to={item.href} className={cn('group mt-1 rounded-full border border-primary/30 px-3 py-1.5 hover:bg-primary/[0.06]', actionClass, focusRing)}>
        {item.action}
        <Arrow />
      </Link>
    </div>
  );
}

function WaitingList({ items }: { items: WorkItem[] }) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  return (
    <div className="pt-3">
      <button
        type="button"
        data-home-control="collapsed"
        aria-expanded={open}
        aria-controls="work-waiting"
        onClick={() => setOpen(o => !o)}
        className={cn('flex w-full min-h-10 items-center justify-between gap-3 rounded-md text-left', focusRing, interactive)}
      >
        <span className="flex items-center gap-2">
          <SectionLabel as="span" className="text-foreground">Waiting on someone else</SectionLabel>
          <Chip tone="calm">{items.length}</Chip>
          <span className="text-[13px] text-muted-foreground">needs nothing from you</span>
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform duration-150 motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open && (
        <div id="work-waiting" className="mt-1">
          {items.map(i => <WorkRow key={i.id} item={i} />)}
        </div>
      )}
    </div>
  );
}

export function MyWorkPanel({ work, title = 'Needs you', emptyTitle, emptyDetail, id = 'my-work', description }: {
  work: MyWork; title?: string; emptyTitle: string; emptyDetail: string; id?: string; description?: string;
}) {
  const count = work.now.length;
  const urgent = work.now.some(i => i.tone === 'urgent');
  return (
    <Panel
      id={id}
      title={title}
      count={count}
      countTone={count > 0 ? 'steady' : 'calm'}
      tone={urgent ? 'urgent' : count > 0 ? 'attention' : undefined}
      description={count > 0 ? description : undefined}
    >
      {count > 0 ? (
        <div>{work.now.map(i => <WorkRow key={i.id} item={i} />)}</div>
      ) : (
        <EmptyState tone="good" title={emptyTitle} detail={emptyDetail} />
      )}
      <WaitingList items={work.waiting} />
    </Panel>
  );
}
