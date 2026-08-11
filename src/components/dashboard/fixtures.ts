import type { OperationalRole } from '@/lib/schedule-reader/types';
import type { DayVitals, VitalsSummary, VitalsVisibility } from '@/hooks/usePracticeVitals';
import type { DepositLog } from '@/hooks/useDepositLog';
import {
  buildDailyBrief, buildGoalBrief, buildMonthDetail, dailySummary, monthPaceLines,
  ownerRecommendation, type GoalLike, type OwnerPulseInput,
} from '@/lib/owner-pulse';
import { buildInterventionQueue, buildManagerBrief, closeDayStatus } from '@/lib/manager-pulse';
import { memberOfficeLines, rolePulseItems } from '@/lib/member-pulse';
import { shortcutsFor, roleLabel, roleMission } from './opRoles';
import type {
  ManagerView, MemberView, OwnerView, PermissionTier, RoleContext, RoleLane, Signal,
  StaffingSummary,
} from './types';

/**
 * DESIGN-REVIEW FIXTURES ONLY.
 *
 * These objects exist so the /design-review surface can render every role
 * composition without a session, without permissions, and without touching the
 * database. They are never imported by the authenticated app. The names are
 * obviously fictional so a fixture can never be mistaken for office data.
 *
 * Only RAW RECORDED INPUTS are invented here — every pace verdict, briefing
 * sentence, recommendation, queue ordering, and visibility filter below is
 * computed by the same production functions the live dashboards call
 * (owner-pulse.ts, manager-pulse.ts, member-pulse.ts). Fixtures must never
 * reimplement or hard-code that business logic.
 */

const header = (roleLabel: string, personName: string, timeLabel = '9:42 AM') => ({
  officeName: 'Sample Family Dental',
  roleLabel,
  personName,
  dateLabel: 'Tue, Mar 3, 2026',
  timeLabel,
});

function context(
  tier: PermissionTier,
  tierLabel: string,
  primary: OperationalRole | null,
  secondary: OperationalRole[] = [],
  coveringToday: OperationalRole[] = [],
): RoleContext {
  return {
    tier,
    tierLabel,
    primary,
    primaryLabel: primary ? roleLabel(primary) : null,
    secondary,
    secondaryLabels: secondary.map(roleLabel),
    coveringToday,
    coveringTodayLabels: coveringToday.map(roleLabel),
  };
}

function lanesFor(ctx: RoleContext, urgent: Signal[] = []): RoleLane[] {
  const lanes: RoleLane[] = [];
  if (ctx.primary) {
    lanes.push({
      role: ctx.primary,
      label: roleLabel(ctx.primary),
      kind: 'primary',
      mission: roleMission(ctx.primary),
      shortcuts: shortcutsFor(ctx.primary, ctx.tier),
      urgent: [],
    });
  }
  for (const role of ctx.secondary) {
    const covering = ctx.coveringToday.includes(role);
    lanes.push({
      role,
      label: roleLabel(role),
      kind: 'backup',
      mission: roleMission(role),
      shortcuts: shortcutsFor(role, ctx.tier).slice(0, 4),
      urgent: covering ? urgent : [],
      covering,
      note: covering ? 'Also covering today' : 'Backup — can cover, not assigned',
    });
  }
  return lanes;
}

const bypassUrgent: Signal[] = [
  {
    id: 'bypass',
    label: 'Checklist bypass reasons owed',
    detail: 'A sentence closes each one. It never blocks your clock-out.',
    value: '1',
    href: '/checklists',
    tone: 'attention',
  },
];

/* ----------------------------- staffing ------------------------------- */

