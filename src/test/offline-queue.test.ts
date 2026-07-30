import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearQueuedReorder,
  isConnectivityError,
  queueReorder,
  readQueuedReorder,
} from '@/lib/offline-queue';

const USER = 'user-1';

describe('offline reorder queue', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  });

  it('keeps only the newest arrangement', () => {
    queueReorder(USER, ['a', 'b', 'c']);
    queueReorder(USER, ['c', 'b', 'a']);
    expect(readQueuedReorder(USER)?.orderedIds).toEqual(['c', 'b', 'a']);
  });

  it('is scoped per person', () => {
    queueReorder(USER, ['a', 'b']);
    expect(readQueuedReorder('user-2')).toBeNull();
  });

  it('clears once synced', () => {
    queueReorder(USER, ['a']);
    clearQueuedReorder(USER);
    expect(readQueuedReorder(USER)).toBeNull();
  });

  it('ignores corrupted or empty entries', () => {
    localStorage.setItem(`pe.notes-order-queue.${USER}`, 'not json');
    expect(readQueuedReorder(USER)).toBeNull();
    localStorage.setItem(
      `pe.notes-order-queue.${USER}`,
      JSON.stringify({ orderedIds: [], queuedAt: '' })
    );
    expect(readQueuedReorder(USER)).toBeNull();
  });

  it('queues network failures but not permission failures', () => {
    expect(isConnectivityError(new Error('Failed to fetch'))).toBe(true);
    expect(isConnectivityError(new Error('new row violates row-level security'))).toBe(false);
  });

  it('treats any failure as connectivity while offline', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    expect(isConnectivityError(new Error('anything'))).toBe(true);
  });
});
