import type { OperationalRole } from '@/lib/schedule-reader/types';
import type { DayVitals, VitalsSummary } from '@/hooks/usePracticeVitals';
import {
  buildDailyBrief, buildGoalBrief, buildMonthDetail, dailySummary, monthCollectionsFact,
  ownerRecommendation, type GoalLike, type OwnerPulseInput,
} from '@/lib/owner-pulse';
import { shortcutsFor, roleLabel, roleMission } from './opRoles';
import type {
  ManagerView, MemberView, OwnerView, PermissionTier, RoleContext, RoleLane, Series, Signal,
  StaffingSummary,
} from './types';

/**
 * DESIGN-REVIEW FIXTURES ONLY.
 *
 * These objects exist so the /design-review surface can render every role
 * composition without a session, without permissions, and without touching the
 * database. They are never imported by the authenticated app. The names are
 * obviously fictional so a fixture can never be mistaken for office data.
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

const D = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** My-week series — shaped exactly like the live `time_entries` read. */
const myWeek: Series = {
  id: 'my-week',
  title: 'My recorded time, last 7 days',
  question: 'How is my week tracking?',
  caption: 'Hours from your own punches. Corrections are reflected once approved.',
  href: '/timesheet',
  format: 'hours',
  points: [7.8, 8.1, 0, 7.4, 8.2, 0, 2.2].map((v, i) => ({ x: D[i], value: v, muted: v === 0 })),
};

/** Empty week — a brand-new employee with no punches yet. */
const myWeekEmpty: Series = {
  ...myWeek,
  points: D.map(x => ({ x, value: 0, muted: true })),
};

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

/* ------------------------------- owner -------------------------------- */

const ownerContext = context('owner', 'Owner', 'dentist');

/**
 * Owner pulse fixtures run through the REAL derivation layer (owner-pulse.ts)
 * so the design-review surface can never drift from production logic. Only the
 * raw recorded inputs are invented — every label, pace verdict, recommendation,
 * and summary sentence below is computed, not typed.
 */
const fxDay = (date: string, over: Partial<DayVitals> = {}): DayVitals => ({
  date,
  productionCents: 742_000,
  collectedCents: 615_000,
  hygieneCancellations: 2,
  hygieneNoShows: 0,
  doctorCancellations: 0,
  doctorNoShows: 1,
  ...over,
});

const fxSummary = (over: Partial<VitalsSummary> = {}): VitalsSummary => ({
  productionCents: 1_390_000,
  collectedCents: 900_000,
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

/** Mid-morning, Tue Mar 3: yesterday closed out, today's closeout still ahead. */
const openPulseInput: OwnerPulseInput = {
  today: '2026-03-03',
  todayVitals: null,
  latest: fxDay('2026-03-02'),
  thisMonth: fxSummary(),
  prevMonth: {
    month: '2026-02',
    productionCents: 14_800_000,
    collectedCents: 14_100_000,
    hygieneCancellations: 12,
    hygieneNoShows: 4,
    doctorCancellations: 3,
    doctorNoShows: 2,
    disruptions: 21,
    days: 19,
  },
  monthElapsed: 3 / 31,
  targetCents: 15_000_000,
  pacedTargetCents: Math.round(15_000_000 * (3 / 31)),
  officePhase: 'open',
};

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
  monthFact: monthCollectionsFact(openPulseInput),
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
    hygieneCancellations: 0,
    doctorNoShows: 0,
  }),
  latest: fxDay('2026-03-03', {
    productionCents: 815_000,
    collectedCents: 790_000,
    hygieneCancellations: 0,
    doctorNoShows: 0,
  }),
  thisMonth: fxSummary({ productionCents: 2_205_000, collectedCents: 1_690_000, days: 3 }),
  officePhase: 'after_close',
};

const closedBrief = buildDailyBrief(closedPulseInput);

