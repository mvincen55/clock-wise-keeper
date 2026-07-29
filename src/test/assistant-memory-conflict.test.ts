/**
 * Memory conflict handling.
 *
 * The rule the office asked for: a fact that contradicts something the
 * assistant was already told must never quietly replace it. It is held
 * 'pending', kept out of every prompt, and an owner/manager decides.
 *
 * These cover the invariants that keep that true — chiefly that a pending
 * fact can never influence an answer, and that resolving never leaves two
 * contradictory facts active at once.
 */
import { describe, it, expect } from 'vitest';

type Status = 'active' | 'pending' | 'superseded';

interface Memory {
  id: string;
  content: string;
  status: Status;
  isActive: boolean;
  supersedesId: string | null;
}

const mem = (id: string, content: string, over: Partial<Memory> = {}): Memory => ({
  id,
  content,
  status: 'active',
  isActive: true,
  supersedesId: null,
  ...over,
});

/** Exactly what the edge function loads into a prompt. */
function promptMemories(all: Memory[]): Memory[] {
  return all.filter(m => m.isActive && m.status === 'active');
}

/** Mirrors useResolveMemoryConflict. */
function resolve(all: Memory[], id: string, decision: 'accept' | 'reject'): Memory[] {
  const target = all.find(m => m.id === id);
  if (!target) return all;
  return all.map(m => {
    if (m.id === id) {
      return decision === 'accept'
        ? { ...m, status: 'active' as Status }
        : { ...m, isActive: false };
    }
    // Accepting retires precisely the fact it contradicted.
    if (decision === 'accept' && m.id === target.supersedesId) {
      return { ...m, status: 'superseded' as Status, isActive: false };
    }
    return m;
  });
}

describe('pending facts stay out of answers', () => {
  const existing = mem('a', 'We close at 4pm on Fridays.');
  const conflicting = mem('b', 'We close at noon on Fridays.', {
    status: 'pending',
    supersedesId: 'a',
  });

  it('never feeds a pending fact to the assistant', () => {
    const loaded = promptMemories([existing, conflicting]);
    expect(loaded).toEqual([existing]);
  });

  it('keeps the original in effect while the conflict is unresolved', () => {
    expect(promptMemories([existing, conflicting])[0].content).toBe('We close at 4pm on Fridays.');
  });

  it('does not lose the contradicting fact — it is held, not dropped', () => {
    const held = [existing, conflicting].find(m => m.status === 'pending');
    expect(held?.content).toBe('We close at noon on Fridays.');
  });
});

describe('resolving a conflict', () => {
  const existing = mem('a', 'We close at 4pm on Fridays.');
  const conflicting = mem('b', 'We close at noon on Fridays.', {
    status: 'pending',
    supersedesId: 'a',
  });
  const all = [existing, conflicting];

  it('accepting swaps which fact is in effect', () => {
    const loaded = promptMemories(resolve(all, 'b', 'accept'));
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe('We close at noon on Fridays.');
  });

  it('never leaves both contradictory facts active', () => {
    const loaded = promptMemories(resolve(all, 'b', 'accept'));
    expect(loaded.filter(m => m.content.includes('Fridays'))).toHaveLength(1);
  });

  it('rejecting keeps the original and discards the new one', () => {
    const loaded = promptMemories(resolve(all, 'b', 'reject'));
    expect(loaded).toHaveLength(1);
    expect(loaded[0].content).toBe('We close at 4pm on Fridays.');
  });

  it('retires only the contradicted fact, leaving unrelated memory alone', () => {
    const unrelated = mem('c', 'Dr. Patel prefers morning surgeries.');
    const loaded = promptMemories(resolve([...all, unrelated], 'b', 'accept'));
    expect(loaded.map(m => m.id).sort()).toEqual(['b', 'c']);
  });
});

describe('non-conflicting saves are unaffected', () => {
  it('stores an ordinary new fact as active straight away', () => {
    const all = [mem('a', 'We close at 4pm on Fridays.'), mem('b', 'Parking is validated.')];
    expect(promptMemories(all)).toHaveLength(2);
  });

  it('drops facts the manager forgot', () => {
    const all = [mem('a', 'Old fact.', { isActive: false }), mem('b', 'Current fact.')];
    expect(promptMemories(all).map(m => m.id)).toEqual(['b']);
  });
});