const staffingOpen: StaffingSummary = {
  office: { phase: 'open', headline: 'Open', detail: 'Workday runs until 5:00 PM.' },
  expectedNow: 8,
  presentNow: 6,
  missingNow: 1,
  scheduledToday: 8,
  rows: [
    { id: '1', name: 'Dana R.', status: 'In', tone: 'steady' },
    { id: '2', name: 'Marcus T.', status: 'In · late 12m', tone: 'attention' },
    { id: '3', name: 'Priya S.', status: 'In', tone: 'steady' },
    { id: '4', name: 'Jo B.', status: 'Approved off', tone: 'calm' },
    { id: '5', name: 'Ken W.', status: 'Not in yet', tone: 'attention' },
    { id: '6', name: 'Alice N.', status: 'In — remote', tone: 'steady' },
    { id: '7', name: 'Sam K.', status: 'Starts 1:00 PM', tone: 'calm' },
    { id: '8', name: 'Rita M.', status: 'Clocked out', tone: 'calm' },
  ],
  reviewCount: 1,
  reviewDetail: '1 unreviewed late arrival',
};

const staffingClosed: StaffingSummary = {
  office: {
    phase: 'after_close',
    headline: 'Closed for the day',
    detail: "Today's workday ended at 5:00 PM.",
  },
  expectedNow: null,
  presentNow: null,
  missingNow: null,
  scheduledToday: 2,
  rows: [],
  reviewCount: 0,
  reviewDetail: '',
};

const staffingNewOffice: StaffingSummary = {
  office: {
    phase: 'no_schedule',
    headline: 'No one scheduled today',
    detail: 'No shifts are on the schedule for today.',
  },
  expectedNow: null,
  presentNow: null,
  missingNow: null,
  scheduledToday: 0,
  rows: [],
  reviewCount: 0,
  reviewDetail: '',
};

/* --------------------------- recorded inputs --------------------------- */

const fxDay = (date: string, over: Partial<DayVitals> = {}): DayVitals => ({
  date,
  productionCents: 742_000,
  collectedCents: 615_000,
  newPatientsScheduled: 3,
  newPatientsSeen: 2,
  hygieneCancellations: 2,
  hygieneNoShows: 0,
  doctorCancellations: 0,
  doctorNoShows: 1,
  ...over,
});

const fxSummary = (over: Partial<VitalsSummary> = {}): VitalsSummary => ({
  productionCents: 1_390_000,
  collectedCents: 900_000,
  newPatientsScheduled: 5,
  newPatientsSeen: 4,
  newPatientsScheduledRecordedDays: 2,
  newPatientsSeenRecordedDays: 2,
  hygieneCancellations: 3,
  hygieneNoShows: 0,
  doctorCancellations: 0,
  doctorNoShows: 1,
  disruptions: 4,
  days: 2,
  ...over,
});

const fxGoals: GoalLike[] = [
  {
    id: 'g1', title: 'Same-day treatment acceptance', metric: 'accepted plans',
    progress: 12, target_count: 20, starts_on: '2026-03-01', ends_on: '2026-03-31', status: 'active',
  },
  {
    id: 'g2', title: 'Morning huddle on time', metric: 'huddles',
    progress: 9, target_count: 10, starts_on: '2026-02-24', ends_on: '2026-03-07', status: 'active',
  },
];

const fxMonths = [
  { month: '2025-10', productionCents: 12_100_000, disruptions: 24 },
  { month: '2025-11', productionCents: 11_400_000, disruptions: 19 },
  { month: '2025-12', productionCents: 9_800_000, disruptions: 28 },
  { month: '2026-01', productionCents: 13_200_000, disruptions: 22 },
  { month: '2026-02', productionCents: 14_800_000, disruptions: 21 },
  { month: '2026-03', productionCents: 1_390_000, disruptions: 4 },
];

const fxPrevMonth: VitalsSummary & { month: string } = {
  month: '2026-02',
  productionCents: 14_800_000,
  collectedCents: 14_100_000,
  newPatientsScheduled: 31,
  newPatientsSeen: 26,
  newPatientsScheduledRecordedDays: 19,
  newPatientsSeenRecordedDays: 19,
  hygieneCancellations: 12,
  hygieneNoShows: 4,
  doctorCancellations: 3,
  doctorNoShows: 2,
  disruptions: 21,
  days: 19,
};