export const ownerClosedFixture: OwnerView = {
  ...ownerFixture,
  header: header('Owner', 'Good evening, Megan', '10:32 PM'),
  office: staffingClosed.office,
  summary: dailySummary(closedPulseInput, closedBrief, 0),
  brief: closedBrief,
  monthFact: monthCollectionsFact(closedPulseInput),
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
    productionCents: 0, collectedCents: 0, hygieneCancellations: 0, hygieneNoShows: 0,
    doctorCancellations: 0, doctorNoShows: 0, disruptions: 0, days: 0,
  }),
  prevMonth: null,
  monthElapsed: 3 / 31,
  targetCents: 0,
  pacedTargetCents: 0,
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
  monthFact: monthCollectionsFact(newPulseInput),
  lookAt: ownerRecommendation(newPulseInput, []),
  decisionCount: 0,
  decisions: [],
  goal: null,
  month: buildMonthDetail(newPulseInput, []),
  staffing: staffingNewOffice,
  exceptions: [],
};

/* ------------------------------ manager ------------------------------- */

function makeManager(ctx: RoleContext, urgent: Signal[] = []): ManagerView {
  return {
    kind: 'manager',
    header: header('Practice manager', 'Good morning, Sofia'),
    roleContext: ctx,
    lanes: lanesFor(ctx, urgent),
    office: staffingOpen.office,
    figures: [
      { id: 'here', value: '6/8', label: 'In right now', detail: 'Against who is expected at this hour', tone: 'steady', href: '/team' },
      { id: 'not-in', value: '1', label: 'Not in yet', detail: 'Expected now, no punch', tone: 'attention', href: '/team' },
      { id: 'approvals', value: '4', label: 'Approvals', detail: 'PTO, corrections, changes', tone: 'attention', href: '/approvals' },
      { id: 'review', value: '1', label: 'Attendance to review', detail: '1 unreviewed late arrival', tone: 'attention', href: '/team' },
    ],
    staffing: staffingOpen,
    attention: [
      { id: '1', label: 'PTO requests pending', detail: 'Approve or decline before the schedule locks.', value: '2', href: '/approvals', tone: 'attention' },
      { id: '2', label: 'Time corrections pending', detail: 'Each one keeps the original punch on record.', value: '1', href: '/approvals', tone: 'attention' },
      { id: '3', label: 'Records awaiting your review', detail: 'Accountability chain — you cannot review your own.', value: '1', href: '/management', tone: 'urgent' },
      { id: '4', label: 'Unsigned policy acknowledgments', detail: 'Exact published versions still unsigned.', value: '3', href: '/playbook', tone: 'attention' },
      { id: '5', label: 'Training assignments open', detail: 'Assigned modules not yet completed.', value: '5', href: '/training', tone: 'attention' },
    ],
    progress: [
      { id: 'p1', label: 'Close the Day — front desk', done: 7, total: 9, detail: 'daily checklist', href: '/checklists' },
      { id: 'p2', label: 'Sterilization log', done: 4, total: 4, detail: 'daily checklist', href: '/checklists' },
      { id: 'p3', label: 'Morning huddle on time', done: 9, total: 10, detail: 'huddles · ends Mar 7, 2026', href: '/goals' },
    ],
  };
}

export const managerFixture = makeManager(context('manager', 'Practice manager', 'office_manager'));
export const managerFrontDeskFixture = makeManager(
  context('manager', 'Practice manager', 'front_desk', ['office_manager'], ['office_manager']),
);

/** A new office from the manager's chair: clear queues, setup prompts. */
export const managerNewFixture: ManagerView = {
  ...makeManager(context('manager', 'Practice manager', 'office_manager')),
  office: staffingNewOffice.office,
  figures: [
    { id: 'office', value: 'Closed', label: 'Office', detail: 'No shifts are on the schedule for today.', tone: 'calm' },
    { id: 'worked', value: '0', label: 'Worked today', detail: 'No shifts today', tone: 'calm', href: '/team' },
    { id: 'approvals', value: '0', label: 'Approvals', detail: 'Queue is clear', tone: 'calm', href: '/approvals' },
    { id: 'review', value: '0', label: 'Attendance to review', detail: 'Nothing needs review', tone: 'calm', href: '/team' },
  ],
  staffing: staffingNewOffice,
  attention: [],
  progress: [],
};

