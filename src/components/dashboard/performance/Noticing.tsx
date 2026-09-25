import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { HomeInsight } from '@/lib/home-insights';
import { StatusDot } from '../kit';
import type { Tone } from '../types';

/**
 * "What I'm noticing" — at most three observations, each with what changed,
 * the actual comparison and period, why it deserves a look, a Why? that
 * discloses source, calculation, and coverage, and one next step.
 * Deterministic rules over recorded rows; never described as prediction.
 */
const TONE: Record<HomeInsight['tone'], Tone> = { attention: 'attention', good: 'steady', steady: 'steady', calm: 'calm' };

export function InsightRow({ insight }: { insight: HomeInsight }) {
  return (
    <li className="border-b border-border py-3.5">
      <div className="flex items-start gap-2.5">
        <StatusDot tone={TONE[insight.tone]} className="mt-1.5" />
        <div className="min-w-0 flex-1">
          <p className={cn('text-[14px] font-semibold leading-snug', insight.tone === 'attention' && 'text-warning', insight.tone === 'good' && 'text-success')}>{insight.title}</p>
          <p className="mt-1 text-[12.5px] leading-snug">{insight.comparison}</p>
          <p className="mt-1 text-[12px] leading-snug text-muted-foreground">{insight.why}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link to={insight.next.to} className="inline-flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-primary hover:underline">
              {insight.next.label}<ArrowUpRight className="h-3 w-3" />
            </Link>
            {insight.receipts.length > 0 && (
              <details className="min-w-0">
                <summary className="cursor-pointer list-none font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">Why?</summary>
                <dl className="mt-2 space-y-2 border-l-2 border-border pl-3">
                  {insight.receipts.map(r => (
                    <div key={r.label}>
                      <div className="flex items-baseline justify-between gap-3">
                        <dt className="text-[12px] text-muted-foreground">{r.label}</dt>
                        <dd className="text-[12px] font-medium tabular-nums">{r.value}</dd>
                      </div>
                      <p className="text-[11px] leading-snug text-muted-foreground/80">{r.source}</p>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

export function Noticing({ insights, loading }: { insights: HomeInsight[] | null; loading?: boolean }) {
  if (loading || !insights) return <p className="border-b border-border py-4 text-[13px] text-muted-foreground">Reading recorded days…</p>;
  if (insights.length === 0) return <p className="border-b border-border py-4 text-[13px] text-muted-foreground">Nothing to note from the recorded days.</p>;
  return (
    <>
      <ul>{insights.map(i => <InsightRow key={i.id} insight={i} />)}</ul>
      <p className="pt-2 text-[11px] leading-snug text-muted-foreground">Fixed rules over recorded days — comparisons, goals, and open work. Not a prediction.</p>
    </>
  );
}
