/**
 * Offline-first queue for sticky note reorders.
 *
 * A reorder is a *whole arrangement*, not an increment, so the queue only
 * ever needs the newest one per person — dragging five times on the plane
 * still syncs one write on landing. Latest-wins, no replay storms.
 */

const STORAGE_PREFIX = 'pe.notes-order-queue.';

export type QueuedReorder = {
  orderedIds: string[];
  /** When the person actually made the change (their intent's timestamp). */
  queuedAt: string;
};

function key(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null; // private mode / blocked storage — fail open, never crash a drag
  }
}

export function readQueuedReorder(userId: string): QueuedReorder | null {
  const store = safeStorage();
  if (!store) return null;
  try {
    const raw = store.getItem(key(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as QueuedReorder;
    if (!Array.isArray(parsed.orderedIds) || parsed.orderedIds.length === 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Replaces any pending arrangement — the newest drag is the only truth. */
export function queueReorder(userId: string, orderedIds: string[]): QueuedReorder {
  const entry: QueuedReorder = { orderedIds, queuedAt: new Date().toISOString() };
  const store = safeStorage();
  try {
    store?.setItem(key(userId), JSON.stringify(entry));
  } catch {
    /* out of quota — the in-memory order still holds for this session */
  }
  return entry;
}

export function clearQueuedReorder(userId: string) {
  const store = safeStorage();
  try {
    store?.removeItem(key(userId));
  } catch {
    /* nothing to do */
  }
}

export function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}

/**
 * True when a failure looks like "the network wasn't there", which is worth
 * queueing. A permission or validation error is not — that would queue a write
 * that can never succeed.
 */
export function isConnectivityError(error: unknown): boolean {
  if (!isOnline()) return true;
  const message = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase();
  return (
    message.includes('failed to fetch') ||
    message.includes('networkerror') ||
    message.includes('network request failed') ||
    message.includes('load failed') ||
    message.includes('timeout') ||
    message.includes('fetch failed')
  );
}
