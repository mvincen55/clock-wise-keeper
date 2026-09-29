import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import type { Tone } from '../types';
import { Chip, InfoList, InfoPopover, focusRing, interactive, toneText } from '../kit';

/**
 * The performance strip: one tile per metric for the selected period. Each
 * tile shows its value, its period and cutoff, and one line of status; the
 * caveats (source, date basis, completeness, comparison basis) sit behind
 * the tile's information control so the strip stays readable at a glance.
 */
export type StripTile = {
  id: string;
  label: string;
  periodLabel: string;
  value: string;
  valueTone?: Tone;
  /** The one status line under the value: the comparison, or why it is withheld. */
  lines: { text: string; tone?: Tone }[];
  /** "Partial data · 2 office days not recorded", when the totals are incomplete. */
  partial?: string | null;
  /** The details behind the ⓘ: range, cutoff, source, completeness, comparison basis. */
  info?: { label: string; value: string }[];
  href?: string;
  /** Screen-reader sentence combining everything above. */
  ariaLabel: string;
};

/**
 * The strip sizes itself to the column it sits in, not the viewport: two by
 * two until the column comfortably fits every tile across (a container
 * query on the strip's own width), so a narrower main column beside the
 * sidebar never squeezes four tiles into unreadable slivers.
 */
const STRIP_CONTAINER = '[container-type:inline-size]';
const COLS: Record<number, string> = {
  1: 'grid-cols-1',
  2: 'grid-cols-2',
  3: 'grid-cols-2 [@container(min-width:44rem)]:grid-cols-3',
  4: 'grid-cols-2 [@container(min-width:58rem)]:grid-cols-4',
};

export function PerformanceStrip({ tiles, loading }: { tiles: StripTile[]; loading?: boolean }) {
  if (loading) {
    return (
      <div className={STRIP_CONTAINER}>
        <div className={cn('grid gap-3', COLS[4])} aria-busy="true" aria-live="polite">
          {[0, 1, 2, 3].map(i => (
            <div key={i} className="rounded-xl border border-border bg-card px-4 py-4">
              <div className="h-3.5 w-24 rounded bg-muted motion-safe:animate-pulse" />
              <div className="mt-3 h-8 w-28 rounded bg-muted motion-safe:animate-pulse" />
              <p className="mt-2 text-[13px] text-muted-foreground">Reading…</p>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (tiles.length === 0) return null;
  const cols = COLS[Math.min(tiles.length, 4)];
  return (
    <div className={STRIP_CONTAINER}>
    <div className={cn('grid gap-3', cols)} role="list" aria-label="Performance strip">
      {tiles.map(t => {
        const first = t.lines[0];
        return (
          <div key={t.id} role="listitem" aria-label={t.ariaLabel} className="relative min-w-0 rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(220_25%_10%/0.04)]">
            <div className="flex items-start justify-between gap-2 px-4 pt-3.5">
              <p className="text-[13px] font-semibold text-muted-foreground">{t.label}</p>
              {t.info && (
                <InfoPopover label={`About ${t.label.toLowerCase()}`} className="-mr-1.5 -mt-1">
                  <p className="mb-2 text-[14px] font-semibold text-foreground">{t.label}</p>
                  <InfoList rows={t.info} />
                </InfoPopover>
              )}
            </div>
            <div className="px-4 pb-4">
              {t.href ? (
                <Link to={t.href} className={cn('block rounded-md', focusRing, interactive)}>
                  <p className={cn('mt-1 font-display text-[clamp(1.5rem,2.6vw,1.9rem)] font-bold leading-none tabular-nums tracking-[-0.02em] hover:text-primary', t.valueTone ? toneText[t.valueTone] : 'text-foreground')}>{t.value}</p>
                </Link>
              ) : (
                <p className={cn('mt-1 font-display text-[clamp(1.5rem,2.6vw,1.9rem)] font-bold leading-none tabular-nums tracking-[-0.02em]', t.valueTone ? toneText[t.valueTone] : 'text-foreground')}>{t.value}</p>
              )}
              <p className="mt-2 text-[13px] leading-snug text-muted-foreground">{t.periodLabel}</p>
              {first && <p className={cn('mt-1 text-[13px] leading-snug', first.tone ? toneText[first.tone] : 'text-muted-foreground')}>{first.text}</p>}
              {t.partial && (
                <Chip tone="attention" className="mt-2">{t.partial}</Chip>
              )}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}
