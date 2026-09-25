import { useEffect, useRef, useState } from 'react';

/**
 * Chart series colors. Two validated categorical slots (light and dark
 * steps live in index.css as --pe-chart-1/2/3): slot 1 is production or
 * posted charges, slot 2 collections or receipts, slot 3 a third category.
 * Color follows the entity — hiding one series never repaints the other.
 */
export const SERIES_COLOR = {
  primary: 'var(--pe-chart-1)',
  secondary: 'var(--pe-chart-2)',
  tertiary: 'var(--pe-chart-3)',
  neutral: 'hsl(var(--muted-foreground) / 0.45)',
} as const;

export const GRID_STROKE = 'hsl(var(--border))';
export const AXIS_TEXT = 'hsl(var(--muted-foreground))';

/** Compact dollar tick: $12k, $1.2M, $850. The baseline reads "0" — a bare $0 on Home always means a missing value was rendered as money. */
export function compactDollars(cents: number): string {
  if (cents === 0) return '0';
  const d = cents / 100;
  if (Math.abs(d) >= 1_000_000) return `$${(d / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (Math.abs(d) >= 1_000) return `$${(d / 1_000).toFixed(d >= 100_000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return `$${Math.round(d)}`;
}

/**
 * The rendered width of an element, tracked with ResizeObserver where the
 * browser has one. Where it does not (a test renderer) the fallback width
 * keeps the chart drawing instead of collapsing to nothing.
 */
export function useMeasuredWidth<T extends HTMLElement>(fallback = 640): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => {
      const w = el.getBoundingClientRect().width;
      if (w > 0) setWidth(Math.round(w));
    };
    read();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', read);
      return () => window.removeEventListener('resize', read);
    }
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, width];
}
