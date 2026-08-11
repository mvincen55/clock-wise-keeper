import type { OperationalRole } from '@/lib/schedule-reader/types';
import { ROLE_LABELS } from '@/hooks/useOperationalRoles';
import type { PermissionTier, Shortcut } from './types';

/**
 * Operational-role modules.
 *
 * Each entry describes what a person doing THAT WORK reaches for. It is pure
 * presentation: labels and links into surfaces the app already ships. It grants
 * nothing — `minTier` only hides a link the person could not open anyway, and
 * every destination is still guarded by its own route and RLS.
 *
 * Composition rule: the PRIMARY role's module sets the emphasis of the personal
 * lane. Secondary roles contribute a compact "Also covering" strip — never a
 * second full dashboard.
 */

type RoleModule = {
  label: string;
  /** One line describing what this role's lane is for. */
  mission: string;
  shortcuts: Shortcut[];
};

const TIER_RANK: Record<PermissionTier, number> = { member: 0, manager: 1, owner: 2 };

export const ROLE_MODULES: Record<OperationalRole, RoleModule> = {
  front_desk: {
    label: ROLE_LABELS.front_desk,
    mission: 'The desk: requests, forms, insurance answers, and the office rhythm.',
    shortcuts: [
      { id: 'fof', label: 'Financial options', to: '/fof' },
      { id: 'insurance', label: 'Insurance desk', to: '/insurance-desk' },
      { id: 'broken', label: 'Broken appointments', to: '/broken-appointments' },
      { id: 'consents', label: 'Forms & consents', to: '/consents' },
      { id: 'letters', label: 'Letters', to: '/letters' },
      { id: 'numbers', label: 'Important numbers', to: '/important-numbers' },
      { id: 'deposit', label: 'Deposit log', to: '/deposit-log', minTier: 'manager', permission: 'edit_closeout_history' },
    ],
  },
  hygienist: {
    label: ROLE_LABELS.hygienist,
    mission: 'Your day, your assigned work, and the procedures you rely on.',
    shortcuts: [
      { id: 'checklists', label: 'My checklists', to: '/checklists' },
      { id: 'procedures', label: 'Procedures', to: '/playbook/procedures' },
      { id: 'training', label: 'Training', to: '/training' },
      { id: 'calendar', label: 'Office calendar', to: '/office-calendar' },
      { id: 'timesheet', label: 'My time', to: '/timesheet' },
    ],
  },
  dental_assistant: {
    label: ROLE_LABELS.dental_assistant,
    mission: 'Room readiness, closeout, and the tasks that keep the day moving.',
    shortcuts: [
      { id: 'checklists', label: 'My checklists', to: '/checklists' },
      { id: 'procedures', label: 'Procedures', to: '/playbook/procedures' },
      { id: 'numbers', label: 'Important numbers', to: '/important-numbers' },
      { id: 'training', label: 'Training', to: '/training' },
      { id: 'incident', label: 'Incident reports', to: '/incident-reports' },
    ],
  },
  dentist: {
    label: ROLE_LABELS.dentist,
    mission: 'Your board, the huddle, and the decisions only you can make.',
    shortcuts: [
      { id: 'huddle', label: 'Morning huddle', to: '/morning-huddle' },
      { id: 'playbook', label: 'Playbook', to: '/playbook' },
      { id: 'goals', label: 'Goals', to: '/goals' },
      { id: 'letters', label: 'Letters', to: '/letters' },
    ],
  },
  treatment_coordinator: {
    label: ROLE_LABELS.treatment_coordinator,
    mission: 'Treatment acceptance: financial options, consents, and follow-through.',
    shortcuts: [
      { id: 'fof', label: 'Financial options', to: '/fof' },
      { id: 'consents', label: 'Forms & consents', to: '/consents' },
      { id: 'insurance', label: 'Insurance desk', to: '/insurance-desk' },
      { id: 'broken', label: 'Broken appointments', to: '/broken-appointments' },
      { id: 'letters', label: 'Letters', to: '/letters' },
      { id: 'training', label: 'Training', to: '/training' },
    ],
  },
  office_manager: {
    label: ROLE_LABELS.office_manager,
    mission: 'Running the floor: approvals, people, and follow-through.',
    shortcuts: [
      { id: 'approvals', label: 'Approvals', to: '/approvals', minTier: 'manager' },
      { id: 'team', label: 'Team', to: '/team', minTier: 'manager' },
      { id: 'checklists', label: 'Checklists', to: '/checklists' },
      { id: 'reports', label: 'Reports', to: '/reports', minTier: 'manager', permission: 'view_reports' },
    ],
  },
  assistant_office_manager: {
    label: ROLE_LABELS.assistant_office_manager,
    mission: 'Backing up the front office: checklists, coverage, and follow-through.',
    // minTier hides the admin surfaces from members holding this role — an
    // operational role never widens a permission tier.
    shortcuts: [
      { id: 'checklists', label: 'Checklists', to: '/checklists' },
      { id: 'numbers', label: 'Important numbers', to: '/important-numbers' },
      { id: 'playbook', label: 'Playbook', to: '/playbook' },
      { id: 'training', label: 'Training', to: '/training' },
      { id: 'reports', label: 'Reports', to: '/reports', minTier: 'manager', permission: 'view_reports' },
      { id: 'approvals', label: 'Approvals', to: '/approvals', minTier: 'manager' },
      { id: 'team', label: 'Team', to: '/team', minTier: 'manager' },
    ],
  },
  sterilization: {
    label: ROLE_LABELS.sterilization,
    mission: 'Turnover and instrument workflow, as the office has configured it.',
    shortcuts: [
      { id: 'checklists', label: 'My checklists', to: '/checklists' },
      { id: 'procedures', label: 'Procedures', to: '/playbook/procedures' },
      { id: 'training', label: 'Training', to: '/training' },
    ],
  },
  floater: {
    label: ROLE_LABELS.floater,
    mission: 'Wherever you land today — the office essentials in one place.',
    shortcuts: [
      { id: 'checklists', label: 'My checklists', to: '/checklists' },
      { id: 'playbook', label: 'Playbook', to: '/playbook' },
      { id: 'numbers', label: 'Important numbers', to: '/important-numbers' },
      { id: 'training', label: 'Training', to: '/training' },
    ],
  },
  other: {
    label: ROLE_LABELS.other,
    mission: 'Your assigned work and the office essentials.',
    shortcuts: [
      { id: 'checklists', label: 'My checklists', to: '/checklists' },
      { id: 'playbook', label: 'Playbook', to: '/playbook' },
      { id: 'training', label: 'Training', to: '/training' },
    ],
  },
};

/**
 * Shortcuts for a role, filtered to what this person can open: their
 * permission tier, or a per-employee grant that unlocks a tier-gated link
 * (the same grant RLS enforces server-side). A secondary role never widens
 * permission — it only reorders presentation.
 */
export function shortcutsFor(
  role: OperationalRole,
  tier: PermissionTier,
  grants: ReadonlySet<string> = new Set(),
): Shortcut[] {
  return ROLE_MODULES[role].shortcuts.filter(
    s =>
      !s.minTier ||
      TIER_RANK[tier] >= TIER_RANK[s.minTier] ||
      (s.permission !== undefined && grants.has(s.permission)),
  );
}

export function roleLabel(role: OperationalRole): string {
  return ROLE_MODULES[role]?.label ?? role;
}

export function roleMission(role: OperationalRole): string {
  return ROLE_MODULES[role]?.mission ?? '';
}
