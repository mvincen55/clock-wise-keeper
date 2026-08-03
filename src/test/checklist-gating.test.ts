import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  audiencesFor,
  computeGating,
  itemsInScope,
  periodKeyForItem,
  visibleListIds,
  type GatingItem,
} from '@/lib/checklist-gating';

// The clock-out gate is a rule-enforcing path: if any of these assertions can
// be deleted without a test going red, the gate is decoration. Each case below
// maps to a rule the spec states, and to the same computation the server runs.

const TODAY = '2026-07-31';
const ME = 'user-me';
const OTHER = 'user-other';

const lists = [
  { id: 'list-all', audience: 'all' },
  { id: 'list-mgr', audience: 'manager' },
];

function item(over: Partial<GatingItem> & { id: string }): GatingItem {
  return {
    per_person: true,
    owner_user_id: null,
    due_date: null,
    checklist_id: 'list-all',
    cadence: 'daily',
    is_active: true,
    title: over.id,
    ...over,
  };
}

function run(items: GatingItem[], completions: { item_id: string; completed_by: string; period_key: string }[] = [], opts: { isAdmin?: boolean; clocksIn?: boolean } = {}) {
  return computeGating({
    lists,
    items,
    completions,
    userId: ME,
    today: TODAY,
    isAdmin: opts.isAdmin ?? false,
    clocksIn: opts.clocksIn,
  });
}

describe('audience scoping', () => {
  it('gives members only the "all" audience', () => {
    expect(audiencesFor(false)).toEqual(['all']);
    expect(visibleListIds(lists, false)).toEqual(['list-all']);
  });

  it('gives admins the manager lists too', () => {
    expect(audiencesFor(true)).toEqual(['all', 'manager']);
    expect(visibleListIds(lists, true)).toEqual(['list-all', 'list-mgr']);
  });

  it('does not gate a member on a manager-audience item', () => {
    const items = [item({ id: 'a', checklist_id: 'list-mgr' })];
    expect(run(items).incompleteCount).toBe(0);
    expect(run(items, [], { isAdmin: true }).incompleteCount).toBe(1);
  });
});

describe('which items gate', () => {
  it('gates active daily per-person items', () => {
    expect(run([item({ id: 'a' })]).incompleteCount).toBe(1);
  });

  it('never gates on inactive or non-daily items', () => {
    expect(run([item({ id: 'a', is_active: false })]).incompleteCount).toBe(0);
    expect(run([item({ id: 'a', cadence: 'weekly' })]).incompleteCount).toBe(0);
  });

  it('counts shared items as information, never as a gate', () => {
    const r = run([item({ id: 'a', per_person: false })]);
    expect(r.incompleteCount).toBe(0);
    expect(r.openSharedCount).toBe(1);
  });

  it("ignores another person's personal item", () => {
    expect(run([item({ id: 'a', owner_user_id: OTHER })]).incompleteCount).toBe(0);
    expect(run([item({ id: 'a', owner_user_id: ME })]).incompleteCount).toBe(1);
  });

  it('holds a dated item until its day arrives', () => {
    expect(run([item({ id: 'a', due_date: '2026-08-05' })]).incompleteCount).toBe(0);
    expect(run([item({ id: 'a', due_date: TODAY })]).incompleteCount).toBe(1);
    expect(run([item({ id: 'a', due_date: '2026-07-20' })]).incompleteCount).toBe(1);
  });

  it('never gates someone who does not punch', () => {
    expect(run([item({ id: 'a' })], [], { clocksIn: false }).incompleteCount).toBe(0);
  });
});

describe('completion keys', () => {
  it('keys a dated item to its own day, an undated one to today', () => {
    expect(periodKeyForItem({ due_date: '2026-07-20' }, TODAY)).toBe('2026-07-20');
    expect(periodKeyForItem({ due_date: null }, TODAY)).toBe(TODAY);
  });

  it('clears an item only when this member completed it for the right period', () => {
    const items = [item({ id: 'a', due_date: '2026-07-20' })];
    expect(run(items, [{ item_id: 'a', completed_by: ME, period_key: TODAY }]).incompleteCount).toBe(1);
    expect(run(items, [{ item_id: 'a', completed_by: ME, period_key: '2026-07-20' }]).incompleteCount).toBe(0);
    expect(run(items, [{ item_id: 'a', completed_by: OTHER, period_key: '2026-07-20' }]).incompleteCount).toBe(1);
  });

  it('lets anyone clear a shared item', () => {
    const items = [item({ id: 'a', per_person: false })];
    expect(run(items, [{ item_id: 'a', completed_by: OTHER, period_key: TODAY }]).openSharedCount).toBe(0);
  });
});

describe('scope helper', () => {
  it('applies owner and due-date scoping together', () => {
    const scoped = itemsInScope(
      [
        item({ id: 'mine' }),
        item({ id: 'theirs', owner_user_id: OTHER }),
        item({ id: 'future', due_date: '2026-09-01' }),
      ],
      { userId: ME, today: TODAY },
    );
    expect(scoped.map(i => i.id)).toEqual(['mine']);
  });
});

// The server re-verification must be the same rule, not a similar one — the
// P1-14 drift was exactly this. The mirror is copied, so assert it byte-for-byte.
describe('client/server mirror', () => {
  it('keeps supabase/functions/_shared/checklist-gating.ts identical to the source', () => {
    const canonical = readFileSync('src/lib/checklist-gating.ts', 'utf8');
    const mirror = readFileSync('supabase/functions/_shared/checklist-gating.ts', 'utf8');
    const stripHeader = (s: string) =>
      s.split('\n').filter(l => !l.startsWith('// MIRROR of') && !l.startsWith('// Edit src/lib')).join('\n');
    expect(stripHeader(mirror)).toBe(stripHeader(canonical));
  });
});