/* ------------------------------- member ------------------------------- */

function makeMember(
  name: string,
  ctx: RoleContext,
  overrides: Partial<MemberView> = {},
): MemberView {
  return {
    kind: 'member',
    header: header('Team member', `Good morning, ${name}`),
    roleContext: ctx,
    chart: myWeek,
    lanes: lanesFor(ctx, bypassUrgent),
    status: {
      label: 'On the clock',
      detail: '2h 14m recorded today. Clock out from the bar when you finish.',
      tone: 'steady',
    },
    next: {
      title: 'Read and sign a policy',
      detail: 'A published version is assigned to you.',
      href: '/playbook',
      cta: 'Open playbook',
    },
    mine: [
      { id: '1', label: 'Training assigned to me', detail: 'Modules not yet completed.', value: '2', href: '/training', tone: 'attention' },
      { id: '2', label: 'Policies to sign', detail: 'Signing means you read that exact version.', value: '1', href: '/playbook', tone: 'attention' },
      { id: '3', label: 'Bypass reasons owed', detail: 'Never blocks you — just needs a sentence.', value: '1', href: '/checklists', tone: 'attention' },
    ],
    progress: [
      { id: 'p1', label: 'Same-day treatment acceptance', done: 12, total: 20, detail: 'accepted plans · ends Mar 31, 2026', href: '/goals' },
    ],
    figures: [
      { id: 'a', value: '9', label: 'Day streak', detail: 'Verified records only' },
      { id: 'b', value: '2h 14m', label: 'Today', detail: 'Recorded time', href: '/timesheet' },
      { id: 'c', value: '46h', label: 'PTO balance', detail: '1–3 years', href: '/pto' },
      { id: 'd', value: '4', label: 'Open items', detail: 'Assigned to you' },
    ],
    office: [
      { id: 'o1', label: 'Office sprints running', detail: 'Shared goals you can contribute to.', value: '3', href: '/goals', tone: 'calm' },
      { id: 'o2', label: 'Notes for you', detail: 'Quiet suggestions, always yours to dismiss.', value: '1', href: '/inbox', tone: 'attention' },
    ],
    ...overrides,
  };
}

export const memberFixture = makeMember('Priya', context('member', 'Team member', 'hygienist'));

export const frontDeskFixture = makeMember('Dana', context('member', 'Team member', 'front_desk'), {
  next: {
    title: 'Answer an office request',
    detail: 'A request is sitting in your inbox with no reply yet.',
    href: '/inbox/requests',
    cta: 'Open inbox',
  },
});

export const hygienistFixture = makeMember('Priya', context('member', 'Team member', 'hygienist'));

export const assistantFixture = makeMember('Marcus', context('member', 'Team member', 'dental_assistant'), {
  next: {
    title: 'Finish the closeout checklist',
    detail: 'Two items are still open on today’s list.',
    href: '/checklists',
    cta: 'Open checklists',
  },
});

/** Front desk primary, dental assisting as a backup they ARE covering today. */
export const frontDeskBackupAssistFixture = makeMember(
  'Dana',
  context('member', 'Team member', 'front_desk', ['dental_assistant'], ['dental_assistant']),
);

/** A brand-new team member: invited, no punches, nothing assigned yet. */
export const memberNewFixture = makeMember('Priya', context('member', 'Team member', 'hygienist'), {
  chart: myWeekEmpty,
  status: {
    label: 'Not clocked in',
    detail: 'Your punches appear here as soon as you clock in.',
    tone: 'calm',
  },
  next: null,
  mine: [],
  progress: [],
  figures: [
    { id: 'a', value: '0', label: 'Day streak', detail: 'Verified records only' },
    { id: 'b', value: '0:00', label: 'Today', detail: 'Recorded time', href: '/timesheet' },
    { id: 'c', value: '0h', label: 'PTO balance', detail: 'Accrues as you work', href: '/pto' },
    { id: 'd', value: '0', label: 'Open items', detail: 'Assigned to you' },
  ],
  office: [],
});
