import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Tone } from '../types';
import { MicroLabel, toneText } from '../kit';

/**
 * The compact performance strip: four metrics for the selected period, each
 * with its recorded value, its period, a comparison only when the prior
 * period is comparable, and its coverage. No sparkline is drawn from a
 * total — the chart underneath carries the shape.
 */
export type StripTile = {
  id: string;
  label: string;
  periodLabel: string;
  value: string;
  valueTone?: Tone;
  /** Comparison, coverage, or the honest reason a comparison is withheld. */
  lines: { text: string; tone?: Tone }[];
  href?: string;
  /** Screen-reader sentence combining everything above. */
  ariaLabel: string;
};

export function PerformanceStrip({ tiles, loading }: { tiles: StripTile[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border lg:grid-cols-4" aria-busy="true">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className="bg-card px-4 py-4">
            <div className="h-3 w-24 rounded bg-muted" />
            <div className="mt-3 h-7 w-28 rounded bg-muted" />
            <p className="mt-2 text-[11.5px] text-muted-foreground">Reading…</p>
          </div>
        ))}
      </div>
    );
  }
  if (tiles.length === 0) return null;
  const cols = tiles.length >= 4 ? 'grid-cols-2 lg:grid-cols-4' : tiles.length === 3 ? 'grid-cols-2 sm:grid-cols-3' : tiles.length === 2 ? 'grid-cols-2' : 'grid-cols-1';
  return (
    <div className={cn('grid gap-px overflow-hidden rounded-xl border border-border bg-border', cols)} role="list" aria-label="Performance strip">
      {tiles.map(t => {
        const body = (
          <>
            <MicroLabel>{t.label}</MicroLabel>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{t.periodLabel}</p>
            <p className={cn('mt-2 font-display text-[clamp(1.35rem,3vw,1.9rem)] font-extrabold leading-[0.95] tracking-[-0.02em]', t.valueTone ? toneText[t.valueTone] : 'text-foreground')}>
              {t.value}
            </p>
            {t.lines.map((l, i) => (
              <p key={i} className={cn('mt-1 text-[11.5px] leading-snug', l.tone ? toneText[l.tone] : 'text-muted-foreground')}>{l.text}</p>
            ))}
          </>
        );
        const className = 'block min-w-0 bg-card px-4 py-4 transition-colors';
        return (
          <div key={t.id} role="listitem" aria-label={t.ariaLabel} className="min-w-0">
            {t.href ? (
              <Link to={t.href} className={cn(className, 'hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring')}>{body}</Link>
            ) : (
              <div className={className}>{body}</div>
            )}
          </div>
        );
      })}
    </div>
  );
}
