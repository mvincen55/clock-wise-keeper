import { expect, it } from 'vitest';
import { checklistNamed } from '@/lib/checklist-defaults';

const lists = [
  { id: 'a', name: 'Clerical' },
  { id: 'b', name: 'Clinical — Assistant' },
  { id: 'c', name: 'Clinical — Hygiene' },
  { id: 'd', name: 'Manager' },
];

it('opens the sheet a handbook link names, by prefix first and then by any match', () => {
  expect(checklistNamed(lists, 'manager')?.id).toBe('d');
  expect(checklistNamed(lists, 'Clinical')?.id).toBe('b');
  expect(checklistNamed(lists, 'hygiene')?.id).toBe('c');
  expect(checklistNamed(lists, 'clerical')?.id).toBe('a');
});

it('falls back to the default tab when nothing is named or nothing matches', () => {
  expect(checklistNamed(lists, null)).toBeUndefined();
  expect(checklistNamed(lists, '  ')).toBeUndefined();
  expect(checklistNamed(lists, 'sterilization')).toBeUndefined();
  expect(checklistNamed([], 'manager')).toBeUndefined();
});
