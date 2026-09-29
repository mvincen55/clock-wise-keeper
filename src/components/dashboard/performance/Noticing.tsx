import { cn } from '@/lib/utils';
import type { HomeInsight } from '@/lib/home-insights';
import { ActionLink, Chip, LoadingLines, StatusDot } from '../kit';
import type { Tone } from '../types';

/**
 * "Worth a look" — at most three observations, each a card with what was
 * observed, what it means, and one next step. Receipts (source,
 * calculation, coverage) stay behind "Why?" so the row reads in a glance.
 * Deterministic rules over recorded rows; never described as prediction.
 */
const TONE: Record<HomeInsight['tone'], Tone> = { attention: 'attention', good: 'steady', steady: 'steady', calm: 'calm' };

export function InsightCard({ insight }: { insight: HomeInsight }) {
  const tone = TONE[insight.tone];
  return (
    <li className={cn('flex min-w-0 flex-col rounded-lg border border-border bg-card p-4', insight.tone === 'attention' && 'border-warning/40', insight.tone === 'good' && 'border-success/30')}>
      <div className="flex items-start gap-2.5">
        <StatusDot tone={tone} className="mt-[7px]" />
        <p className="text-[15px] font-semibold leading-snug">{insight.title}</p>
      </div>
      <p className="mt-2 text-[13.5px] leading-snug text-foreground/85">{insight.comparison}</p>
      <p className="mt-1.5 text-[13.5px] leading-snug text-muted-foreground">{insight.why}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <ActionLink to={insight.next.to} variant="secondary" size="sm">{insight.next.label}</ActionLink>
        <Chip tone="calm">{insight.basis === 'estimate' ? 'Estimate' : 'Observed'}</Chip>
        {insight.receipts.length > 0 && (
          <details className="min-w-0 basis-full">
            <summary className="cursor-pointer list-none text-[13px] font-medium text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">Why?</summary>
            <dl className="mt-2 space-y-2 border-l-2 border-border pl-3">
              {insight.receipts.map(r => (
                <div key={r.label}>
                  <div className="flex items-baseline justify-between gap-3">
                    <dt className="text-[13px] text-muted-foreground">{r.label}</dt>
                    <dd className="text-[13px] font-medium tabular-nums">{r.value}</dd>
                  </div>
                  <p className="text-[12.5px] leading-snug text-muted-foreground/80">{r.source}</p>
                </div>
              ))}
            </dl>
          </details>
        )}
      </div>
    </li>
  );
}

export function Noticing({ insights, loading }: { insights: HomeInsight[] | null; loading?: boolean }) {
  if (loading || !insights) return <LoadingLines label="Reading recorded days…" />;
  if (insights.length === 0) {
    return <p className="py-2 text-[14px] text-muted-foreground">Nothing else to note from the recorded days. The meters above carry this month’s pace.</p>;
  }
  return (
    // One card per row in a narrow column (the sidebar); side by side only
    // when the container itself is wide — a query on the wrapper's width,
    // never the viewport's.
    <div className="[container-type:inline-size]">
      <ul className={cn('grid gap-3', insights.length > 1 && '[@container(min-width:40rem)]:grid-cols-2', insights.length > 2 && '[@container(min-width:60rem)]:grid-cols-3')}>
        {insights.map(i => <InsightCard key={i.id} insight={i} />)}
      </ul>
    </div>
  );
}
