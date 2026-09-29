import type { ManagerView, MemberView, OwnerView } from './types';
import {
  assistantFixture, frontDeskBackupAssistFixture, frontDeskBackupOnlyFixture, frontDeskFixture, hygienistFixture,
  managerAttendanceFixture, managerClosedFixture, managerFixture, managerFrontDeskFixture, managerNewFixture,
  managerOffPaceFixture, memberClearFixture, memberHiddenFinancialsFixture, memberLateArrivalFixture, memberNewFixture,
  ownerClosedFixture, ownerFixture, ownerIncompleteFixture, ownerNewFixture, ownerPartialFixture,
} from './fixtures';

/**
 * DESIGN-REVIEW MATRIX (temporary).
 *
 * One entry per composition the owner asked to review — including the states
 * that matter most in production: closed office, brand-new office, metrics
 * off pace, a partially recorded month, attendance requests and reports in
 * the queue, hidden financial metrics, backup roles, and a brand-new
 * employee. Each carries the labels the review needs: permission tier,
 * primary operational role, backup roles, the real hook behind every widget,
 * and what was deliberately left out because Purple Envelope does not hold
 * trustworthy data for it.
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
  ['Latest closeout facts', 'usePracticeVitals (deposit_logs) → owner-pulse.ts buildDailyBrief, deterministic'],
  ['Performance strip + chart', 'performance-series.ts over deposit_logs closeouts; report history (practice_report_imports, posting date) as a separate labeled view — never blended; completeness against the office calendar (useOfficeDays)'],
  ['Goal meters', 'goal-progress.ts → metric-pace.ts — each metric vs ONLY its own org-configured goal, paced by office days from the office calendar; partial months suppress a behind verdict'],
  ['Worth a look', 'home-insights.ts — fixed rules over the same rows, with receipts; never repeats a meter or the queue'],
  ['Cancellations and no-shows', 'missed-trend.ts — Dentrix postings (missed_appointment_events) first, Close the Day counts otherwise; unassigned kept apart'],
  ['Tools', 'tools.ts buildToolGroups — assigned role first, coverage today, management, backup roles and the long tail on request; one destination once'],
];

const MEMBER_SOURCES: [string, string][] = [
  ['My next move + Needs you', 'my-work.ts buildMyWork over useTardies, useIncidentReports, useMyAccountabilityReports, useUnresolvedBypasses, useMyKnowledgeAcknowledgments, useTrainingAssignments, useMissingShifts, useChecklistGating, useMessagesCloseout, useMyPtoRequests, useMyCorrectionRequests'],
  ['Our office pulse', 'the same performance-series / goal-progress block the owner reads, limited to metrics whose visibility is "everyone"; no report history, no observations'],
  ['For my role', 'member-pulse.ts rolePulseItems — operational role, never permission tier'],
  ['Office goal', 'useTeamGoals (shared sprints)'],
  ['My time & PTO', 'useTodayEntry + useCurrentPtoBalance; late-arrival standing from useLateArrivalRule + late-arrivals.ts standingToday'],
  ['Tools', 'useMyOperationalRoles + tools.ts buildToolGroups'],
];

const MANAGER_SOURCES: [string, string][] = [
  ['Right now summary, Today, status lines, spotlight', 'home-brief.ts buildHomeBrief — pure, from the sources below; routine lateness is calm, never a headline'],
  ...PULSE_SOURCES.slice(1, 5),
  ['Needs you (grouped)', 'useAttentionItems → attention/deriveAttention → attention/groups.ts — consequence order, repeated kinds folded into expandable categories, one navigation action per row'],
  ['Today exceptions + count line', 'useOrgAttendanceSnapshot + staffing.ts (owners excluded; phase-aware)'],
  ['Last closeout line', 'useRecentDepositLogs(14) + closeDayStatus (pure)'],
  ['Inbox line (wrap-up)', 'useMessagesCloseout'],
  ['Mine', 'my-work.ts buildMyWork over the manager’s own records'],
  ...PULSE_SOURCES.slice(5),
];

const ADMIN_SOURCES: [string, string][] = [
  ['Right now summary + staffing', 'home-brief.ts stateSummary + useOrgAttendanceSnapshot + staffing.ts (owners excluded; phase-aware)'],
  ['Needs you (grouped)', 'useAttentionItems → attention/deriveAttention → attention/groups.ts'],
  ['Attendance to review', 'staffing.ts attendanceReview — only facts already true'],
  ['Mine', 'my-work.ts buildMyWork over the owner’s own records'],
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
    sources: ADMIN_SOURCES,
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
    slug: 'owner-incomplete',
    title: 'Owner — incomplete history: closeouts since Feb 17, a report package for Nov–Jan, no goals set',
    tier: 'Owner',
    primary: 'Dentist',
    secondary: 'None',
    view: ownerIncompleteFixture,
    sources: ADMIN_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'A blended production line across closeouts and the report package — the two are separate labeled views.',
      'A pace verdict — no goal is configured, so the meters say "No goal set" and offer the setup action.',
    ],
  },
  {
    slug: 'owner-partial',
    title: 'Owner — partially recorded month: two office days have no closeout (Thu Mar 12)',
    tier: 'Owner',
    primary: 'Dentist',
    secondary: 'None',
    view: ownerPartialFixture,
    sources: ADMIN_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'A behind-pace verdict — two office days are unrecorded, so the meters show the totals with a partial-data label and the way to complete the records.',
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
    slug: 'manager-attendance',
    title: 'Manager — an excuse request, an attendance report to meet on, three closeouts awaiting seal',
    tier: 'Manager',
    primary: 'Office manager',
    secondary: 'None',
    view: managerAttendanceFixture,
    sources: MANAGER_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'A per-tardy alert — Marcus T. arrived late and acknowledged it; the rule counts it, Home does not headline it.',
    ],
  },
  {
    slug: 'manager-closed',
    title: 'Manager — after close: one person still in, closeout unsealed',
    tier: 'Manager',
    primary: 'Office manager',
    secondary: 'None',
    view: managerClosedFixture,
    sources: MANAGER_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'Live staffing — the workday is over; Today names who is still clocked in and nothing else.',
    ],
  },
  {
    slug: 'manager-off-pace',
    title: 'Manager — collections behind pace, challenge off track',
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
    sources: MANAGER_SOURCES,
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
    slug: 'member-late-arrival',
    title: 'Team member — a late arrival to answer, an attendance report to sign, a request pending',
    tier: 'Team member',
    primary: 'Hygienist',
    secondary: 'None',
    view: memberLateArrivalFixture,
    sources: MEMBER_SOURCES,
    omitted: [
      ...NO_CLINICAL,
      'A written explanation for the unexcused late arrival — acknowledging needs none; an excuse request is the person’s choice.',
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
    title: 'Front desk primary, dental assisting backup (covering today)',
    tier: 'Team member',
    primary: 'Front desk',
    secondary: 'Dental assistant (covering today)',
    view: frontDeskBackupAssistFixture,
    sources: [
      ...MEMBER_SOURCES,
      ['Covering today', 'employee_operational_roles.is_primary + starts_on/ends_on window'],
    ],
    omitted: NO_CLINICAL,
  },
  {
    slug: 'front-desk-backup-only',
    title: 'Front desk primary, dental assisting as a backup capability only',
    tier: 'Team member',
    primary: 'Front desk',
    secondary: 'Dental assistant (backup, not assigned today)',
    view: frontDeskBackupOnlyFixture,
    sources: [
      ...MEMBER_SOURCES,
      ['Backup role', 'employee_operational_roles without a coverage window — tools on request, nothing in the queue'],
    ],
    omitted: [...NO_CLINICAL, 'Dental-assistant tasks in the queue — a backup capability is not an assignment.'],
  },
];

export const scenarioBySlug = (slug?: string) => SCENARIOS.find((s) => s.slug === slug);
