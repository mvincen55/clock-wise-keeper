/**
 * The people behind the chat surfaces.
 *
 * The regression this guards: the New-chat roster and the names in threads
 * were read from the employees table, whose RLS shows an employee only their
 * own row — so a signed-in employee found nobody to chat with, and their DMs
 * were titled "Direct message". The directory RPC every member may call is
 * the source now; the employees rows a caller can read only add detail.
 */
import { describe, it, expect } from 'vitest';
import { buildChatDirectory, type DirectoryStaff, type ReadableEmployee } from '../lib/chat-directory';

const staff = (over: Partial<DirectoryStaff> & { userId: string | null; displayName: string }): DirectoryStaff => ({
  isActiveActor: true,
  ...over,
});

const row = (over: Partial<ReadableEmployee> & { display_name: string }): ReadableEmployee => ({
  user_id: null,
  preferred_name: null,
  employment_status: 'active',
  ...over,
});

// The office as an employee sees it: the directory has everyone; the employees
// table yielded only her own row.
const office: DirectoryStaff[] = [
  staff({ userId: 'jill', displayName: 'Jill Craveiro' }),
  staff({ userId: 'megan', displayName: 'Megan Vincent' }),
  staff({ userId: 'alize', displayName: 'Alize A Furtado' }),
  staff({ userId: null, displayName: 'Barbosa, Jen L' }),
  staff({ userId: 'soleil', displayName: 'Soleil Baptiste', isActiveActor: false }),
];
const ownRow = [row({ user_id: 'jill', display_name: 'Jill Craveiro' })];

describe('buildChatDirectory', () => {
  it('lists every teammate with a login even when the caller can read only their own employees row', () => {
    const { teammates } = buildChatDirectory(office, ownRow, 'jill');
    expect(teammates.map(t => t.name)).toEqual(['Alize A Furtado', 'Megan Vincent']);
  });

  it('never offers the caller themself, people without a login, or people no longer active', () => {
    const { teammates } = buildChatDirectory(office, ownRow, 'jill');
    expect(teammates.map(t => t.userId)).not.toContain('jill');
    expect(teammates.map(t => t.userId)).not.toContain('soleil');
    expect(teammates).toHaveLength(2);
  });

  it('still names people who are no longer active, so old threads keep their names', () => {
    const { nameByUserId } = buildChatDirectory(office, ownRow, 'jill');
    expect(nameByUserId.get('soleil')).toBe('Soleil Baptiste');
    expect(nameByUserId.get('jill')).toBe('Jill Craveiro');
  });

  it('prefers the preferred name from an employees row the caller can read', () => {
    const readable = [
      ...ownRow,
      row({ user_id: 'alize', display_name: 'Alize A Furtado', preferred_name: 'Alize' }),
    ];
    const { nameByUserId, teammates } = buildChatDirectory(office, readable, 'jill');
    expect(nameByUserId.get('alize')).toBe('Alize');
    expect(teammates.find(t => t.userId === 'alize')?.name).toBe('Alize');
  });

  it('shows imported "Last, First" names first-name-first and sorts the roster by surname', () => {
    const imported = [
      staff({ userId: 'gina', displayName: 'Correia, Gina B' }),
      staff({ userId: 'alize', displayName: 'Alize A Furtado' }),
    ];
    const { nameByUserId, teammates } = buildChatDirectory(imported, [], 'jill');
    expect(nameByUserId.get('gina')).toBe('Gina B Correia');
    expect(teammates.map(t => t.userId)).toEqual(['gina', 'alize']);
  });

  it('falls back to readable employees rows while the directory has not loaded', () => {
    const readable = [
      row({ user_id: 'megan', display_name: 'Megan Vincent' }),
      row({ user_id: 'alize', display_name: 'Alize A Furtado', preferred_name: 'Alize' }),
      row({ user_id: 'holli', display_name: 'Holli Braga', employment_status: 'inactive' }),
      row({ user_id: null, display_name: 'Barbosa, Jen L' }),
    ];
    const { nameByUserId, teammates } = buildChatDirectory([], readable, 'megan');
    expect(teammates.map(t => t.userId)).toEqual(['alize']);
    expect(nameByUserId.get('holli')).toBe('Holli Braga');
  });

  it('lets the directory decide the roster once it has loaded, whatever the employees rows say', () => {
    const readable = [row({ user_id: 'soleil', display_name: 'Soleil Baptiste', employment_status: 'active' })];
    const { teammates } = buildChatDirectory(office, readable, 'megan');
    expect(teammates.map(t => t.userId)).toEqual(['jill', 'alize']);
  });
});
