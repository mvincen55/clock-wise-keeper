import type { ManagerView, MemberView, OwnerView } from './types';
import {
  assistantFixture, frontDeskBackupAssistFixture, frontDeskFixture, hygienistFixture,
  managerFixture, managerFrontDeskFixture, ownerFixture,
} from './fixtures';

/**
 * DESIGN-REVIEW MATRIX (temporary).
 *
 * One entry per composition the owner asked to review. Each carries the labels
 * the review needs: permission tier, primary operational role, backup roles,
 * the real hook behind every widget, and what was deliberately left out because
 * Purple Envelope does not hold trustworthy data for it.
 */

export type Scenario = {
  slug: string;
  title: string;
  tier: string;
  primary: string;
  secondary: string;
  view: OwnerView | ManagerView | MemberView;
  /** widget → the live hook that fills it outside this preview */
  sources: [string, string][];
  omitted: string[];
};

const NO_CLINICAL = [
  'Production, collections, revenue, and payroll — not stored by Purple Envelope.',
  'Patient names, appointments, balances, and treatment detail — outside the non-HIPAA boundary.',
  'Schedule utilisation and practice-health scores — would require PMS data the app does not read.',
];

const MEMBER_SOURCES: [string, string][] = [
  ['Status + today', 'useTodayTimeEntries / GlobalTimeControl state'],
  ['Next action', 'derived from the first open item across the hooks below'],
  ['Open for me', 'useMyTrainingAssignments, useMyAcknowledgments, useChecklistBypasses'],
  ['My recorded time chart', 'time_entries, self-scoped by RLS'],
  ['PTO balance', 'useCurrentPtoBalance'],
  ['Goals', 'useGoals (own + office sprints)'],
  ['Role lane shortcuts', 'useMyOperationalRoles + static route registry (opRoles.ts)'],
];

const ADMIN_SOURCES: [string, string][] = [
  ['Roster / here now', 'useOrgAttendanceSnapshot'],
  ['Approvals', 'useApprovalCounts'],
  ['Arrivals chart', 'attendance_day_status, last 14 days'],
  ['Checklist progress', 'useChecklists'],
  ['Acknowledgments', 'useKnowledgeAcknowledgments'],
  ['Training', 'useTrainingAssignments'],
  ['Goals', 'useGoals / useTeamGoals'],
];

export const SCENARIOS: Scenario[] = [
  {
    slug: 'owner',
    title: 'Owner — practice command centre',
    tier: 'Owner',
    primary: 'Dentist',
    secondary: 'None',
    view: ownerFixture,
    sources: [
      ...ADMIN_SOURCES,
      ['Practice vitals', 'usePracticeVitals (deposit_logs — only when the office records deposits)'],
      ['Records at owner review', 'useAccountabilityReports'],
    ],
    omitted: NO_CLINICAL,
  },
  {
    slug: 'manager',
    title: 'Manager — operational cockpit',
    tier: 'Manager',
    primary: 'Office manager',
    secondary: 'None',
    view: managerFixture,
    sources: ADMIN_SOURCES,
    omitted: NO_CLINICAL,
  },
  {
    slug: 'manager-front-desk',
    title: 'Manager, also covering front desk',
    tier: 'Manager',
    primary: 'Front desk',
    secondary: 'Office manager (covering today)',
    view: managerFrontDeskFixture,
    sources: [...ADMIN_SOURCES, ['Personal lane', 'useMyOperationalRoles + opRoles.ts']],
    omitted: NO_CLINICAL,
  },
  {
    slug: 'front-desk',
    title: 'Team member — front desk',
    tier: 'Team member',
    primary: 'Front desk',
    secondary: 'None',
    view: frontDeskFixture,
    sources: MEMBER_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'Today’s appointment list — front desk sees office tasks only, never the patient schedule.',
    ],
  },
  {
    slug: 'hygienist',
    title: 'Team member — hygienist',
    tier: 'Team member',
    primary: 'Hygienist',
    secondary: 'None',
    view: hygienistFixture,
    sources: MEMBER_SOURCES,
    omitted: [...NO_CLINICAL, 'Per-provider clinical output — no such data exists in the app.'],
  },
  {
    slug: 'dental-assistant',
    title: 'Team member — dental assistant',
    tier: 'Team member',
    primary: 'Dental assistant',
    secondary: 'None',
    view: assistantFixture,
    sources: MEMBER_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'Operatory and inventory state — only surfaced where an office has configured checklists for it.',
    ],
  },
  {
    slug: 'front-desk-backup-assistant',
    title: 'Front desk primary, dental assisting backup',
    tier: 'Team member',
    primary: 'Front desk',
    secondary: 'Dental assistant (covering today)',
    view: frontDeskBackupAssistFixture,
    sources: [
      ...MEMBER_SOURCES,
      ['Backup lane', 'employee_operational_roles.is_primary + starts_on/ends_on window'],
    ],
    omitted: NO_CLINICAL,
  },
];

export const scenarioBySlug = (slug?: string) => SCENARIOS.find((s) => s.slug === slug);
