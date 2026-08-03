// MIRROR of src/lib/checklist-gating.ts — kept byte-identical below the header.
// Edit src/lib/checklist-gating.ts, then copy it here; src/test/checklist-gating.test.ts enforces this.
/**
 * The clock-out gating rule, as a pure function.
 *
 * This is the single definition of "what still gates this person's clock-out".
 * It is mirrored verbatim into `supabase/functions/_shared/checklist-gating.ts`
 * so the server re-verification cannot drift from the client — a drift test
 * (`src/test/checklist-gating.test.ts`) fails the build if the two diverge.
 *
 * Rules, all of them load-bearing:
 *  - only lists whose audience the member can see ('all', plus 'manager' for admins)
 *  - only daily + active items
 *  - only per-person items gate; shared items are information, never a gate
 *  - a personal item (owner_user_id set) counts only for its owner
 *  - a dated item counts only on or after its due date
 *  - a dated item completes against its own day; undated items against today
 *  - a gating item is done only when THIS member completed it
 */

export type GatingList = { id: string; audience: string };

export type GatingItem = {
  id: string;
  title?: string;
  cadence?: string;
  is_active?: boolean;
  per_person: boolean;
  owner_user_id: string | null;
  due_date: string | null;
  checklist_id?: string;
};

export type GatingCompletion = {
  item_id: string;
  completed_by: string;
  period_key: string;
};

export type GatingResult = {
  incompleteCount: number;
  incompleteTitles: string[];
  openSharedCount: number;
};

export const EMPTY_GATING: GatingResult = {
  incompleteCount: 0,
  incompleteTitles: [],
  openSharedCount: 0,
};

/** Which list audiences this member can see. */
export function audiencesFor(isAdmin: boolean): string[] {
  return isAdmin ? ['all', 'manager'] : ['all'];
}

export function visibleListIds(lists: GatingList[], isAdmin: boolean): string[] {
  const allowed = new Set(audiencesFor(isAdmin));
  return lists.filter(l => allowed.has(l.audience)).map(l => l.id);
}

/** Items that are in scope for this member today (before completion is applied). */
export function itemsInScope(
  items: GatingItem[],
  opts: { userId: string; today: string; listIds?: string[] },
): GatingItem[] {
  const listFilter = opts.listIds ? new Set(opts.listIds) : null;
  return items.filter(
    i =>
      (i.cadence === undefined || i.cadence === 'daily') &&
      (i.is_active === undefined || i.is_active === true) &&
      (!listFilter || i.checklist_id === undefined || listFilter.has(i.checklist_id)) &&
      (!i.owner_user_id || i.owner_user_id === opts.userId) &&
      (!i.due_date || i.due_date <= opts.today),
  );
}

/** The period a daily item completes against: its own day, else today. */
export function periodKeyForItem(item: Pick<GatingItem, 'due_date'>, today: string): string {
  return item.due_date ?? today;
}

export function computeGating(input: {
  lists: GatingList[];
  items: GatingItem[];
  completions: GatingCompletion[];
  userId: string;
  today: string;
  isAdmin: boolean;
  /** Owners who don't punch are never gated. */
  clocksIn?: boolean;
}): GatingResult {
  if (input.clocksIn === false) return { ...EMPTY_GATING };

  const listIds = visibleListIds(input.lists, input.isAdmin);
  if (input.lists.length && !listIds.length) return { ...EMPTY_GATING };

  const scoped = itemsInScope(input.items, {
    userId: input.userId,
    today: input.today,
    listIds: input.lists.length ? listIds : undefined,
  });
  if (!scoped.length) return { ...EMPTY_GATING };

  const relevant = input.completions.filter(c => {
    const item = scoped.find(i => i.id === c.item_id);
    return !!item && c.period_key === periodKeyForItem(item, input.today);
  });

  const mine = new Set(relevant.filter(c => c.completed_by === input.userId).map(c => c.item_id));
  const anyone = new Set(relevant.map(c => c.item_id));

  const open = scoped.filter(i => i.per_person && !mine.has(i.id));
  const shared = scoped.filter(i => !i.per_person && !anyone.has(i.id));

  return {
    incompleteCount: open.length,
    incompleteTitles: open.map(i => i.title ?? ''),
    openSharedCount: shared.length,
  };
}