const fxTargets = {
  productionCents: 16_000_000,
  collectionsCents: 15_000_000,
  newPatientsSeen: 40,
};

/** Mid-morning, Tue Mar 3: yesterday closed out, today's closeout still ahead. */
const openPulseInput: OwnerPulseInput = {
  today: '2026-03-03',
  todayVitals: null,
  latest: fxDay('2026-03-02'),
  thisMonth: fxSummary(),
  prevMonth: fxPrevMonth,
  monthElapsed: 3 / 31,
  targets: fxTargets,
  weeklyNewPatientPace: 10, // = ceil(40 / (31/7)), matching weeklyPaceForMonth
  scheduledThisWeek: 5,
  scheduledThisWeekRecordedDays: 2,
  officePhase: 'open',
};

/** A fake saved deposit_logs row — only the fields the pure helpers read. */
const fxTodayLog = (over: Partial<DepositLog> = {}): DepositLog =>
  ({
    id: 'fx-log',
    deposit_date: '2026-03-03',
    production_cents: 815_000,
    new_patients_scheduled_count: 4,
    new_patients_seen_count: 3,
    sealed_at: null,
    sealed_by: null,
    needs_manager_review: false,
    staffing_assessment: 'about_right',
    ...over,
  }) as DepositLog;

/* ------------------------------- owner -------------------------------- */

const ownerContext = context('owner', 'Owner', 'dentist');

const openBrief = buildDailyBrief(openPulseInput);

/** Established office, mid-morning, with real activity. */
export const ownerFixture: OwnerView = {
  kind: 'owner',
  header: header('Owner', 'Good morning, Megan'),
  roleContext: ownerContext,
  lanes: lanesFor(ownerContext),
  office: staffingOpen.office,
  summary: dailySummary(openPulseInput, openBrief, 7),
  brief: openBrief,
  lookAt: ownerRecommendation(openPulseInput, fxGoals),
  decisionCount: 7,
  decisions: [
    { id: '1', label: 'Approvals pending', detail: '2 PTO · 1 correction · 1 change', value: '4', href: '/approvals', tone: 'attention' },
    { id: '2', label: 'Accountability records at owner review', detail: 'Nobody reviews their own record — these have reached you.', value: '2', href: '/management', tone: 'urgent' },
    { id: '3', label: 'Policy acknowledgments overdue', detail: 'Published versions still unsigned past their due date.', value: '1', href: '/playbook', tone: 'attention' },
  ],
  goal: buildGoalBrief(fxGoals, '2026-03-03'),
  month: buildMonthDetail(openPulseInput, fxMonths),
  staffing: staffingOpen,
  exceptions: [
    { id: 'p1', label: 'Unresolved office notes', detail: 'Notes Purple Envelope flagged, still open.', value: '3', href: '/inbox', tone: 'attention' },
    { id: 'p2', label: '1 attendance item needs review', detail: '1 unreviewed late arrival', value: '1', href: '/team', tone: 'attention' },
  ],
};

/** The same office at 10:32 PM — today closed out clean, decisions clear. */
const closedPulseInput: OwnerPulseInput = {
  ...openPulseInput,
  todayVitals: fxDay('2026-03-03', {
    productionCents: 815_000,
    collectedCents: 790_000,
    newPatientsScheduled: 4,
    newPatientsSeen: 3,
    hygieneCancellations: 0,
    doctorNoShows: 0,
  }),
  latest: fxDay('2026-03-03', {
    productionCents: 815_000,
    collectedCents: 790_000,
    newPatientsScheduled: 4,
    newPatientsSeen: 3,
    hygieneCancellations: 0,
    doctorNoShows: 0,
  }),
  thisMonth: fxSummary({
    productionCents: 2_205_000,
    collectedCents: 1_690_000,
    newPatientsScheduled: 9,
    newPatientsSeen: 7,
    newPatientsScheduledRecordedDays: 3,
    newPatientsSeenRecordedDays: 3,
    days: 3,
  }),
  officePhase: 'after_close',
};

