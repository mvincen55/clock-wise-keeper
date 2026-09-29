import type { OperationalRole } from '@/lib/schedule-reader/types';
import type { PermissionTier, Shortcut, ToolGroup } from './types';
import { ROLE_MODULES, roleLabel, shortcutsFor } from './opRoles';

/**
 * The tools area: one organized place for every tool a person can open,
 * their assigned responsibility first. Existing routes only — this is a
 * shortcut registry, not a navigation system. Every destination still
 * guards itself (route + RLS); `minTier` and `permission` only hide what
 * the person could not open anyway.
 */

/** The frequent admin actions that sit in the Home header. */
export const ADMIN_HOME_TOOLS: Shortcut[] = [
  { id: 'close', label: 'Close the Day', to: '/deposit-log', detail: 'Money, vitals, seal' },
  { id: 'fof', label: 'Create FOF', to: '/fof', detail: 'Fee options form' },
];

/** Management tools, frequent first. */
export const MANAGEMENT_TOOLS: Shortcut[] = [
  { id: 'attention', label: 'Attention', to: '/management', detail: 'Everything that needs a manager, in order', minTier: 'manager' },
  { id: 'people', label: 'People', to: '/management/people', detail: 'Roster, today, attendance', minTier: 'manager' },
  { id: 'attendance', label: 'Team attendance', to: '/management/attendance', detail: 'Every punch, late arrival, and day off', minTier: 'manager' },
  { id: 'payroll', label: 'Payroll readiness', to: '/management/payroll', detail: 'Is the period clean?', minTier: 'manager' },
  { id: 'close', label: 'Close the Day', to: '/deposit-log', detail: 'Money, vitals, seal' },
  { id: 'report-history', label: 'Report history', to: '/report-history', detail: 'Load or read a package', minTier: 'manager' },
  { id: 'reports', label: 'Reports', to: '/reports', detail: 'Payroll and attendance exports', minTier: 'manager', permission: 'view_reports' },
  { id: 'fof', label: 'Create FOF', to: '/fof', detail: 'Fee options form' },
  { id: 'fees', label: 'Fee schedules', to: '/fof/fees', detail: 'Office and carrier fees', minTier: 'manager' },
  { id: 'missed', label: 'Missed appointments', to: '/management/missed-appointments', detail: 'Dentrix no-shows and late cancellations', minTier: 'manager' },
  { id: 'office-settings', label: 'Office settings', to: '/management/office/settings', detail: 'Goals, attendance, payroll, PTO policy', minTier: 'manager' },
  { id: 'knowledge', label: 'Policies & procedures', to: '/management/knowledge', detail: 'Draft, review, publish', minTier: 'manager' },
];

/** What everyone reaches for, whatever their role. */
export const EVERYONE_TOOLS: Shortcut[] = [
  { id: 'timesheet', label: 'Timesheet', to: '/timesheet', detail: 'Punches, corrections, week totals' },
  { id: 'attendance-mine', label: 'My attendance', to: '/days-off', detail: 'Days off, late arrivals, requests' },
  { id: 'pto', label: 'PTO', to: '/pto', detail: 'Balance and time-off requests' },
  { id: 'inbox', label: 'Inbox', to: '/inbox/messages', detail: 'Messages and office requests' },
  { id: 'calendar', label: 'Office calendar', to: '/office-calendar', detail: 'Closures, events, open days' },
  { id: 'checklists', label: 'Checklists', to: '/checklists', detail: 'Daily, weekly, and role lists' },
  { id: 'handbook', label: 'Handbook', to: '/handbook', detail: 'Policies and expectations' },
  { id: 'numbers', label: 'Important numbers', to: '/important-numbers', detail: 'Labs, carriers, referrals' },
  { id: 'training', label: 'Training', to: '/training', detail: 'Assigned modules' },
  { id: 'goals', label: 'Goals', to: '/goals', detail: 'Personal goals and office challenges' },
  { id: 'assistant', label: 'Ask AI', to: '/assistant', detail: 'Questions about how this office works' },
];

const TIER_RANK: Record<PermissionTier, number> = { member: 0, manager: 1, owner: 2 };

function allowed(s: Shortcut, tier: PermissionTier, grants: ReadonlySet<string>): boolean {
  return !s.minTier || TIER_RANK[tier] >= TIER_RANK[s.minTier] || (s.permission !== undefined && grants.has(s.permission));
}

/**
 * Build the tools area for a person. Order: the assigned role, roles they
 * are covering today, management (admins), backup roles they can cover,
 * then everyone's essentials. A destination appears once — the first group
 * that carries it keeps it — so a backup role never repeats the menu.
 */
export function buildToolGroups(input: {
  tier: PermissionTier;
  grants?: ReadonlySet<string>;
  primary: OperationalRole | null;
  secondary: OperationalRole[];
  coveringToday: OperationalRole[];
}): ToolGroup[] {
  const grants = input.grants ?? new Set<string>();
  const seen = new Set<string>();
  const take = (tools: Shortcut[]): Shortcut[] => {
    const out: Shortcut[] = [];
    for (const t of tools) {
      if (!allowed(t, input.tier, grants) || seen.has(t.to)) continue;
      seen.add(t.to);
      out.push(t);
    }
    return out;
  };
  const groups: ToolGroup[] = [];
  const push = (g: ToolGroup) => { if (g.tools.length > 0) groups.push(g); };

  if (input.primary) {
    push({ id: `role:${input.primary}`, label: roleLabel(input.primary), note: 'Assigned', emphasis: 'primary', tools: take(shortcutsFor(input.primary, input.tier, grants)) });
  }
  for (const role of input.secondary.filter(r => input.coveringToday.includes(r))) {
    push({ id: `covering:${role}`, label: roleLabel(role), note: 'Covering today', emphasis: 'primary', tools: take(shortcutsFor(role, input.tier, grants)) });
  }
  // Members reach the management group only through a grant, and only for
  // the tools the grant unlocks; the open tools in it are everyone's anyway.
  const managementTools = input.tier === 'member' ? MANAGEMENT_TOOLS.filter(t => t.minTier) : MANAGEMENT_TOOLS;
  if (input.tier !== 'member' || managementTools.some(t => t.permission && grants.has(t.permission))) {
    push({ id: 'management', label: 'Management', emphasis: input.tier === 'member' ? 'secondary' : 'primary', tools: take(managementTools) });
  }
  for (const role of input.secondary.filter(r => !input.coveringToday.includes(r))) {
    push({ id: `backup:${role}`, label: roleLabel(role), note: 'Backup — can cover, not assigned today', emphasis: 'secondary', tools: take(shortcutsFor(role, input.tier, grants)) });
  }
  push({ id: 'everyone', label: 'Everyone', emphasis: input.primary ? 'secondary' : 'primary', tools: take(EVERYONE_TOOLS) });
  return groups;
}

/** Every role module's label, for the review matrix. */
export const ROLE_MODULE_LABELS = Object.fromEntries(Object.entries(ROLE_MODULES).map(([k, v]) => [k, v.label]));
