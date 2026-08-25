/**
 * Reordering for onboarding builder lists (sections, items). Pure functions
 * so reorder integrity is unit-testable: every move keeps sort_order a
 * clean permutation — no duplicates, no gaps introduced by races with
 * whatever order the rows arrived in.
 */

export interface Orderable {
  id: string;
  sort_order: number;
}

/** Rows sorted the way the builder and the print sheet display them. */
export function inDisplayOrder<T extends Orderable>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));
}

/**
 * Moving one row up/down = renumbering the whole list with the row swapped
 * one place. Returns the writes needed ({id, sort_order} for every row whose
 * number changed), or [] when the move is a no-op (already at the edge).
 * Renumbering the full list (0,1,2,…) also self-heals duplicate or gapped
 * sort_orders left by concurrent edits.
 */
export function moveInList<T extends Orderable>(
  rows: readonly T[],
  id: string,
  direction: 'up' | 'down',
): Array<{ id: string; sort_order: number }> {
  const ordered = inDisplayOrder(rows);
  const index = ordered.findIndex(r => r.id === id);
  if (index === -1) return [];
  const target = direction === 'up' ? index - 1 : index + 1;
  if (target < 0 || target >= ordered.length) return [];

  const next = [...ordered];
  [next[index], next[target]] = [next[target], next[index]];

  const writes: Array<{ id: string; sort_order: number }> = [];
  next.forEach((row, i) => {
    if (row.sort_order !== i) writes.push({ id: row.id, sort_order: i });
  });
  return writes;
}
