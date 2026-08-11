import type { ManagerView, MemberView, OwnerView } from './types';
import {
  assistantFixture, frontDeskBackupAssistFixture, frontDeskFixture, hygienistFixture,
  managerClosedFixture, managerFixture, managerFrontDeskFixture, managerNewFixture,
  managerOffPaceFixture, memberClearFixture, memberHiddenFinancialsFixture, memberNewFixture,
  ownerClosedFixture, ownerFixture, ownerNewFixture,
} from './fixtures';

/**
 * DESIGN-REVIEW MATRIX (temporary).
 *
 * One entry per composition the owner asked to review — including the states
 * that matter most in production: closed office, brand-new office, metrics
 * off pace, hidden financial metrics, and brand-new employee. Each carries
 * the labels the review needs: permission tier, primary operational role,
 * backup roles, the real hook behind every widget, and what was deliberately
 * left out because Purple Envelope does not hold trustworthy data for it.
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
  'Per-patient revenue and payroll — only office-day aggregates from the deposit log exist.',
  'Patient names, appointments, balances, and treatment detail — outside the non-HIPAA boundary.',
  'Individual production attribution and per-person rankings — the pulse is office-level only.',
];

const PULSE_SOURCES: [string, string][] = [
  ['Daily pulse + summary sentence', 'usePracticeVitals (deposit_logs) → owner-pulse.ts, deterministic'],
  ['Month pace lines', 'metric-pace.ts — each metric vs ONLY its own org-configured goal'],
  ['New-patient pipeline', 'deposit_logs new_patients_scheduled_count (never goal progress)'],
];

const MEMBER_SOURCES: [string, string][] = [
  ['Next move', 'derived from the first open item across my assigned-work hooks'],
  ['Our office pulse', 'usePracticeVitals → member-pulse.ts, filtered by per-metric visibility'],
  ['For my role', 'member-pulse.ts rolePulseItems — operational role, never permission tier'],
  ['My open work', 'useMyTrainingAssignments, useMyAcknowledgments, useChecklistBypasses'],
  ['Office goal', 'useTeamGoals (shared sprints)'],
  ['My time & PTO', 'useTodayEntry + useCurrentPtoBalance (analytics live on Timesheet)'],
  ['Role lane shortcuts', 'useMyOperationalRoles + static route registry (opRoles.ts)'],
];

const MANAGER_SOURCES: [string, string][] = [
  ...PULSE_SOURCES,
  ['What needs your hands', 'manager-pulse.ts buildInterventionQueue — fixed consequence order'],
  ['Close the Day status', 'useDepositLog(today) → closeDayStatus (pure)'],
  ['Staffing', 'useOrgAttendanceSnapshot + staffing.ts (owners excluded; phase-aware)'],
  ['Approvals / reviews / training', 'useApprovalCounts, useAccountability, useTraining'],
];

const ADMIN_SOURCES: [string, string][] = [
  ['Office status + staffing', 'useOrgAttendanceSnapshot + staffing.ts (owners excluded; phase-aware)'],
  ['Approvals', 'useApprovalCounts'],
  ['Attendance to review', 'staffing.ts attendanceReview — only facts already true'],
  ['Acknowledgments', 'useKnowledgeAcknowledgments'],
  ['Training', 'useTrainingAssignments'],
  ['Goals', 'useGoals / useTeamGoals'],
  ...PULSE_SOURCES,
];

export const SCENARIOS: Scenario[] = [
  {
    slug: 'owner',
    title: 'Owner — open office with activity',
    tier: 'Owner',
    primary: 'Dentist',
    secondary: 'None',
    view: ownerFixture,
    sources: [
      ...ADMIN_SOURCES,
      ["What I'd look at", 'owner-pulse.ts ownerRecommendation — fixed-priority signals with receipts'],
      ['Records at owner review', 'useAccountabilityReports'],
    ],
    omitted: NO_CLINICAL,
  },
  {
    slug: 'owner-closed',
    title: 'Owner — office closed for the day (10:32 PM)',
    tier: 'Owner',
    primary: 'Dentist',
    secondary: 'None',
    view: ownerClosedFixture,
    sources: ADMIN_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'Live staffing — the workday is over, so no "on the floor" claim is made and no exceptions are invented.',
    ],
  },
  {
    slug: 'owner-new',
    title: 'Owner — brand-new office',
    tier: 'Owner',
    primary: 'Dentist',
    secondary: 'None',
    view: ownerNewFixture,
    sources: ADMIN_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'Attendance trend — no history exists, so it renders on Team as "not enough history yet", never as 0%.',
    ],
  },
  {
    slug: 'manager',
    title: 'Manager — open office, live queues',
    tier: 'Manager',
    primary: 'Office manager',
    secondary: 'None',
    view: managerFixture,
    sources: MANAGER_SOURCES,
    omitted: NO_CLINICAL,
  },
  {
    slug: 'manager-closed',
    title: 'Manager — after close, closeout saved but unsealed',
    tier: 'Manager',
    primary: 'Office manager',
    secondary: 'None',
    view: managerClosedFixture,
    sources: MANAGER_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'Live staffing — the workday is over; the staffing band collapses to a calm summary.',
    ],
  },
  {
    slug: 'manager-off-pace',
    title: 'Manager — collections materially behind pace',
    tier: 'Manager',
    primary: 'Office manager',
    secondary: 'None',
    view: managerOffPaceFixture,
    sources: MANAGER_SOURCES,
    omitted: NO_CLINICAL,
  },
  {
    slug: 'manager-new',
    title: 'Manager — brand-new office',
    tier: 'Manager',
    primary: 'Office manager',
    secondary: 'None',
    view: managerNewFixture,
    sources: MANAGER_SOURCES,
    omitted: NO_CLINICAL,
  },
  {
    slug: 'manager-front-desk',
    title: 'Manager, also covering front desk',
    tier: 'Manager',
    primary: 'Front desk',
    secondary: 'Office manager (covering today)',
    view: managerFrontDeskFixture,
    sources: [...MANAGER_SOURCES, ['Personal lane', 'useMyOperationalRoles + opRoles.ts']],
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
    slug: 'member-hidden-financials',
    title: 'Team member — production & collections set to admins only',
    tier: 'Team member',
    primary: 'Hygienist',
    secondary: 'None',
    view: memberHiddenFinancialsFixture,
    sources: MEMBER_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'Production and collections — hidden by their own visibility settings; omitted cleanly, no locked teaser.',
    ],
  },
  {
    slug: 'member-clear',
    title: 'Team member — nothing assigned (no open work)',
    tier: 'Team member',
    primary: 'Hygienist',
    secondary: 'None',
    view: memberClearFixture,
    sources: MEMBER_SOURCES,
    omitted: [...NO_CLINICAL, 'A wall of zeros — "clear" is said once, not five times.'],
  },
  {
    slug: 'member-new',
    title: 'Team member — brand-new employee',
    tier: 'Team member',
    primary: 'Hygienist',
    secondary: 'None',
    view: memberNewFixture,
    sources: MEMBER_SOURCES,
    omitted: [...NO_CLINICAL, 'Hours and open items are real zeros — a new account genuinely starts at zero.'],
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
