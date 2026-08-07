import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * Deep-link plumbing shared by pages the notification bell links into.
 *
 * A page reads its record parameter once on arrival (works the same whether
 * the URL came from the bell or was pasted directly), then drops it from the
 * address bar so refreshes and dialog-closes are not haunted by it — the
 * pattern Incident Reports established with ?report=.
 */

/** Capture ?key=<id> once, then remove it from the URL. Returns the captured id. */
export function useConsumedSearchParam(key: string): string | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const value = searchParams.get(key);
  const [captured, setCaptured] = useState<string | null>(value);

  useEffect(() => {
    if (!value) return;
    setCaptured(value);
    setSearchParams(
      prev => {
        const next = new URLSearchParams(prev);
        next.delete(key);
        return next;
      },
      { replace: true }
    );
  }, [key, value, setSearchParams]);

  return captured;
}

/**
 * Ref that scrolls its element into view (and briefly holds a highlight)
 * once, when `active` is true and the element mounts. Attach it to the row
 * or card the deep link points at.
 */
export function useScrollIntoView<T extends HTMLElement = HTMLDivElement>(active: boolean) {
  const ref = useRef<T | null>(null);
  const done = useRef(false);

  useEffect(() => {
    if (!active || done.current || !ref.current) return;
    done.current = true;
    // Wait a frame so layout (tab switches, list renders) settles first.
    const id = requestAnimationFrame(() => {
      ref.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    });
    return () => cancelAnimationFrame(id);
  }, [active]);

  return ref;
}

/** Class the pages use to make the linked record unmistakable. */
export const DEEP_LINK_HIGHLIGHT = 'ring-2 ring-primary ring-offset-2 ring-offset-background';
