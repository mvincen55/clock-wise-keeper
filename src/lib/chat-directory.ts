import { formatEmployeeName, formatEmployeeNameLastFirst } from '@/lib/employee-name';

/**
 * Who the chat surfaces can name, and who a member may start a chat with.
 *
 * The roster behind "New chat" used to be read straight from the employees
 * table. Its RLS lets an owner or manager read the whole office, but an
 * employee reads only their own row — so an employee opened New chat and
 * found nobody there, and every DM they were in was titled "Direct message".
 * The chat surfaces now take their people from org_staff_directory: the
 * SECURITY DEFINER RPC every active member may call, which returns the
 * office roster with real membership status and nothing sensitive (no
 * contact details, no pay, no PTO).
 *
 * The employees rows a caller CAN read still count: a preferred name
 * ("Alize" over "Alize A Furtado") lives only on that table, and a directory
 * that has not loaded yet falls back to them for the roster.
 */

/** The slice of an org_staff_directory row the chat surfaces need. */
export interface DirectoryStaff {
  userId: string | null;
  displayName: string;
  /** Active employment + a login + active org membership: someone ensure_dm accepts. */
  isActiveActor: boolean;
}

/** The slice of an employees row (only the rows the caller may read). */
export interface ReadableEmployee {
  user_id: string | null;
  display_name: string;
  preferred_name: string | null;
  employment_status: string;
}

export interface ChatTeammate {
  userId: string;
  name: string;
}

export interface ChatDirectory {
  /** auth user id → the name the chat surfaces show for that person. */
  nameByUserId: Map<string, string>;
  /** Who the caller may start a direct message with, sorted the way the office scans a roster. */
  teammates: ChatTeammate[];
}

/** What a person is called in chat: the preferred name when known, else the display name first-name-first. */
function chatName(displayName: string, preferredName: string | null | undefined): string {
  const preferred = preferredName?.trim();
  return preferred || formatEmployeeName(displayName) || 'Teammate';
}

export function buildChatDirectory(
  staff: readonly DirectoryStaff[],
  employees: readonly ReadableEmployee[],
  currentUserId: string | null | undefined,
): ChatDirectory {
  const readable = new Map<string, ReadableEmployee>();
  for (const e of employees) {
    if (e.user_id) readable.set(e.user_id, e);
  }

  const nameByUserId = new Map<string, string>();
  const candidates: (ChatTeammate & { sortKey: string })[] = [];

  // The directory is the authority on who is a teammate today: it knows the
  // real membership status, which the employees table does not carry.
  for (const s of staff) {
    if (!s.userId) continue;
    const name = chatName(s.displayName, readable.get(s.userId)?.preferred_name);
    nameByUserId.set(s.userId, name);
    if (s.isActiveActor && s.userId !== currentUserId) {
      candidates.push({ userId: s.userId, name, sortKey: formatEmployeeNameLastFirst(s.displayName) });
    }
  }

  // Rows the caller can read that the directory did not return — it is still
  // loading, or failed. Names always resolve; the roster keeps the pre-directory
  // rule (active employment + a login) so an owner or manager is never left
  // with an empty picker. ensure_dm still verifies membership server-side.
  for (const e of readable.values()) {
    const userId = e.user_id as string;
    if (nameByUserId.has(userId)) continue;
    const name = chatName(e.display_name, e.preferred_name);
    nameByUserId.set(userId, name);
    if (staff.length === 0 && e.employment_status === 'active' && userId !== currentUserId) {
      candidates.push({ userId, name, sortKey: formatEmployeeNameLastFirst(e.display_name) });
    }
  }

  candidates.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
  return { nameByUserId, teammates: candidates.map(({ userId, name }) => ({ userId, name })) };
}