const closedBrief = buildDailyBrief(closedPulseInput);

export const ownerClosedFixture: OwnerView = {
  ...ownerFixture,
  header: header('Owner', 'Good evening, Megan', '10:32 PM'),
  office: staffingClosed.office,
  summary: dailySummary(closedPulseInput, closedBrief, 0),
  brief: closedBrief,
  lookAt: ownerRecommendation(closedPulseInput, fxGoals),
  decisionCount: 0,
  decisions: [],
  month: buildMonthDetail(closedPulseInput, fxMonths),
  staffing: staffingClosed,
  exceptions: [],
};

/** A brand-new office: setup guidance, not a wall of zeros. */
const newPulseInput: OwnerPulseInput = {
  today: '2026-03-03',
  todayVitals: null,
  latest: null,
  thisMonth: fxSummary({
    productionCents: 0, collectedCents: 0, newPatientsScheduled: 0, newPatientsSeen: 0,
    newPatientsScheduledRecordedDays: 0, newPatientsSeenRecordedDays: 0,
    hygieneCancellations: 0, hygieneNoShows: 0, doctorCancellations: 0, doctorNoShows: 0,
    disruptions: 0, days: 0,
  }),
  prevMonth: null,
  monthElapsed: 3 / 31,
  targets: { productionCents: 0, collectionsCents: 0, newPatientsSeen: 0 },
  weeklyNewPatientPace: null,
  scheduledThisWeek: 0,
  scheduledThisWeekRecordedDays: 0,
  officePhase: 'no_schedule',
};

const newBrief = buildDailyBrief(newPulseInput);

export const ownerNewFixture: OwnerView = {
  kind: 'owner',
  header: header('Owner', 'Good morning, Megan'),
  roleContext: ownerContext,
  lanes: lanesFor(ownerContext),
  office: staffingNewOffice.office,
  summary: dailySummary(newPulseInput, newBrief, 0),
  brief: newBrief,
  lookAt: ownerRecommendation(newPulseInput, []),
  decisionCount: 0,
  decisions: [],
  goal: null,
  month: buildMonthDetail(newPulseInput, []),
  staffing: staffingNewOffice,
  exceptions: [],
};

/* ------------------------------ manager ------------------------------- */

type ManagerScenarioArgs = {
  ctx: RoleContext;
  input: OwnerPulseInput;
  staffing: StaffingSummary;
  todayLog: DepositLog | null;
  counts?: Partial<Parameters<typeof buildInterventionQueue>[0]>;
  personName?: string;
  timeLabel?: string;
  urgent?: Signal[];
};

/**
 * Every manager fixture runs the REAL manager-pulse layer: the briefing, the
 * performance lines, the close-day status, and the queue ordering are all
 * computed, never typed.
 */
function makeManager(args: ManagerScenarioArgs): ManagerView {
  const { ctx, input, staffing, todayLog } = args;
  const goals = args.counts?.goals ?? fxGoals;
  const closeDay = closeDayStatus(todayLog, staffing.office.phase);
  const managerBrief = buildManagerBrief(input, todayLog?.staffing_assessment ?? null);
  const interventions = buildInterventionQueue({
    input,
    closeDay,
    staffingAssessment: todayLog?.staffing_assessment ?? null,
    lowConfidenceCount: todayLog?.needs_manager_review ? 1 : 0,
    ptoRequests: 2,
    timeCorrections: 1,
    changeRequests: 1,
    managerReviews: 1,
    bypasses: 1,
    overdueAcks: 3,
    openTraining: 5,
    nudges: 0,
    ...args.counts,
    goals,
  });
  return {
    kind: 'manager',
    header: header('Practice manager', args.personName ?? 'Good morning, Sofia', args.timeLabel),
    roleContext: ctx,
    lanes: lanesFor(ctx, args.urgent ?? []),
    office: staffing.office,
    summary: managerBrief.summary,
    brief: managerBrief.daily,
    performance: monthPaceLines(input),
    pipeline: {
      scheduledThisWeek: input.scheduledThisWeek,
      recordedDays: input.scheduledThisWeekRecordedDays,
    },
    next: interventions.next,
    queue: interventions.queue,
    closeDay,
    staffing,
    goal: buildGoalBrief(goals, input.today),
  };
}

