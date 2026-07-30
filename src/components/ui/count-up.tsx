import { useEffect, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { easeOutCubic, usePrefersReducedMotion } from '@/lib/motion';

/**
 * A number that counts up to its value on mount and whenever the value
 * changes. Tabular figures keep the layout still while the digits move.
 * With reduced motion it simply renders the final value.
 */
export default function CountUp({
  value,
  format = v => Math.round(v).toLocaleString(),
  duration = 900,
  className,
}: {
  value: number;
  format?: (v: number) => string;
  duration?: number;
  className?: string;
}) {
  const reduced = usePrefersReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const fromRef = useRef(0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    const delta = value - from;
    if (delta === 0) {
      setShown(value);
      return;
    }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(from + delta * easeOutCubic(t));
      if (t < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration, reduced]);

  return <span className={cn('tabular-nums', className)}>{format(shown)}</span>;
}
