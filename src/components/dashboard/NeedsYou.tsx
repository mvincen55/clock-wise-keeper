import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { ageLabel, itemAction, itemTone, type AttentionItem } from '@/lib/attention';
import type { NeedsYou as NeedsYouModel } from '@/lib/home-brief';
import { EmptyState, StatusDot } from './kit';

/**
 * Needs you — the first three Attention items in consequence order, one
 * navigation action each (Review for a decision, Open otherwise), then
 * "n more". Owner and Manager Home share these rows so an item never reads
 * two ways. Nothing here decides; every row lands on the exact item.
 */
export const actionClass =
  'inline-flex shrink-0 items-center gap-1 font-mono text-[10px] uppercase tracking-[0.12em] text-primary';
export const arrow = <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" />;

/** One Attention item: dot, who and what, age or deadline, one navigation action. */
export function ItemRow({ item }: { item: AttentionItem }) {
  return (
    <Link
      to={`/management?item=${item.key}`}
      data-item-key={item.key}
      className="group flex items-center gap-3 border-b border-border py-3 transition-colors hover:bg-muted/60"
    >
      <StatusDot tone={itemTone(item)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14px] font-medium leading-snug">
          {item.subject.name ? `${item.subject.name} · ` : ''}
          {item.label}
        </span>
        {item.detail && (
          <span className="block truncate text-[12.5px] leading-snug text-muted-foreground">{item.detail}</span>
        )}
      </span>
      <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-muted-foreground">{ageLabel(item)}</span>
      <span className={actionClass}>
        {itemAction(item)}
        {arrow}
      </span>
    </Link>
  );
}

/** The rows under a Needs you band: top items, the overflow line, and the honest empty states. */
export function NeedsYouRows({ needs, emptyTitle, emptyDetail }: { needs: NeedsYouModel; emptyTitle: string; emptyDetail: string }) {
  const nowCount = needs.top.length + needs.more;
  const alsoOpen = [
    needs.waiting > 0 && `${needs.waiting} waiting on others`,
    needs.deferred > 0 && `${needs.deferred} parked`,
  ].filter(Boolean).join(' · ');
  return (
    <>
      {needs.top.map(item => <ItemRow key={item.key} item={item} />)}
      {needs.more > 0 && (
        <Link
          to="/management"
          className="group flex items-center justify-between gap-3 border-b border-border py-3 text-[13px] text-muted-foreground transition-colors hover:bg-muted/60"
        >
          <span>{needs.more} more need{needs.more === 1 ? 's' : ''} you now</span>
          <span className={actionClass}>Open Attention{arrow}</span>
        </Link>
      )}
      {nowCount > 0 && alsoOpen && (
        <Link to="/management" className="block border-b border-border py-2.5 text-[12px] text-muted-foreground hover:underline">
          {alsoOpen}
        </Link>
      )}
      {nowCount === 0 && (
        needs.degraded ? (
          <EmptyState
            tone="neutral"
            title="Some sources could not be read."
            detail="Attention names which. Nothing here is confirmed clear."
            action={{ label: 'Open Attention', to: '/management' }}
          />
        ) : (
          <EmptyState tone="good" title={emptyTitle} detail={alsoOpen ? `${alsoOpen}. ${emptyDetail}` : emptyDetail} />
        )
      )}
    </>
  );
}
