import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDate } from '@/lib/time-utils';
import {
  ageLabel, itemTone, KIND_GROUP_LABELS, KIND_NEXT_STEP, type AttentionItem, type AttentionKind, type AttentionVerb,
} from '@/lib/attention';
import { Chip, StatusDot, focusRing, interactive, panelClass } from '@/components/dashboard/kit';
import AttentionPanel, { type DoneRecord } from './AttentionPanel';
import ReversalButton from './ReversalButton';

/**
 * Attention: the one triaged queue (design §5). A flat list by consequence,
 * three labeled subsets (now · waiting on others · later), filters by verb
 * that never reorder, a filtered view by kind when Home hands one over
 * (`?kind=close_day_unsealed` from a grouped row), and a panel that hosts
 * the canonical editor for the selected item. Zero items is one sentence.
 * The same row vocabulary as Home: dot, who and what, when, the next step.
 */

const VERB_LABEL: Record<AttentionVerb, string> = { decide: 'Decide', fix: 'Fix', follow_up: 'Follow up' };
const FILTERS: { id: 'all' | AttentionVerb; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'decide', label: 'Decide' }, { id: 'fix', label: 'Fix' }, { id: 'follow_up', label: 'Follow up' },
];
const isVerb = (v: string | null): v is AttentionVerb => v === 'decide' || v === 'fix' || v === 'follow_up';
const isKind = (v: string | null): v is AttentionKind => !!v && v in KIND_GROUP_LABELS;

export function AttentionRowButton({ item, selected, onSelect, rowRef, deferredLabel }: {
  item: AttentionItem; selected: boolean; onSelect: () => void; rowRef?: (el: HTMLButtonElement | null) => void; deferredLabel?: string;
}) {
  const tone = itemTone(item);
  return (
    <button
      ref={rowRef}
      type="button"
      data-item-key={item.key}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={cn(
        'flex w-full min-h-11 items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-muted/60', interactive, focusRing,
        selected && 'bg-primary/[0.06] ring-1 ring-primary/30',
      )}
    >
      <StatusDot tone={tone} className="mt-2" />
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] leading-snug">
          {item.subject.name && <span className="font-medium">{item.subject.name} · </span>}
          <span className={item.subject.name ? '' : 'font-medium'}>{item.label}</span>
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
          {deferredLabel ?? VERB_LABEL[item.verb]} · {KIND_NEXT_STEP[item.kind]}
          {item.deadline ? ` · ${item.deadline.label}` : ''}
        </span>
        {item.work !== 'needs_action' && item.waitingOn && (
          <span className="block text-[13px] leading-snug text-muted-foreground">
            {item.work === 'waiting_on_employee' ? `Waiting on ${item.subject.name ?? 'the person'}` : item.work === 'waiting_on_reviewer' ? 'Waiting on another reviewer' : 'Followed up'}
            {item.waitingOn.dueAt ? ` · follow up ${formatDate(item.waitingOn.dueAt)}` : ''}
            {item.payroll ? ' · still unresolved for payroll' : ''}
          </span>
        )}
      </span>
      <span className={cn('shrink-0 text-[13px] tabular-nums', tone === 'urgent' ? 'font-medium text-destructive' : tone === 'attention' ? 'font-medium text-[hsl(30_80%_32%)] dark:text-warning' : 'text-muted-foreground')}>{ageLabel(item)}</span>
    </button>
  );
}

function ListHeading({ label, count, note }: { label: string; count: number; note?: string }) {
  return (
    <h2 className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 text-[15px] font-semibold">
      {label} <span className="font-normal text-muted-foreground">{count}</span>
      {note && <span className="text-[13px] font-normal text-muted-foreground">{note}</span>}
    </h2>
  );
}

