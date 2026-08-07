import type { OperationalRole } from '@/lib/schedule-reader/types';
import { shortcutsFor, roleLabel, roleMission } from './opRoles';
import type {
  ManagerView, MemberView, OwnerView, PermissionTier, RoleContext, RoleLane, Series, Signal,
} from './types';

/**
 * DESIGN-REVIEW FIXTURES ONLY.
 *
 * These objects exist so the /design-review surface can render every role
 * composition without a session, without permissions, and without touching the
 * database. They are never imported by the authenticated app. The names are
 * obviously fictional so a fixture can never be mistaken for office data.
 */

const header = (roleLabel: string, personName: string) => ({
  officeName: 'Sample Family Dental',
  roleLabel,
  personName,
  dateLabel: 'Tue, Mar 3, 2026',
  timeLabel: '9:42 AM',
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
      urgent,
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
      note: covering ? 'Covering today' : 'Backup — not assigned today',
    });
  }
  return lanes;
}

const D = ['M', 'T', 'W', 'T', 'F', 'S', 'S', 'M', 'T', 'W', 'T', 'F', 'S', 'S'];

/** Arrivals series — shaped exactly like the live `attendance_day_status` read. */
const arrivals: Series = {
  id: 'arrivals',
  title: 'Arrivals, last 14 days',
  question: 'Are people getting here on time?',
  caption: 'On-time arrivals against scheduled people. Pale bar is scheduled, solid bar is on time.',
  href: '/team',
  format: 'percent',
  points: [7, 8, 6, 8, 7, 0, 0, 8, 7, 8, 6, 8, 0, 6].map((v, i) => ({
    x: D[i],
    value: v,
    of: [8, 8, 8, 8, 8, 0, 0, 8, 8, 8, 8, 8, 0, 8][i],
    muted: v === 0,
  })),
  footnote: 'Attendance only. Purple Envelope does not hold production, collections, or schedule-utilisation data.',
};

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

/* ------------------------------- owner -------------------------------- */

const ownerContext = context('owner', 'Owner', 'dentist');

export const ownerFixture: OwnerView = {
  kind: 'owner',
  header: header('Owner', 'Command'),
  roleContext: ownerContext,
  chart: arrivals,
  lanes: lanesFor(ownerContext),
  figures: [
    { id: 'a', value: '7', label: 'Waiting on you', detail: 'Approvals, reviews, signatures', href: '/approvals' },
    { id: 'b', value: '6/8', label: 'On the floor', detail: '2 exceptions', href: '/team' },
    { id: 'c', value: '3', label: 'Goals in flight', detail: 'Office sprints running', href: '/goals' },
    { id: 'd', value: '2', label: 'Open records', detail: 'Unresolved accountability chain', href: '/management' },
  ],
  decisions: [
    { id: '1', label: 'Approvals pending', detail: '2 PTO · 1 correction · 1 change', value: '4', href: '/approvals', tone: 'attention' },
    { id: '2', label: 'Accountability records at owner review', detail: 'Nobody reviews their own record — these have reached you.', value: '2', href: '/management', tone: 'urgent' },
    { id: '3', label: 'Policy acknowledgments overdue', detail: 'Published versions still unsigned past their due date.', value: '1', href: '/playbook', tone: 'attention' },
  ],
  staffing: {
    present: 6,
    expected: 8,
    rows: [
      { id: '1', name: 'Dana R.', status: 'In', tone: 'steady' },
      { id: '2', name: 'Marcus T.', status: 'Late 12m', tone: 'attention' },
      { id: '3', name: 'Priya S.', status: 'In', tone: 'steady' },
      { id: '4', name: 'Jo B.', status: 'Approved off', tone: 'calm' },
      { id: '5', name: 'Ken W.', status: 'No punch yet', tone: 'attention' },
      { id: '6', name: 'Alice N.', status: 'In — remote', tone: 'steady' },
    ],
  },
  goals: [
    { id: 'g1', label: 'Same-day treatment acceptance', done: 12, total: 20, detail: 'accepted plans · ends Mar 31, 2026', href: '/goals' },
    { id: 'g2', label: 'Morning huddle on time', done: 9, total: 10, detail: 'huddles · ends Mar 7, 2026', href: '/goals' },
  ],
  pulse: [
    { id: 'p1', label: 'Open office notes', detail: 'Quiet notes the office AI has left, still unresolved.', value: '3', href: '/inbox', tone: 'attention' },
    { id: 'p2', label: 'Missing punches, last 14 days', detail: 'Scheduled days with no time recorded.', value: '1', href: '/team', tone: 'attention' },
  ],
  health: {
    collectedLabel: '$142,300',
    paceLabel: 'Behind a $150,000 pace',
    pacePct: 47,
    disruptions: 4,
    days: 12,
  },
};

/* ------------------------------ manager ------------------------------- */

function makeManager(ctx: RoleContext, urgent: Signal[] = []): ManagerView {
  return {
    kind: 'manager',
    header: header('Practice manager', 'The floor'),
    roleContext: ctx,
    chart: arrivals,
    lanes: lanesFor(ctx, urgent),
    figures: [
      { id: 'a', value: '6/8', label: 'Here now', detail: '1 late', tone: 'attention', href: '/team' },
      { id: 'b', value: '1', label: 'Out today', detail: 'Coverage gaps', tone: 'attention', href: '/team' },
      { id: 'c', value: '4', label: 'Approvals', detail: 'PTO, corrections, changes', tone: 'attention', href: '/approvals' },
      { id: 'd', value: '2', label: 'Missing clock-outs', detail: 'Days that need fixing', tone: 'urgent', href: '/team' },
    ],
    roster: [
      { id: '1', name: 'Dana R.', status: 'In', tone: 'steady' },
      { id: '2', name: 'Marcus T.', status: 'Late 12m', tone: 'attention' },
      { id: '3', name: 'Priya S.', status: 'In', tone: 'steady' },
      { id: '4', name: 'Jo B.', status: 'Approved off', tone: 'calm' },
      { id: '5', name: 'Ken W.', status: 'No punch yet', tone: 'attention' },
      { id: '6', name: 'Alice N.', status: 'In — remote', tone: 'steady' },
      { id: '7', name: 'Sam K.', status: 'No clock-out', tone: 'attention' },
      { id: '8', name: 'Rita M.', status: 'Out', tone: 'urgent' },
    ],
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
    timeline: [
      { id: '1', time: 'In', label: 'Dana R.', detail: 'In', tone: 'steady' },
      { id: '2', time: '+12m', label: 'Marcus T.', detail: 'Late 12m', tone: 'attention' },
      { id: '3', time: 'In', label: 'Priya S.', detail: 'In', tone: 'steady' },
      { id: '4', time: '—', label: 'Rita M.', detail: 'Out', tone: 'urgent' },
      { id: '5', time: 'In', label: 'Alice N.', detail: 'In — remote', tone: 'steady' },
    ],
  };
}

export const managerFixture = makeManager(context('manager', 'Practice manager', 'office_manager'));
export const managerFrontDeskFixture = makeManager(
  context('manager', 'Practice manager', 'front_desk', ['office_manager'], ['office_manager']),
);

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