/** Open office, mid-morning: yesterday closed out, queues live. */
export const managerFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  input: openPulseInput,
  staffing: staffingOpen,
  todayLog: null,
});

/** Same office after close: today saved but not yet sealed. */
export const managerClosedFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  input: closedPulseInput,
  staffing: staffingClosed,
  todayLog: fxTodayLog(),
  personName: 'Good evening, Sofia',
  timeLabel: '10:32 PM',
  counts: { ptoRequests: 0, timeCorrections: 0, changeRequests: 0, managerReviews: 0, bypasses: 0, overdueAcks: 0, openTraining: 0 },
});

/** Performance materially off pace — collections behind its own goal. */
export const managerOffPaceFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  input: {
    ...openPulseInput,
    thisMonth: fxSummary({
      days: 8,
      productionCents: 3_600_000,
      collectedCents: 1_800_000,
      newPatientsSeen: 5,
      newPatientsSeenRecordedDays: 8,
      newPatientsScheduledRecordedDays: 8,
    }),
    monthElapsed: 10 / 31,
  },
  staffing: staffingOpen,
  todayLog: null,
  counts: { managerReviews: 0 },
});

/** Manager who also covers the front desk — personal lane stays compact. */
export const managerFrontDeskFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'front_desk', ['office_manager'], ['office_manager']),
  input: openPulseInput,
  staffing: staffingOpen,
  todayLog: null,
  urgent: bypassUrgent,
});

/** A new office from the manager's chair: clear queues, setup prompts. */
export const managerNewFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  input: newPulseInput,
  staffing: staffingNewOffice,
  todayLog: null,
  counts: {
    ptoRequests: 0, timeCorrections: 0, changeRequests: 0, managerReviews: 0,
    bypasses: 0, overdueAcks: 0, openTraining: 0, goals: [],
  },
});

/* ------------------------------- member ------------------------------- */

const ALL_VISIBLE: VitalsVisibility = { production: true, collections: true, newPatients: true };
const FINANCIALS_HIDDEN: VitalsVisibility = {
  production: false,
  collections: false,
  newPatients: true,
};

type MemberScenarioArgs = {
  name: string;
  ctx: RoleContext;
  visibility?: VitalsVisibility;
  input?: OwnerPulseInput;
  goals?: GoalLike[];
  overrides?: Partial<MemberView>;
};

/**
 * Member fixtures run the REAL member-pulse filters: which metrics appear is
 * decided by memberOfficeLines/rolePulseItems, never hand-picked here.
 */
