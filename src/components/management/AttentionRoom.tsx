import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAttentionItems } from '@/hooks/useAttentionItems';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { formatDate } from '@/lib/time-utils';
import type { AttentionItem, AttentionVerb } from '@/lib/attention';
import AttentionPanel, { type DoneRecord } from './AttentionPanel';
import ReversalButton from './ReversalButton';

/**
 * Attention: the one triaged queue (design §5). A flat list by consequence,
 * three labeled subsets (now · waiting on others · later), filters by verb
 * that never reorder, and a panel that hosts the canonical editor for the
 * selected item. Zero items is one sentence.
 */

const VERB_LABEL: Record<AttentionVerb, string> = { decide: 'Decide', fix: 'Fix', follow_up: 'Follow up' };
const FILTERS: { id: 'all' | AttentionVerb; label: string }[] = [
  { id: 'all', label: 'All' }, { id: 'decide', label: 'Decide' }, { id: 'fix', label: 'Fix' }, { id: 'follow_up', label: 'Follow up' },
];

function ageLabel(item: AttentionItem): string {
  if (item.deadline) return item.deadline.days === 0 ? item.deadline.label : `${item.deadline.label} · ${item.deadline.days}d`;
  const h = item.ageHours;
  if (h === null) return '';
  if (h < 1) return 'now';
  if (h < 24) return `${Math.round(h)}h`;
  return `${Math.round(h / 24)}d`;
}

function Dot({ item }: { item: AttentionItem }) {
  const tone = item.coverage ? 'bg-destructive' : item.deadline && item.deadline.days <= 1 ? 'bg-warning' : item.verb === 'follow_up' ? 'bg-muted-foreground/50' : 'bg-primary';
  return <span aria-hidden className={`mt-2 h-2 w-2 shrink-0 rounded-full ${tone}`} />;
}

export function AttentionRowButton({ item, selected, onSelect, rowRef, deferredLabel }: {
  item: AttentionItem; selected: boolean; onSelect: () => void; rowRef?: (el: HTMLButtonElement | null) => void; deferredLabel?: string;
}) {
  return (
    <button
      ref={rowRef}
      type="button"
      data-item-key={item.key}
      aria-current={selected ? 'true' : undefined}
      onClick={onSelect}
      className={`flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected ? 'bg-muted' : ''}`}
    >
      <Dot item={item} />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{deferredLabel ?? VERB_LABEL[item.verb]}</span>
          {item.subject.name && <span className="font-medium">{item.subject.name}</span>}
          <span className="text-sm text-muted-foreground">·</span>
          <span className="text-sm">{item.label}</span>
        </span>
        {item.work !== 'needs_action' && item.waitingOn && (
          <span className="block text-xs text-muted-foreground">
            {item.work === 'waiting_on_employee' ? `Waiting on ${item.subject.name ?? 'the person'}` : item.work === 'waiting_on_reviewer' ? 'Waiting on another reviewer' : 'Followed up'}
            {item.waitingOn.dueAt ? ` · follow up ${formatDate(item.waitingOn.dueAt)}` : ''}
            {item.payroll ? ' · still unresolved for payroll' : ''}
          </span>
        )}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{ageLabel(item)}</span>
    </button>
  );
}