export default function AttentionRoom() {
  const attention = useAttentionItems();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const linkedItem = params.get('item');
  const linkedRecord = params.get('record');
  const kindParam = params.get('kind');
  const [filter, setFilter] = useState<'all' | AttentionVerb>(isVerb(kindParam) ? kindParam : 'all');
  const [kindFilter, setKindFilter] = useState<AttentionKind | null>(isKind(kindParam) ? kindParam : null);
  const [selectedKey, setSelectedKey] = useState<string | null>(linkedItem ?? (linkedRecord ? `record_signoff:${linkedRecord}` : null));
  const [done, setDone] = useState<DoneRecord[]>([]);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastRow = useRef<string | null>(null);

  // A deep link opens the exact item or the filtered list, then leaves the address bar.
  useEffect(() => {
    if (!linkedItem && !linkedRecord && !kindParam) return;
    if (linkedItem) setSelectedKey(linkedItem);
    else if (linkedRecord) setSelectedKey(`record_signoff:${linkedRecord}`);
    if (isVerb(kindParam)) setFilter(kindParam);
    if (isKind(kindParam)) setKindFilter(kindParam);
    setParams(prev => { const next = new URLSearchParams(prev); next.delete('item'); next.delete('record'); next.delete('kind'); return next; }, { replace: true });
  }, [linkedItem, linkedRecord, kindParam, setParams]);

  const byKey = useMemo(() => new Map(attention.unresolved.map(i => [i.key, i])), [attention.unresolved]);
  const selected = selectedKey ? byKey.get(selectedKey) ?? null : null;
  const matches = (i: AttentionItem) => (filter === 'all' || i.verb === filter) && (!kindFilter || i.kind === kindFilter);
  const now = attention.needsNow.filter(matches);
  const waiting = attention.waiting.filter(matches);
  const later = attention.deferred.filter(matches);
  const visible = [...now, ...waiting, ...later];

  const select = (key: string) => { lastRow.current = key; setSelectedKey(key); };
  const close = () => {
    setSelectedKey(null);
    const el = lastRow.current ? rowRefs.current.get(lastRow.current) : null;
    el?.focus();
  };
  const markDone = (record: DoneRecord) => setDone(prev => [record, ...prev.filter(d => d.key !== record.key)]);

  // Arrow keys move between rows; Enter opens; Escape closes the panel.
  const onListKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = visible.map(i => i.key);
    const active = document.activeElement as HTMLElement | null;
    const current = active?.dataset.itemKey ?? null;
    const idx = current ? keys.indexOf(current) : -1;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = keys[Math.min(keys.length - 1, Math.max(0, idx + (e.key === 'ArrowDown' ? 1 : -1)))];
      if (next) rowRefs.current.get(next)?.focus();
    } else if (e.key === 'Escape' && selectedKey) {
      e.preventDefault();
      close();
    }
  };

  const setRef = (key: string) => (el: HTMLButtonElement | null) => { if (el) rowRefs.current.set(key, el); else rowRefs.current.delete(key); };
  const parkedSoonest = later.map(i => i.parkedUntil ?? i.snoozedUntil).filter((v): v is string => !!v).sort()[0];
  const quiet = attention.unresolved.length === 0;
  const kindCount = kindFilter ? attention.unresolved.filter(i => i.kind === kindFilter).length : 0;

  const panel = selected ? (
    <AttentionPanel key={selected.key} item={selected} onClose={close} onDone={markDone} />
  ) : selectedKey ? (
    <div className={cn(panelClass, 'p-4 text-[14px] text-muted-foreground')}>
      This item is no longer open. {done.find(d => d.key === selectedKey)?.text ?? 'Its record has changed since the link was made.'}
      <button type="button" className={cn('ml-2 font-medium text-primary underline-offset-4 hover:underline', focusRing)} onClick={close}>Back to the list</button>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[1.6rem] font-bold leading-tight tracking-[-0.02em]">Attention</h1>
          <p className="mt-1 text-[14.5px] text-muted-foreground">
            {attention.enabled && attention.counts.unresolved > 0
              ? `${attention.counts.needsNow} need you now · ${attention.counts.waiting} waiting on others · ${attention.counts.deferred} later`
              : 'What needs you, in order of consequence.'}
          </p>
        </div>
        <div role="group" aria-label="Filter by kind" className="flex flex-wrap gap-1.5">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                'min-h-9 rounded-full px-3.5 text-[13.5px] font-medium', interactive, focusRing,
                filter === f.id ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground/80 hover:text-foreground',
              )}
            >
              {f.label}{f.id !== 'all' ? ` ${attention.counts.byVerb[f.id] || ''}`.trimEnd() : ''}
            </button>
          ))}
        </div>
      </div>

      {kindFilter && (
        <div className="flex flex-wrap items-center gap-2" data-testid="kind-filter">
          <Chip tone="steady">Showing: {KIND_GROUP_LABELS[kindFilter].group} · {kindCount}</Chip>
          <button
            type="button"
            onClick={() => setKindFilter(null)}
            className={cn('inline-flex min-h-8 items-center gap-1 rounded-full px-2.5 text-[13.5px] font-medium text-primary hover:bg-primary/[0.06]', interactive, focusRing)}
          >
            <X className="h-3.5 w-3.5" aria-hidden />Show everything
          </button>
        </div>
      )}

      {attention.degradedSources.length > 0 && (
        <p className="flex items-start gap-2 rounded-lg border border-warning/50 bg-warning/10 px-3 py-2.5 text-[14px]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            {attention.degradedSources.some(d => d.status.state === 'loading') ? 'Still reading ' : 'Could not read '}
            {attention.degradedSources.map(d => d.name).join(', ')}. Anything from those records is not listed yet; this is not “nothing to report”.
          </span>
        </p>
      )}

      <p className="text-[13px] text-muted-foreground">Order: a coverage or safety issue first, then the soonest deadline, then decisions, fixes, follow-ups, oldest first. Filters never reorder.</p>

      <div className={`grid gap-6 ${!isMobile && selected ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
        <div role="list" aria-label="Attention items" onKeyDown={onListKeyDown} className={cn(panelClass, 'space-y-5 px-2 py-3')}>
          {!attention.enabled ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : quiet ? (
            <p className="px-3 py-5 text-[15px]">
              Nothing waiting.{attention.degradedSources.length ? ' (Some sources are still loading.)' : ''}
            </p>
          ) : (
            <>
              <section aria-label="Needs you now" className="space-y-1">
                <ListHeading label="Now" count={now.length} />
                {now.length === 0 && (
                  <p className="px-3 text-[14px] text-muted-foreground">
                    Nothing needs you now.{later.length ? ` ${later.length} parked${parkedSoonest ? ` until ${parkedSoonest.length === 10 ? formatDate(parkedSoonest) : 'later today'}` : ''}.` : ''}
                  </p>
                )}
                {now.map(i => <AttentionRowButton key={i.key} item={i} selected={i.key === selectedKey} onSelect={() => select(i.key)} rowRef={setRef(i.key)} />)}
              </section>
              {waiting.length > 0 && (
                <section aria-label="Waiting on others" className="space-y-1">
                  <ListHeading label="Waiting on others" count={waiting.length} note="still open · still counted" />
                  {waiting.map(i => <AttentionRowButton key={i.key} item={i} selected={i.key === selectedKey} onSelect={() => select(i.key)} rowRef={setRef(i.key)} deferredLabel="Waiting" />)}
                </section>
              )}
              {later.length > 0 && (
                <section aria-label="Later" className="space-y-1">
                  <ListHeading label="Later" count={later.length} note="parked or snoozed · still open · still due" />
                  {later.map(i => <AttentionRowButton key={i.key} item={i} selected={i.key === selectedKey} onSelect={() => select(i.key)} rowRef={setRef(i.key)} deferredLabel={i.parkedUntil ? `Parked until ${formatDate(i.parkedUntil)}` : 'Snoozed'} />)}
                </section>
              )}
            </>
          )}
          {done.length > 0 && (
            <section aria-label="Done today" className="space-y-1">
              <ListHeading label="Done today" count={done.length} />
              {done.map(d => (
                <div key={d.key} className="flex items-start gap-3 rounded-lg px-3 py-2 text-[14px]">
                  <StatusDot tone="steady" className="mt-2" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{d.label}</span> <span className="text-muted-foreground">· {d.text} · {d.at}</span>
                    {d.reversal && d.reversal.kind === 'none' && <span className="block text-[13px] text-muted-foreground">Reversal: {d.reversal.label}</span>}
                    {d.reversal && d.reversal.kind !== 'none' && <ReversalButton reversal={d.reversal} onReversed={text => setDone(prev => prev.map(x => x.key === d.key ? { ...x, text: `${x.text} · ${text}`, reversal: undefined } : x))} />}
                  </span>
                </div>
              ))}
            </section>
          )}
        </div>

        {!isMobile && selected && <aside className="md:sticky md:top-4 md:self-start">{panel}</aside>}
        {!isMobile && !selected && selectedKey && <aside>{panel}</aside>}
      </div>

      {isMobile && (
        <Sheet open={!!selectedKey} onOpenChange={open => { if (!open) close(); }}>
          <SheetContent side="bottom" className="max-h-[90dvh] overflow-y-auto rounded-t-2xl">
            <SheetHeader className="text-left"><SheetTitle className="sr-only">Attention item</SheetTitle></SheetHeader>
            {panel}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