function makeMember(args: MemberScenarioArgs): MemberView {
  const input = args.input ?? openPulseInput;
  const visibility = args.visibility ?? ALL_VISIBLE;
  return {
    kind: 'member',
    header: header('Team member', `Good morning, ${args.name}`),
    roleContext: args.ctx,
    lanes: lanesFor(args.ctx, bypassUrgent),
    next: {
      title: 'Read and sign a policy',
      detail: 'A published version is assigned to you.',
      href: '/playbook',
      cta: 'Open playbook',
    },
    officePulse: memberOfficeLines(input, visibility),
    officePulseNote: 'Financial figures update after Close the Day — they are not live during the day.',
    rolePulse: rolePulseItems(args.ctx.primary, input, visibility),
    mine: [
      { id: '1', label: 'Training assigned to me', detail: 'Modules not yet completed.', value: '2', href: '/training', tone: 'attention' },
      { id: '2', label: 'Policies to sign', detail: 'Signing means you read that exact version.', value: '1', href: '/playbook', tone: 'attention' },
      { id: '3', label: 'Bypass reasons owed', detail: 'Never blocks you — just needs a sentence.', value: '1', href: '/checklists', tone: 'attention' },
    ],
    goal: buildGoalBrief(args.goals ?? fxGoals, input.today),
    status: {
      label: 'On the clock',
      detail: '2h 14m recorded today. Clock out from the bar when you finish.',
      tone: 'steady',
    },
    utilities: [
      { id: 'hours', value: '2:14', label: 'Recorded today', detail: 'Full history on your timesheet', href: '/timesheet' },
      { id: 'pto', value: '46h', label: 'PTO balance', detail: '1–3 years', href: '/pto' },
      { id: 'timesheet', value: '→', label: 'Timesheet', detail: 'Punches, corrections, week totals', href: '/timesheet' },
    ],
    ...args.overrides,
  };
}

export const frontDeskFixture = makeMember({
  name: 'Dana',
  ctx: context('member', 'Team member', 'front_desk'),
  overrides: {
    next: {
      title: 'Answer an office request',
      detail: 'A request is sitting in your inbox with no reply yet.',
      href: '/inbox/requests',
      cta: 'Open inbox',
    },
  },
});

export const hygienistFixture = makeMember({
  name: 'Priya',
  ctx: context('member', 'Team member', 'hygienist'),
});

export const memberFixture = hygienistFixture;

export const assistantFixture = makeMember({
  name: 'Marcus',
  ctx: context('member', 'Team member', 'dental_assistant'),
  overrides: {
    next: {
      title: 'Finish the closeout checklist',
      detail: 'Two items are still open on today’s list.',
      href: '/checklists',
      cta: 'Open checklists',
    },
  },
});

/**
 * The office set production and collections to admin-only: both are simply
 * absent from this member's pulse — no locked teaser, no empty card. The
 * new-patient metric stays because its own setting is 'everyone'.
 */
export const memberHiddenFinancialsFixture = makeMember({
  name: 'Priya',
  ctx: context('member', 'Team member', 'hygienist'),
  visibility: FINANCIALS_HIDDEN,
});

/** Front desk primary, dental assisting as a backup they ARE covering today. */
export const frontDeskBackupAssistFixture = makeMember({
  name: 'Dana',
  ctx: context('member', 'Team member', 'front_desk', ['dental_assistant'], ['dental_assistant']),
});

/** Nothing assigned: the next-move hero says "clear" without a zero wall. */
export const memberClearFixture = makeMember({
  name: 'Priya',
  ctx: context('member', 'Team member', 'hygienist'),
  overrides: {
    next: null,
    mine: [],
    status: {
      label: 'Clocked out',
      detail: '7h 30m recorded today.',
      tone: 'calm',
    },
  },
});

/** A brand-new team member in a brand-new office: no punches, no closeouts. */
export const memberNewFixture = makeMember({
  name: 'Priya',
  ctx: context('member', 'Team member', 'hygienist'),
  input: newPulseInput,
  goals: [],
  overrides: {
    next: null,
    mine: [],
    officePulseNote: null,
    status: {
      label: 'Not clocked in',
      detail: 'Your punches appear here as soon as you clock in.',
      tone: 'calm',
    },
    utilities: [
      { id: 'hours', value: '0:00', label: 'Recorded today', detail: 'Full history on your timesheet', href: '/timesheet' },
      { id: 'pto', value: '0h', label: 'PTO balance', detail: 'Accrues as you work', href: '/pto' },
      { id: 'timesheet', value: '→', label: 'Timesheet', detail: 'Punches, corrections, week totals', href: '/timesheet' },
    ],
  },
});