export default function AttentionRoom() {
  const attention = useAttentionItems();
  const isMobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const linkedItem = params.get('item');
  const linkedRecord = params.get('record');
  const kindParam = params.get('kind');
  const [filter, setFilter] = useState<'all' | AttentionVerb>(kindParam === 'decide' || kindParam === 'fix' || kindParam === 'follow_up' ? kindParam : 'all');
  const [selectedKey, setSelectedKey] = useState<string | null>(linkedItem ?? (linkedRecord ? `record_signoff:${linkedRecord}` : null));
  const [done, setDone] = useState<DoneRecord[]>([]);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const lastRow = useRef<string | null>(null);

  // A deep link opens the exact item, then leaves the address bar.
  useEffect(() => {
    if (!linkedItem && !linkedRecord && !kindParam) return;
    if (linkedItem) setSelectedKey(linkedItem);
    else if (linkedRecord) setSelectedKey(`record_signoff:${linkedRecord}`);
    if (kindParam === 'decide' || kindParam === 'fix' || kindParam === 'follow_up') setFilter(kindParam);
    setParams(prev => { const next = new URLSearchParams(prev); next.delete('item'); next.delete('record'); next.delete('kind'); return next; }, { replace: true });
  }, [linkedItem, linkedRecord, kindParam, setParams]);

  const byKey = useMemo(() => new Map(attention.unresolved.map(i => [i.key, i])), [attention.unresolved]);
  const selected = selectedKey ? byKey.get(selectedKey) ?? null : null;
  const matches = (i: AttentionItem) => filter === 'all' || i.verb === filter;
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

  const panel = selected ? (
    <AttentionPanel key={selected.key} item={selected} onClose={close} onDone={markDone} />
  ) : selectedKey ? (
    <div className="rounded-lg border p-4 text-sm text-muted-foreground">
      This item is no longer open. {done.find(d => d.key === selectedKey)?.text ?? 'Its record has changed since the link was made.'}
      <button type="button" className="ml-2 underline" onClick={close}>Back to the list</button>
    </div>
  ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Attention</h1>
          <p className="text-sm text-muted-foreground">
            {attention.enabled && attention.counts.unresolved > 0
              ? `${attention.counts.needsNow} need you now · ${attention.counts.waiting} waiting on others · ${attention.counts.deferred} later`
              : 'What needs you, in order of consequence.'}
          </p>
        </div>
        <div role="group" aria-label="Filter by kind" className="flex gap-1">
          {FILTERS.map(f => (
            <button
              key={f.id}
              type="button"
              aria-pressed={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`min-h-9 rounded-md px-3 text-sm ${filter === f.id ? 'bg-muted font-medium' : 'text-muted-foreground hover:bg-muted/60'}`}
            >
              {f.label}{f.id !== 'all' ? ` ${attention.counts.byVerb[f.id] || ''}`.trimEnd() : ''}
            </button>
          ))}
        </div>
      </div>

      {attention.degradedSources.length > 0 && (
        <p className="flex items-start gap-2 rounded-md border border-warning/50 bg-warning/10 px-3 py-2 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
          <span>
            {attention.degradedSources.some(d => d.status.state === 'loading') ? 'Still reading ' : 'Could not read '}
            {attention.degradedSources.map(d => d.name).join(', ')}. Anything from those records is not listed yet; this is not “nothing to report”.
          </span>
        </p>
      )}

      <p className="text-xs text-muted-foreground">Order: a coverage or safety issue first, then the soonest deadline, then decisions, fixes, follow-ups, oldest first. Filters never reorder.</p>

      <div className={`grid gap-6 ${!isMobile && selected ? 'md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]' : ''}`}>
        <div role="list" aria-label="Attention items" onKeyDown={onListKeyDown} className="space-y-5">
          {!attention.enabled ? (
            <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : quiet ? (
            <p className="rounded-lg border px-4 py-6 text-sm">
              Nothing waiting.{attention.degradedSources.length ? ' (Some sources are still loading.)' : ''}
            </p>
          ) : (
            <>
              <section aria-label="Needs you now" className="space-y-1">
                <h2 className="flex items-baseline gap-2 px-3 text-sm font-semibold">Now <span className="text-muted-foreground font-normal">{now.length}</span></h2>
                {now.length === 0 && (
                  <p className="px-3 text-sm text-muted-foreground">
                    Nothing needs you now.{later.length ? ` ${later.length} parked${parkedSoonest ? ` until ${parkedSoonest.length === 10 ? formatDate(parkedSoonest) : 'later today'}` : ''}.` : ''}
                  </p>
                )}
                {now.map(i => <AttentionRowButton key={i.key} item={i} selected={i.key === selectedKey} onSelect={() => select(i.key)} rowRef={setRef(i.key)} />)}
              </section>
              {waiting.length > 0 && (
                <section aria-label="Waiting on others" className="space-y-1">
                  <h2 className="flex items-baseline gap-2 px-3 text-sm font-semibold">Waiting on others <span className="text-muted-foreground font-normal">{waiting.length}</span><span className="text-xs font-normal text-muted-foreground">still open · still counted</span></h2>
                  {waiting.map(i => <AttentionRowButton key={i.key} item={i} selected={i.key === selectedKey} onSelect={() => select(i.key)} rowRef={setRef(i.key)} deferredLabel="Waiting" />)}
                </section>
              )}
              {later.length > 0 && (
                <section aria-label="Later" className="space-y-1">
                  <h2 className="flex items-baseline gap-2 px-3 text-sm font-semibold">Later <span className="text-muted-foreground font-normal">{later.length}</span><span className="text-xs font-normal text-muted-foreground">parked or snoozed · still open · still due</span></h2>
                  {later.map(i => <AttentionRowButton key={i.key} item={i} selected={i.key === selectedKey} onSelect={() => select(i.key)} rowRef={setRef(i.key)} deferredLabel={i.parkedUntil ? `Parked until ${formatDate(i.parkedUntil)}` : 'Snoozed'} />)}
                </section>
              )}
            </>
          )}
          {done.length > 0 && (
            <section aria-label="Done today" className="space-y-1">
              <h2 className="flex items-baseline gap-2 px-3 text-sm font-semibold">Done today <span className="text-muted-foreground font-normal">{done.length}</span></h2>
              {done.map(d => (
                <div key={d.key} className="flex items-start gap-3 rounded-lg px-3 py-2 text-sm">
                  <span aria-hidden className="mt-2 h-2 w-2 shrink-0 rounded-full bg-success" />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium">{d.label}</span> <span className="text-muted-foreground">· {d.text} · {d.at}</span>
                    {d.reversal && d.reversal.kind === 'none' && <span className="block text-xs text-muted-foreground">Reversal: {d.reversal.label}</span>}
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
