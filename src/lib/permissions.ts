// Per-employee permissions — the one registry of grantable capabilities.
//
// Permission tiers (owner / manager / employee) stay untouched; a grant
// unlocks ONE named capability for ONE employee, chosen by the owner (or by
// managers when the owner has delegated that). Every key here is enforced in
// RLS by supabase/migrations/20260811180000_employee_permissions.sql — the
// UI reads this registry for labels, never for security.

export type PermissionKey =
  | 'edit_closeout_history'
  | 'view_reports'
  | 'manage_office_goals'
  | 'manage_onboarding';

export type PermissionDef = {
  key: PermissionKey;
  label: string;
  /** What the grant actually unlocks, in plain words. */
  description: string;
  /** Where it is enforced — shown in the settings UI as the receipt. */
  enforcedAt: string;
};

export const PERMISSION_DEFS: readonly PermissionDef[] = [
  {
    key: 'edit_closeout_history',
    label: 'Edit closeout history',
    description:
      'Edit or unseal past-day Close the Day records. Same-day editing stays open to everyone; late edits stay audit-logged.',
    enforcedAt: 'deposit_logs update policy + audit trigger',
  },
  {
    key: 'view_reports',
    label: 'View office reports',
    description:
      'Read the office audit trail on the Reports page, not just their own entries.',
    enforcedAt: 'audit_events read policy',
  },
  {
    key: 'manage_office_goals',
    label: 'Manage office goals',
    description: 'Create, edit, and close office sprints on the Goals page.',
    enforcedAt: 'team_goals write policies',
  },
  {
    key: 'manage_onboarding',
    label: 'Manage onboarding',
    description:
      'Build and edit new-hire onboarding templates and start onboarding for a hire.',
    enforcedAt: 'can_manage_onboarding() in the onboarding_templates write policies',
  },
] as const;

export const PERMISSION_KEYS: readonly PermissionKey[] = PERMISSION_DEFS.map(d => d.key);

/** Convenience: does a grant set include a key? (Admins bypass grants.) */
export function hasGrant(
  grants: ReadonlySet<string> | undefined,
  key: PermissionKey,
): boolean {
  return grants?.has(key) ?? false;
}
