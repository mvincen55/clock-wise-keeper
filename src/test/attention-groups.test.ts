/**
 * Needs you grouping — repeated work folds into one expandable category
 * whose count is exactly its unique items; singletons stay rows; the
 * consequence order survives; every kind has a plain next step.
 */
import { describe, expect, it } from 'vitest';
import type { AttentionItem, AttentionKind } from '@/lib/attention';
import { KIND_VERB } from '@/lib/attention/derive';
import { entryCount, groupAttention, groupHref, groupTone, itemMeta, itemTitle, KIND_GROUP_LABELS, KIND_NEXT_STEP } from '@/lib/attention/groups';

const item = (key: string, over: Partial<AttentionItem> = {}): AttentionItem => {
  const [kind, recordId] = key.split(':') as [AttentionKind, string];
  return {
    key, kind, verb: KIND_VERB[kind], recordTable: kind, recordId,
    subject: { employeeId: null, userId: null, name: null }, label: key, detail: '', why: 'an office rule', occurredAt: null, ageHours: 5,
    deadline: null, coverage: false, payroll: false, href: `/management?item=${key}`, work: 'needs_action', waitingOn: null, parkedUntil: null, snoozedUntil: null,
    ...over,
  };
};

describe('groupAttention', () => {
  it('folds two or more of a kind into one category at the position of the first, and leaves singletons as rows', () => {
    const items = [
      item('missing_clock_out:d1', { deadline: { label: 'payroll Thu', date: '2026-03-05', days: 2 } }),
      item('close_day_unsealed:a'),
      item('pto_request:p1'),
      item('close_day_unsealed:b'),
      item('close_day_unsealed:c'),
    ];
    const entries = groupAttention(items);
    expect(entries.map(e => (e.type === 'group' ? `group:${e.kind}` : e.item.key))).toEqual(['missing_clock_out:d1', 'group:close_day_unsealed', 'pto_request:p1']);
    const group = entries[1];
    if (group.type !== 'group') throw new Error('expected a group');
    expect(group.count).toBe(3);
    expect(group.items.map(i => i.key)).toEqual(['close_day_unsealed:a', 'close_day_unsealed:b', 'close_day_unsealed:c']);
    expect(group.label).toBe('Closeouts awaiting seal');
    expect(group.next).toBe('Seal the day');
    expect(group.verb).toBe('fix');
  });

  it('counts every unique item exactly once — the sum over entries is the input length', () => {
    const items = [item('pto_request:1'), item('pto_request:2'), item('correction_request:3'), item('training_overdue:4'), item('training_overdue:5'), item('training_overdue:6')];
    expect(entryCount(groupAttention(items))).toBe(items.length);
    expect(entryCount(groupAttention([]))).toBe(0);
    expect(groupAttention([]).length).toBe(0);
  });

  it('a category carries the most urgent tone inside it', () => {
    const calm = item('bypass_followup:1');
    const urgent = item('bypass_followup:2', { coverage: true });
    expect(groupTone([calm])).toBe('calm');
    expect(groupTone([calm, urgent])).toBe('urgent');
    expect(groupTone([calm, item('bypass_followup:3', { deadline: { label: 'tonight', date: '2026-03-03', days: 0 } })])).toBe('attention');
  });

  it('opens the filtered list for the category and names each row plainly', () => {
    expect(groupHref('close_day_unsealed')).toBe('/management?kind=close_day_unsealed');
    const it1 = item('pto_request:p1', { subject: { employeeId: 'e1', userId: 'u1', name: 'Priya S.' }, label: 'PTO request · 2026-03-09', ageHours: 50 });
    expect(itemTitle(it1)).toBe('Priya S. · PTO request · 2026-03-09');
    expect(itemMeta(it1)).toBe('2d · Decide');
    expect(itemTitle(item('close_day_behind:g', { label: 'Close the Day is behind' }))).toBe('Close the Day is behind');
  });

  it('every kind Attention can admit has a category label and a next step', () => {
    for (const kind of Object.keys(KIND_VERB) as AttentionKind[]) {
      expect(KIND_GROUP_LABELS[kind].group, kind).toBeTruthy();
      expect(KIND_GROUP_LABELS[kind].one, kind).toBeTruthy();
      expect(KIND_NEXT_STEP[kind], kind).toBeTruthy();
    }
  });

  it('the minimum group size is a parameter', () => {
    const items = [item('pto_request:1'), item('pto_request:2')];
    expect(groupAttention(items, 3).every(e => e.type === 'item')).toBe(true);
    expect(groupAttention(items, 2)[0].type).toBe('group');
  });
});
