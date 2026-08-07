import { describe, expect, it } from 'vitest';
import { isCoveringOn } from '@/hooks/useMyOperationalRoles';

/**
 * BACKUP vs COVERING TODAY.
 *
 * A permanent secondary role means "can cover". It is NOT an assignment, so it
 * must never elevate time-sensitive backup work. Only an explicit, dated
 * coverage window that includes today counts as covering.
 */
const TODAY = '2026-08-10';

describe('coverage window', () => {
  it('an undated secondary role is backup capability only', () => {
    expect(isCoveringOn({ starts_on: null, ends_on: null }, TODAY)).toBe(false);
  });

  it('an open-ended window that has started is covering today', () => {
    expect(isCoveringOn({ starts_on: '2026-08-01', ends_on: null }, TODAY)).toBe(true);
  });

  it('a window starting today is covering today', () => {
    expect(isCoveringOn({ starts_on: TODAY, ends_on: TODAY }, TODAY)).toBe(true);
  });

  it('future coverage is not covering yet', () => {
    expect(isCoveringOn({ starts_on: '2026-08-11', ends_on: '2026-08-14' }, TODAY)).toBe(false);
  });

  it('expired coverage is not covering any more', () => {
    expect(isCoveringOn({ starts_on: '2026-07-01', ends_on: '2026-08-09' }, TODAY)).toBe(false);
  });

  it('an end date with no start date is still only backup', () => {
    // Defensive: a half-filled row must not be read as an active assignment.
    expect(isCoveringOn({ starts_on: null, ends_on: '2026-12-31' }, TODAY)).toBe(false);
  });

  it('overlapping secondary roles resolve independently', () => {
    const rows = [
      { key: 'assistant', starts_on: '2026-08-05', ends_on: '2026-08-12' },
      { key: 'front_desk', starts_on: null, ends_on: null },
      { key: 'hygienist', starts_on: '2026-09-01', ends_on: null },
    ];
    expect(rows.filter((r) => isCoveringOn(r, TODAY)).map((r) => r.key)).toEqual(['assistant']);
  });
});
