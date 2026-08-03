/**
 * The three membership types: Owner, Manager, Team.
 * 'employee' is the stored token for the Team tier — org_members.role,
 * invites, and RLS all keep that token; only the display name is "Team".
 */
export type MemberRole = 'owner' | 'manager' | 'employee';

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  owner: 'Owner',
  manager: 'Manager',
  employee: 'Team',
};

export function memberRoleLabel(role: string | null | undefined): string {
  if (!role) return '';
  return MEMBER_ROLE_LABELS[role as MemberRole] ?? role;
}

/** Owners run the office; Managers and Team punch the clock. */
export function roleClocksIn(role: string | null | undefined): boolean {
  return !!role && role !== 'owner';
}
