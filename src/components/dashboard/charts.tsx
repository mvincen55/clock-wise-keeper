import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Series } from './types';
import { MicroLabel } from './kit';

/**
 * Charts, hand-drawn in SVG so they stay sharp, high-contrast, and on-brand.
 *
 * Rules enforced here, not left to the caller:
 *  - every chart states the QUESTION it answers,
 *  - every chart links into the workflow that changes the number,
 *  - a chart with no real data renders an honest empty state rather than
 *    inventing a shape.
 */

function readout(series: Series): string {
  const pts = series.points;
  if (pts.length === 0) return '—';
  const last = pts[pts.length - 1];
  switch (series.format) {
    case 'percent': {
      const total = pts.reduce((a, p) => a + (p.of ?? 0), 0);
      const done = pts.reduce((a, p) => a + p.value, 0);
      return total > 0 ? `${Math.round((done / total) * 100)}%` : '—';
    }
    case 'hours': {
      const sum = pts.reduce((a, p) => a + p.value, 0);
      return `${Math.round(sum * 10) / 10}h`;
    }
    default:
      return String(last.value);
  }
}

/**
 * Column trend. Each column can carry an "of" ceiling (e.g. scheduled people,
 * assigned items) drawn as a pale backdrop, so the reader sees ratio and volume
 * at once without a second chart.
 */
export function TrendChart({ series, className }: { series: Series; className?: string }) {
  const pts = series.points;
  const ceiling = Math.max(1, ...pts.map(p => Math.max(p.value, p.of ?? 0)));
  const hasData = pts.some(p => p.value > 0 || (p.of ?? 0) > 0);

  return (
    <section className={cn('min-w-0', className)}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b-2 border-foreground pb-2">
        <MicroLabel className="text-foreground/70">{series.title}</MicroLabel>
        {series.href && (
          <Link
            to={series.href}
            className="group inline-flex items-center gap-1 font-mono text-[10px] uppercase tracking-[0.14em] text-primary hover:underline"
          >
            Open
            <ArrowUpRight className="h-3 w-3 transition-transform group-hover:-translate-y-0.5" />
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 pt-4">
        <div className="min-w-0">
          <p className="font-display text-[clamp(2rem,5vw,2.9rem)] font-extrabold leading-[0.85] tabular-nums tracking-[-0.03em]">
            {hasData ? readout(series) : '—'}
          </p>
          <p className="mt-2 max-w-[34ch] text-[12.5px] leading-snug text-muted-foreground">{series.caption}</p>
        </div>
        <p className="max-w-[26ch] text-right font-mono text-[10px] uppercase leading-relaxed tracking-[0.12em] text-muted-foreground">
          {series.question}
        </p>
      </div>

      {hasData ? (
        <>
          <div
            className="mt-5 flex h-24 items-end gap-[3px] border-b border-foreground sm:h-28"
            role="img"
            aria-label={`${series.title}. ${series.caption}`}
          >
            {pts.map((p, i) => {
              const of = p.of ?? 0;
              return (
                <div key={`${p.x}-${i}`} className="relative flex h-full min-w-0 flex-1 items-end">
                  {of > 0 && (
                    <div
                      className="absolute inset-x-0 bottom-0 bg-muted"
                      style={{ height: `${(of / ceiling) * 100}%` }}
                    />
                  )}
                  <div
                    className={cn(
                      'relative w-full transition-[height] duration-700',
                      p.muted ? 'bg-muted-foreground/30' : 'bg-primary',
                    )}
                    style={{ height: `${Math.max(p.value > 0 ? 3 : 0, (p.value / ceiling) * 100)}%` }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9.5px] uppercase tracking-[0.12em] text-muted-foreground">
            <span>{pts[0]?.x}</span>
            <span>{pts[pts.length - 1]?.x}</span>
          </div>
        </>
      ) : (
        <p className="mt-5 border-b border-border pb-5 text-[13px] text-muted-foreground">
          Nothing recorded in this window yet. The trend appears once the office has data.
        </p>
      )}

      {series.footnote && (
        <p className="mt-2.5 text-[12px] leading-snug text-muted-foreground">{series.footnote}</p>
      )}
    </section>
  );
}

/** Completion as a ring — used where a share, not a trend, is the question. */
export function CompletionRing({
  done,
  total,
  label,
  caption,
  href,
}: {
  done: number;
  total: number;
  label: string;
  caption?: string;
  href?: string;
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const r = 26;
  const c = 2 * Math.PI * r;
  const body = (
    <div className="flex items-center gap-4 border-b border-border py-4">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden className="shrink-0">
        <circle cx="32" cy="32" r={r} fill="none" strokeWidth="6" className="stroke-muted" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          strokeWidth="6"
          strokeDasharray={`${(c * pct) / 100} ${c}`}
          transform="rotate(-90 32 32)"
          className={pct >= 100 ? 'stroke-success' : 'stroke-primary'}
          style={{ transition: 'stroke-dasharray 700ms ease' }}
        />
      </svg>
      <div className="min-w-0">
        <p className="font-display text-[1.5rem] font-extrabold leading-none tabular-nums">
          {total > 0 ? `${pct}%` : '—'}
        </p>
        <p className="mt-1 truncate text-[13px] font-medium">{label}</p>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          {total > 0 ? `${done} of ${total}` : 'Nothing assigned'}
          {caption ? ` · ${caption}` : ''}
        </p>
      </div>
    </div>
  );
  return href ? (
    <Link to={href} className="block transition-opacity hover:opacity-75">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Coverage composition — one hard bar, labelled, never a pie. */
export function StackedBar({
  segments,
  caption,
}: {
  segments: { id: string; label: string; value: number; className: string }[];
  caption?: string;
}) {
  const total = segments.reduce((a, s) => a + s.value, 0);
  if (total === 0) {
    return <p className="border-b border-border py-4 text-[13px] text-muted-foreground">Nobody is scheduled today.</p>;
  }
  return (
    <div className="border-b border-border py-4">
      <div className="flex h-3 w-full overflow-hidden">
        {segments
          .filter(s => s.value > 0)
          .map(s => (
            <div
              key={s.id}
              className={cn('h-full', s.className)}
              style={{ width: `${(s.value / total) * 100}%` }}
              title={`${s.label}: ${s.value}`}
            />
          ))}
      </div>
      <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
        {segments
          .filter(s => s.value > 0)
          .map(s => (
            <span key={s.id} className="inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-muted-foreground">
              <span aria-hidden className={cn('inline-block h-2 w-2', s.className)} />
              {s.label} {s.value}
            </span>
          ))}
      </div>
      {caption && <p className="mt-2 text-[12px] text-muted-foreground">{caption}</p>}
    </div>
  );
}
