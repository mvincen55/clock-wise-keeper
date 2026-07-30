import { useEffect, useState } from 'react';

/**
 * Movement in this app is a texture, not a feature. When the operating
 * system asks for reduced motion we honour it everywhere: breathing orbs
 * hold still, counters land on their final value, rings appear filled.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** Ease-out cubic — the settle curve used by counters and rings. */
export function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}
