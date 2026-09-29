import type { OperationalRole } from '@/lib/schedule-reader/types';
import { summarizeVitals, type DayVitals, type VitalsSummary, type VitalsTargets, type VitalsVisibility } from '@/hooks/usePracticeVitals';
import type { DepositLog } from '@/hooks/useDepositLog';
import {
  buildDailyBrief, buildGoalBrief, monthPaceLines, type GoalLike, type OwnerPulseInput,
} from '@/lib/owner-pulse';
import { closeDayStatus } from '@/lib/manager-pulse';
import { buildHomeBrief, lastDayLine, needsYou, stateSummary, todayBand } from '@/lib/home-brief';
import { compareByConsequence, type AttentionItem } from '@/lib/attention';
import type { EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { rolePulseItems } from '@/lib/member-pulse';
import { buildMyWork, type MyWork, type MyWorkInput } from '@/lib/my-work';
import { DEFAULT_LATE_ARRIVAL_RULE, standingSentence, standingToday } from '@/lib/late-arrivals';
import type { PreparedReport } from '@/lib/prepared-report';
import type { ReportImportRow } from '@/lib/report-history';
import type { MissedEventLite } from '@/lib/missed-trend';
import type { PerformanceRaw } from '@/lib/home-performance';
import type { AttentionSummary } from '@/lib/home-insights';
import type { OfficeDayCalendar } from '@/lib/office-days';
import { isOfficeDay } from '@/lib/office-days';
import { daysInMonthOf, weeklyPaceForMonth } from '@/lib/metric-pace';
import { mondayOf } from '@/lib/time-utils';
import { shortcutsFor, roleLabel, roleMission } from './opRoles';
import { buildToolGroups } from './tools';
import { performanceBlockFrom } from './performance/block';
import type {
  ManagerView, MemberView, OwnerView, PerformanceBlock, PermissionTier, RoleContext, RoleLane, Signal,
  StaffingSummary, ToolGroup,
} from './types';

/**
 * DESIGN-REVIEW FIXTURES ONLY.
 *
 * These objects exist so the /design-review surface can render every role
 * composition without a session, without permissions, and without touching the
 * database. They are never imported by the authenticated app. The names are
 * obviously fictional so a fixture can never be mistaken for office data.
 *
 * Only RAW RECORDED INPUTS are invented here — every pace verdict, summary
 * line, item ordering, visibility filter, and work item below is computed by
 * the same production functions the live dashboards call (owner-pulse.ts,
 * home-brief.ts, attention/, member-pulse.ts, my-work.ts, goal-progress.ts).
 * Fixtures must never reimplement or hard-code that business logic.
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

function toolsFor(ctx: RoleContext): ToolGroup[] {
  return buildToolGroups({ tier: ctx.tier, primary: ctx.primary, secondary: ctx.secondary, coveringToday: ctx.coveringToday });
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
    { id: '2', name: 'Marcus T.', status: 'In · late 12m', tone: 'calm' },
    { id: '3', name: 'Priya S.', status: 'In', tone: 'steady' },
    { id: '4', name: 'Jo B.', status: 'Approved off', tone: 'calm' },
    { id: '5', name: 'Ken W.', status: 'Not in yet', tone: 'attention' },
    { id: '6', name: 'Alice N.', status: 'In — remote', tone: 'steady' },
    { id: '7', name: 'Sam K.', status: 'Starts 1:00 PM', tone: 'calm' },
    { id: '8', name: 'Rita M.', status: 'Clocked out', tone: 'calm' },
  ],
  reviewCount: 1,
  reviewDetail: '1 no-punch day',
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
//
// FICTIONAL closeout history. One deterministic generator produces the
// office days every fixture reads, so the strip, the chart, the meters, the
// observations, and the summary all agree with each other — and disagree
// with any real office, which is the point of a fixture.

const FX_TODAY = '2026-03-03';
const ALL_VISIBLE: VitalsVisibility = { production: true, collections: true, newPatients: true };

/**
 * The fictional office calendar: Monday to Friday, closed for Thanksgiving,
 * the New Year's week, and Presidents' Day. The generator below skips these
 * dates, so a closure never carries a closeout.
 */
export const fxCalendar: OfficeDayCalendar = {
  closedDates: new Set(['2025-11-27', '2025-11-28', '2025-12-25', '2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-02-16']),
  openDates: new Set<string>(),
};

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
  sealedAt: `${date}T22:30:00Z`,
  ...over,
});

/**
 * The office days between two dates, with a handful deliberately unrecorded
 * unless `complete` is asked for. A gap is a gap, never a zero.
 */
export function fxCloseoutHistory(from: string, to: string, opts: { complete?: boolean } = {}): DayVitals[] {
  const days: DayVitals[] = [];
  let i = 0;
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (!isOfficeDay(date, fxCalendar)) continue; // weekends and closures
    i += 1;
    if (!opts.complete && i % 9 === 4) continue; // an unrecorded office day now and then — a gap, never a zero
    const production = 560_000 + ((i * 37) % 11) * 42_000 + (dow === 5 ? -80_000 : 0);
    const collected = Math.round(production * (0.66 + ((i * 13) % 7) / 20));
    days.push(fxDay(date, {
      productionCents: production,
      collectedCents: collected,
      newPatientsScheduled: (i * 7) % 4,
      newPatientsSeen: (i * 5) % 3,
      hygieneCancellations: (i * 3) % 3,
      hygieneNoShows: i % 4 === 0 ? 1 : 0,
      doctorCancellations: (i * 5) % 2,
      doctorNoShows: (i * 7) % 5 === 0 ? 1 : 0,
    }));
  }
  return days;
}

/** Yesterday's closeout exactly as the tests have always known it. */
const fxYesterday = fxDay('2026-03-02');

/** Oct 1, 2025 through yesterday, every office day recorded, the last day saved but not yet sealed. */
const fxHistory: DayVitals[] = [
  ...fxCloseoutHistory('2025-10-01', '2026-02-27', { complete: true }),
  { ...fxYesterday, sealedAt: null },
];

/** Fictional Dentrix postings: one row per 9100 / 9101, some unassigned. */
export function fxMissedPostings(days: DayVitals[]): MissedEventLite[] {
  const events: MissedEventLite[] = [];
  days.forEach((d, i) => {
    if (i % 3 === 0) events.push({ business_date: d.date, code: '9101', department: 'hygiene' });
    if (i % 5 === 0) events.push({ business_date: d.date, code: '9100', department: 'doctor' });
    if (i % 4 === 1) events.push({ business_date: d.date, code: '9101', department: 'doctor' });
    if (i % 11 === 7) events.push({ business_date: d.date, code: '9100', department: 'other' });
  });
  return events;
}

/** A fictional loaded report package: posted charges and receipts by posting date, with full monthly summaries. */
export function fxReportPackage(start: string, end: string, importedAt: string): ReportImportRow {
  const rows: { date: string; posted_charges_cents: number; recorded_payments_cents: number; credit_adjustments_cents: number; charge_adjustments_cents: number }[] = [];
  let i = 0;
  for (let d = new Date(`${start}T12:00:00Z`); d.toISOString().slice(0, 10) <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    i += 1;
    const charges = 610_000 + ((i * 29) % 9) * 38_000;
    rows.push({ date: d.toISOString().slice(0, 10), posted_charges_cents: charges, recorded_payments_cents: Math.round(charges * (0.7 + ((i * 11) % 5) / 25)), credit_adjustments_cents: 0, charge_adjustments_cents: 0 });
  }
  const months = new Map<string, { posted_charges_cents: number; recorded_payments_cents: number }>();
  for (const r of rows) {
    const m = months.get(r.date.slice(0, 7)) ?? { posted_charges_cents: 0, recorded_payments_cents: 0 };
    m.posted_charges_cents += r.posted_charges_cents;
    m.recorded_payments_cents += r.recorded_payments_cents;
    months.set(r.date.slice(0, 7), m);
  }
  const payload = {
    schema_version: 'purple-envelope-prepared-report-package-v1',
    target_org_id: 'fx-office',
    report_start: start,
    report_end: end,
    daily_financials_by_entry_date: rows,
    monthly_financials_by_entry_date: [...months.entries()].map(([month, m]) => ({ month, coverage: 'full_calendar_month', ...m, credit_adjustments_cents: 0, charge_adjustments_cents: 0 })),
  } as unknown as PreparedReport;
  return { id: `fx-pkg-${start}`, report_start: start, report_end: end, imported_at: importedAt, payload };
}

const monthKey = (date: string) => date.slice(0, 7);

/**
 * The pulse input, derived from the fictional days the same way the live
 * hook derives it from deposit_logs — nothing here is typed by hand.
 */
function pulseFromDays(days: DayVitals[], today: string, targets: VitalsTargets, officePhase: OwnerPulseInput['officePhase']): OwnerPulseInput {
  const thisMonthDays = days.filter(d => monthKey(d.date) === monthKey(today));
  const [y, m, dayOfMonth] = today.split('-').map(Number);
  const prevKey = new Date(Date.UTC(y, m - 2, 1, 12)).toISOString().slice(0, 7);
  const prevDays = days.filter(d => monthKey(d.date) === prevKey);
  const daysInMonth = daysInMonthOf(today);
  const weekStart = mondayOf(today);
  const weekDays = days.filter(d => d.date >= weekStart && d.date <= today);
  return {
    today,
    todayVitals: days.find(d => d.date === today) ?? null,
    latest: days.length ? days[days.length - 1] : null,
    thisMonth: summarizeVitals(thisMonthDays),
    prevMonth: prevDays.length ? { month: prevKey, ...summarizeVitals(prevDays) } : null,
    monthElapsed: dayOfMonth / daysInMonth,
    targets,
    weeklyNewPatientPace: weeklyPaceForMonth(targets.newPatientsSeen, daysInMonth),
    scheduledThisWeek: weekDays.reduce((a, d) => a + (d.newPatientsScheduled ?? 0), 0),
    scheduledThisWeekRecordedDays: weekDays.filter(d => d.newPatientsScheduled !== null).length,
    officePhase,
  };
}

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

const fxTargets: VitalsTargets = {
  productionCents: 16_000_000,
  collectionsCents: 15_000_000,
  newPatientsSeen: 40,
};

const NO_TARGETS: VitalsTargets = { productionCents: 0, collectionsCents: 0, newPatientsSeen: 0 };

/**
 * The performance block for a fixture, through the SAME composer the live
 * hook uses: raw rows in, chart / meters / observations out.
 */
export function fxPerformance(args: {
  role: 'owner' | 'manager' | 'employee';
  days: DayVitals[];
  targets: VitalsTargets;
  officePhase: OwnerPulseInput['officePhase'];
  visibility?: VitalsVisibility;
  reports?: ReportImportRow[];
  events?: MissedEventLite[] | null;
  attention?: AttentionSummary | null;
  today?: string;
  /** The office calendar; `null` renders the calendar-day fallback. */
  calendar?: OfficeDayCalendar | null;
}): { block: PerformanceBlock; pulse: OwnerPulseInput } {
  const today = args.today ?? FX_TODAY;
  const pulse = pulseFromDays(args.days, today, args.targets, args.officePhase);
  const admin = args.role !== 'employee';
  const raw: PerformanceRaw = {
    orgId: 'fx-office',
    viewerOrgId: 'fx-office',
    today,
    role: args.role,
    days: args.days,
    closeoutsState: 'ok',
    reports: admin ? (args.reports ?? []) : null,
    reportState: admin ? 'ok' : 'unauthorized',
    missedEvents: admin ? (args.events === undefined ? fxMissedPostings(args.days) : args.events) : null,
    missedState: admin ? 'ok' : 'unauthorized',
    visibility: args.visibility ?? ALL_VISIBLE,
    thisMonth: pulse.thisMonth,
    targets: args.targets,
    monthElapsed: pulse.monthElapsed,
    calendar: args.calendar === undefined ? fxCalendar : args.calendar,
  };
  return { block: performanceBlockFrom({ raw, state: 'ok', pulse, attention: args.attention ?? null }), pulse };
}

/** Mid-morning, Tue Mar 3: yesterday closed out, today's closeout still ahead. */
const openPulseInput: OwnerPulseInput = pulseFromDays(fxHistory, FX_TODAY, fxTargets, 'open');

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
  }) as DepositLog;

/* ------------------------------ my work ------------------------------- */

const FX_USER = 'u-me';
const FX_EMPLOYEE = 'e-me';

/** A person's own items through the real builder; the caller says which records exist. */
function myWorkFor(input: Partial<MyWorkInput> & { today?: string }): MyWork {
  return buildMyWork({ today: input.today ?? FX_TODAY, userId: FX_USER, employeeId: FX_EMPLOYEE, ...input });
}

const NO_WORK: MyWork = myWorkFor({});

/** The everyday member: two modules, one policy, one bypass reason. */
const memberWorkInput: Partial<MyWorkInput> = {
  training: [
    { id: 'ta1', assigned_to: FX_USER, status: 'assigned', due_date: '2026-03-06', title: 'Sterilization refresher' },
    { id: 'ta2', assigned_to: FX_USER, status: 'in_progress', due_date: null, title: 'Front desk phone standards' },
  ],
  acknowledgments: [{ id: 'ack1', title_snapshot: 'Sterilization log', due_at: '2026-03-05T00:00:00Z', acknowledged_at: null, waived_at: null }],
  bypasses: [{ id: 'b1', checklist_date: '2026-03-02', resolved: false }],
};

/* ------------------------------- owner -------------------------------- */

const ownerContext = context('owner', 'Owner', 'dentist');

/** A recorded Attention item, in the shape deriveAttention() returns. */
export const fxItem = (over: Partial<AttentionItem> & Pick<AttentionItem, 'key' | 'kind' | 'verb' | 'label'>): AttentionItem => ({
  recordTable: over.key.split(':')[0], recordId: over.key.split(':')[1],
  subject: { employeeId: null, userId: null, name: null }, detail: '', why: '', occurredAt: null, ageHours: null,
  deadline: null, coverage: false, payroll: false, href: `/management?item=${over.key}`,
  work: 'needs_action', waitingOn: null, parkedUntil: null, snoozedUntil: null,
  ...over,
});

/** What waits on the owner's authority, Tue Mar 3. */
const ownerItems: AttentionItem[] = [
  fxItem({
    key: 'record_signoff:r1', kind: 'record_signoff', verb: 'follow_up', label: 'Record awaiting your sign-off · attendance',
    subject: { employeeId: '3', userId: 'u3', name: 'Priya S.' }, detail: 'Manager review is done; the record needs your signature', ageHours: 30,
    why: 'An escalation policy opened this record; the reviewer signs within the review window or it moves up. Nobody reviews their own.',
    payroll: true, deadline: { label: 'payroll Thu', date: '2026-03-05', days: 2 },
  }),
  fxItem({
    key: 'pto_request:p1', kind: 'pto_request', verb: 'decide', label: 'PTO request · 2026-03-09 – 2026-03-10 (16h)',
    subject: { employeeId: '3', userId: 'u3', name: 'Priya S.' }, detail: '2 of 3 hygienists would be off that Monday', ageHours: 50,
    why: 'A PTO request is waiting on a manager decision.',
  }),
  fxItem({
    key: 'content_review:v4', kind: 'content_review', verb: 'decide', label: 'Sterilization log · version 4 in review',
    detail: 'Submitted by Dana R.', ageHours: 20, why: 'A version in review needs a reviewer who is not its author before it can be published.',
  }),
  fxItem({
    key: 'incident_countersign:i2', kind: 'incident_countersign', verb: 'decide', label: 'Incident report awaiting countersignature',
    subject: { employeeId: '2', userId: 'u2', name: 'Marcus T.' }, detail: 'Sharps exposure, first aid given', ageHours: 6,
    why: 'A signed incident report needs a countersignature to close the loop.',
  }),
  fxItem({
    key: 'challenge_verify:g2', kind: 'challenge_verify', verb: 'decide', label: 'Challenge result to verify',
    detail: 'Morning huddle on time — 10 of 10 claimed', ageHours: 3, why: 'A finished challenge is verified by a manager before it counts.',
  }),
].sort(compareByConsequence);

const ownerAttention = { needsNow: ownerItems, waiting: [] as AttentionItem[], deferred: [] as AttentionItem[], degradedSources: [], enabled: true };
const ownerAttentionSummary: AttentionSummary = { enabled: true, needsNow: ownerItems.length, waiting: 0, oldestHours: 50, payroll: { label: 'payroll Thu', days: 2 }, degraded: false };

// Wall-clock moments (the staffing rules read local hours): 9:42 AM and 10:32 PM.
const openNow = new Date(2026, 2, 3, 9, 42);
const closedNow = new Date(2026, 2, 3, 22, 32);

const openCloseouts = [
  { id: 'log-0302', deposit_date: '2026-03-02', sealed_at: null, needs_manager_review: false },
  { id: 'log-0227', deposit_date: '2026-02-27', sealed_at: '2026-02-27T22:40:00Z', needs_manager_review: false },
];

type OwnerScenarioArgs = {
  days: DayVitals[];
  targets?: VitalsTargets;
  staffing: StaffingSummary;
  snapshot?: EmployeeSnapshot[];
  now: Date;
  todayLog: DepositLog | null;
  needsNow?: AttentionItem[];
  closeouts?: { id: string; deposit_date: string; sealed_at: string | null; needs_manager_review: boolean }[];
  goals?: GoalLike[];
  payroll?: { dueDate: string | null; dueLabel: string | null } | null;
  reports?: ReportImportRow[];
  events?: MissedEventLite[] | null;
  exceptions?: Signal[];
  mine?: MyWork;
  personName?: string;
  timeLabel?: string;
  today?: string;
  dateLabel?: string;
  calendar?: OfficeDayCalendar | null;
};

/** Every owner fixture runs the REAL summary, brief, and queue layers. */
function makeOwner(args: OwnerScenarioArgs): OwnerView {
  const needsNow = args.needsNow ?? [];
  const attention = { needsNow, waiting: [] as AttentionItem[], deferred: [] as AttentionItem[], degradedSources: [], enabled: true };
  const attentionSummary: AttentionSummary = {
    enabled: true, needsNow: needsNow.length, waiting: 0,
    oldestHours: needsNow.reduce<number | null>((m, i) => (i.ageHours === null ? m : Math.max(m ?? 0, i.ageHours)), null),
    payroll: args.payroll?.dueDate ? { label: args.payroll.dueLabel ?? 'payroll', days: 2 } : null, degraded: false,
  };
  const { block, pulse } = fxPerformance({
    role: 'owner', days: args.days, targets: args.targets ?? fxTargets, officePhase: args.staffing.office.phase,
    attention: attentionSummary, reports: args.reports, events: args.events, today: args.today, calendar: args.calendar,
  });
  const today = pulse.today;
  const band = todayBand({ summary: args.staffing, snapshot: args.snapshot, now: args.now, needsNow });
  const lastDay = lastDayLine({ closeouts: args.closeouts ?? [], today, phase: args.staffing.office.phase, closeDay: closeDayStatus(args.todayLog, args.staffing.office.phase) });
  const needs = needsYou(attention);
  return {
    kind: 'owner',
    header: { ...header('Owner', args.personName ?? 'Good morning, Megan', args.timeLabel), ...(args.dateLabel ? { dateLabel: args.dateLabel } : {}) },
    roleContext: ownerContext,
    lanes: lanesFor(ownerContext),
    toolGroups: toolsFor(ownerContext),
    office: args.staffing.office,
    summary: stateSummary({ office: args.staffing.office, today: band, needs, lastDay, payroll: args.payroll ?? null, payrollItems: needsNow.filter(i => i.payroll).length, todayDate: today }),
    brief: buildDailyBrief(pulse),
    lastDay,
    decisionCount: needsNow.length,
    needs,
    mine: args.mine ?? NO_WORK,
    goal: buildGoalBrief(args.goals ?? fxGoals, today),
    staffing: args.staffing,
    exceptions: args.exceptions ?? [],
    ...block,
  };
}

/** Established office, mid-morning, with real activity. */
export const ownerFixture: OwnerView = makeOwner({
  days: fxHistory,
  staffing: staffingOpen,
  now: openNow,
  todayLog: null,
  needsNow: ownerItems,
  closeouts: openCloseouts,
  payroll: { dueDate: '2026-03-05', dueLabel: 'payroll Thu' },
  exceptions: [
    { id: 'p2', label: '1 attendance item needs review', detail: '1 no-punch day', value: '1', href: '/management/people', tone: 'attention' },
  ],
  mine: myWorkFor({ acknowledgments: [{ id: 'ack-o1', title_snapshot: 'Radiation safety policy', due_at: '2026-03-10T00:00:00Z', acknowledged_at: null, waived_at: null }] }),
});

/** The same office with nothing waiting on the owner and yesterday sealed. */
export const ownerClearFixture: OwnerView = makeOwner({
  days: fxHistory,
  staffing: staffingOpen,
  now: openNow,
  todayLog: null,
  needsNow: [],
  closeouts: [{ ...openCloseouts[0], sealed_at: '2026-03-02T22:40:00Z' }, openCloseouts[1]],
});

/** The same office at 10:32 PM — today closed out clean, decisions clear. */
const fxTodayClosed = fxDay(FX_TODAY, {
  productionCents: 815_000,
  collectedCents: 790_000,
  newPatientsScheduled: 4,
  newPatientsSeen: 3,
  hygieneCancellations: 0,
  doctorNoShows: 0,
});
const closedHistory: DayVitals[] = [...fxHistory.slice(0, -1), fxYesterday, fxTodayClosed];

export const ownerClosedFixture: OwnerView = makeOwner({
  days: closedHistory,
  staffing: staffingClosed,
  now: closedNow,
  todayLog: fxTodayLog({ sealed_at: '2026-03-03T22:20:00Z' }),
  closeouts: [{ id: 'fx-log', deposit_date: '2026-03-03', sealed_at: '2026-03-03T22:20:00Z', needs_manager_review: false }, { ...openCloseouts[0], sealed_at: '2026-03-02T22:40:00Z' }, openCloseouts[1]],
  personName: 'Good evening, Megan',
  timeLabel: '10:32 PM',
});

/** A brand-new office: setup guidance, not a wall of zeros. */
export const ownerNewFixture: OwnerView = makeOwner({
  days: [],
  targets: NO_TARGETS,
  staffing: staffingNewOffice,
  now: openNow,
  todayLog: null,
  events: [],
  goals: [],
});

/**
 * Incomplete history: closeouts began on Feb 17, a loaded report package
 * covers Nov through January by posting date, and no goals are configured.
 * The chart shows gaps as gaps and offers the report view separately.
 */
const incompleteHistory: DayVitals[] = fxCloseoutHistory('2026-02-17', '2026-03-02');
export const ownerIncompleteFixture: OwnerView = makeOwner({
  days: incompleteHistory,
  targets: NO_TARGETS,
  staffing: staffingOpen,
  now: openNow,
  todayLog: null,
  needsNow: ownerItems.slice(0, 2),
  closeouts: openCloseouts,
  reports: [fxReportPackage('2025-11-01', '2026-01-31', '2026-02-20T15:00:00Z')],
});

/**
 * A partially recorded month, Thu Mar 12: two office days this month have
 * no closeout, so the totals show with a partial-data label and no behind
 * verdict, and the observation names the gap with the way to close it.
 */
const partialHistory: DayVitals[] = [
  ...fxCloseoutHistory('2025-10-01', '2026-02-27', { complete: true }),
  ...fxCloseoutHistory('2026-03-02', '2026-03-11', { complete: true }).filter(d => d.date !== '2026-03-05' && d.date !== '2026-03-10').map(d => ({ ...d, productionCents: 620_000, collectedCents: 540_000 })),
];
export const ownerPartialFixture: OwnerView = makeOwner({
  days: partialHistory,
  today: '2026-03-12',
  dateLabel: 'Thu, Mar 12, 2026',
  staffing: staffingOpen,
  now: new Date(2026, 2, 12, 9, 42),
  todayLog: null,
  needsNow: [
    fxItem({ key: 'close_day_unsealed:log-0305', kind: 'close_day_unsealed', verb: 'fix', label: 'Close the Day saved, not sealed · 2026-03-05', detail: 'The record is filled in but unsealed', ageHours: 160, why: 'An unsealed closeout is not on record; sealing locks what is on file.' }),
    fxItem({ key: 'close_day_unsealed:log-0310', kind: 'close_day_unsealed', verb: 'fix', label: 'Close the Day saved, not sealed · 2026-03-10', detail: 'The record is filled in but unsealed', ageHours: 40, why: 'An unsealed closeout is not on record; sealing locks what is on file.' }),
  ],
  closeouts: [{ id: 'log-0311', deposit_date: '2026-03-11', sealed_at: '2026-03-11T22:40:00Z', needs_manager_review: false }],
});

/* ------------------------------ manager ------------------------------- */

/** Tue Mar 3, mid-morning: five things need the manager, one is waiting on a person. */
const openItems: AttentionItem[] = [
  fxItem({
    key: 'missing_clock_out:d1', kind: 'missing_clock_out', verb: 'fix', label: 'No clock-out · 2026-03-02',
    subject: { employeeId: '5', userId: 'u5', name: 'Ken W.' }, detail: 'Clocked in 7:58 AM, no clock-out on record', ageHours: 18,
    why: 'A scheduled day ended more than the buffer ago with an open punch pair.',
    payroll: true, deadline: { label: 'payroll Thu', date: '2026-03-05', days: 2 },
  }),
  fxItem({
    key: 'pto_request:p1', kind: 'pto_request', verb: 'decide', label: 'PTO request · 2026-03-09 – 2026-03-10 (16h)',
    subject: { employeeId: '3', userId: 'u3', name: 'Priya S.' }, detail: '2 of 3 hygienists would be off that Monday', ageHours: 50,
    why: 'A PTO request is waiting on a manager decision.',
  }),
  fxItem({
    key: 'correction_request:c1', kind: 'correction_request', verb: 'decide', label: 'Time correction · 2026-03-02',
    subject: { employeeId: '2', userId: 'u2', name: 'Marcus T.' }, detail: 'Forgot to clock out at lunch', ageHours: 20,
    why: 'A correction request is pending. Approving opens the punch editor; the original punches stay on record.',
  }),
  fxItem({
    key: 'close_day_unsealed:log-0302', kind: 'close_day_unsealed', verb: 'fix', label: 'Close the Day saved, not sealed · 2026-03-02',
    detail: 'The record is filled in but unsealed', ageHours: 14, why: 'An unsealed closeout is not on record; sealing locks what is on file.',
  }),
  fxItem({
    key: 'excuse_request:t1', kind: 'excuse_request', verb: 'decide', label: 'Excuse requested: pending review · 2026-03-03',
    subject: { employeeId: '2', userId: 'u2', name: 'Marcus T.' }, detail: '“School drop-off ran long”', ageHours: 1,
    why: 'The person asked for this late arrival to be excused. It waits on a manager decision and does not count toward the late-arrival rule until decided.',
  }),
].sort(compareByConsequence);

const waitingItems: AttentionItem[] = [
  fxItem({
    key: 'bypass_followup:b1', kind: 'bypass_followup', verb: 'follow_up', label: 'Checklist bypass reason owed · 2026-02-27',
    subject: { employeeId: '1', userId: 'u1', name: 'Dana R.' }, detail: '2 items were open · level 1', ageHours: 96,
    why: 'Office rule: a bypass reason owed past 24 hours needs manager follow-up.',
    work: 'waiting_on_employee', waitingOn: { ownerUserId: 'u1', requestedAt: '2026-03-02T15:10:00Z', dueAt: '2026-03-04' },
  }),
];

/** Only the fields the pure helpers read; the rest of the row is irrelevant here. */
const fxSnapshotRow = (over: Partial<EmployeeSnapshot> & Pick<EmployeeSnapshot, 'employee_id' | 'display_name'>): EmployeeSnapshot => ({
  user_id: null, status_code: 'ok', is_late: false, is_absent: false, is_incomplete: false, has_punches: true, is_remote: false,
  minutes_late: 0, has_day_off: false, office_closed: false, is_scheduled_day: true,
  schedule_expected_start: '08:00:00', schedule_expected_end: '17:00:00', tardy_approval_status: null,
  ...over,
});

/** After close: Sam K. is still clocked in; everyone else is out. */
const closedSnapshot: EmployeeSnapshot[] = [
  fxSnapshotRow({ employee_id: '7', display_name: 'Sam K.', is_incomplete: true, schedule_expected_start: '13:00:00' }),
  fxSnapshotRow({ employee_id: '1', display_name: 'Dana R.' }),
];

type ManagerScenarioArgs = {
  ctx: RoleContext;
  /** The fictional closeouts the scenario reads; the pulse and the block derive from them. */
  days: DayVitals[];
  targets?: VitalsTargets;
  /** The scenario's calendar date, when it is not Tue Mar 3. */
  today?: string;
  dateLabel?: string;
  staffing: StaffingSummary;
  snapshot?: EmployeeSnapshot[];
  now: Date;
  todayLog: DepositLog | null;
  needsNow?: AttentionItem[];
  waiting?: AttentionItem[];
  deferred?: AttentionItem[];
  closeouts?: { id: string; deposit_date: string; sealed_at: string | null; needs_manager_review: boolean }[];
  goals?: GoalLike[];
  payroll?: { dueDate: string | null; dueLabel: string | null } | null;
  inbox?: { outstanding: number; label: string } | null;
  mine?: MyWork;
  personName?: string;
  timeLabel?: string;
  urgent?: Signal[];
  calendar?: OfficeDayCalendar | null;
};

/**
 * Every manager fixture runs the REAL briefing layer: the summary, the item
 * order, the exceptions, the status lines, and the spotlight rule are all
 * computed by home-brief.ts and attention/, never typed.
 */
function makeManager(args: ManagerScenarioArgs): ManagerView {
  const { ctx, staffing, todayLog } = args;
  const goals = args.goals ?? fxGoals;
  const needsNow = args.needsNow ?? [];
  const attentionSummary: AttentionSummary = {
    enabled: true,
    needsNow: needsNow.length,
    waiting: (args.waiting ?? []).length,
    oldestHours: needsNow.reduce<number | null>((m, i) => (i.ageHours === null ? m : Math.max(m ?? 0, i.ageHours)), null),
    payroll: args.payroll?.dueDate ? { label: args.payroll.dueLabel ?? 'payroll', days: 2 } : null,
    degraded: false,
  };
  const { block, pulse: input } = fxPerformance({
    role: 'manager', days: args.days, targets: args.targets ?? fxTargets, officePhase: staffing.office.phase,
    attention: attentionSummary, events: args.days.length ? undefined : [], today: args.today, calendar: args.calendar,
  });
  const closeDay = closeDayStatus(todayLog, staffing.office.phase);
  const home = buildHomeBrief({
    attention: { needsNow: args.needsNow ?? [], waiting: args.waiting ?? [], deferred: args.deferred ?? [], degradedSources: [], enabled: true },
    summary: staffing,
    snapshot: args.snapshot,
    now: args.now,
    today: input.today,
    closeouts: args.closeouts ?? [],
    closeDay,
    pace: monthPaceLines(input),
    paceScopeDate: input.latest?.date ?? null,
    goal: buildGoalBrief(goals, input.today),
    payroll: args.payroll ?? null,
    inbox: args.inbox ?? null,
  });
  return {
    kind: 'manager',
    header: { ...header('Practice manager', args.personName ?? 'Good morning, Sofia', args.timeLabel), ...(args.dateLabel ? { dateLabel: args.dateLabel } : {}) },
    roleContext: ctx,
    lanes: lanesFor(ctx, args.urgent ?? []),
    toolGroups: toolsFor(ctx),
    office: staffing.office,
    home,
    brief: buildDailyBrief(input),
    mine: args.mine ?? NO_WORK,
    ...block,
  };
}

/** Open office, mid-morning: yesterday saved but unsealed, five items need the manager. */
export const managerFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  days: fxHistory,
  staffing: staffingOpen,
  now: openNow,
  todayLog: null,
  needsNow: openItems,
  waiting: waitingItems,
  closeouts: openCloseouts,
  payroll: { dueDate: '2026-03-05', dueLabel: 'payroll Thu' },
  mine: myWorkFor({ acknowledgments: [{ id: 'ack-m1', title_snapshot: 'Sterilization log', due_at: '2026-03-05T00:00:00Z', acknowledged_at: null, waived_at: null }] }),
});

/**
 * The same open office with nothing waiting: yesterday sealed, one item
 * parked, one person not in yet. The queue stays compact and the numbers
 * follow it directly.
 */
export const managerClearFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  days: fxHistory,
  staffing: staffingOpen,
  now: openNow,
  todayLog: null,
  needsNow: [],
  waiting: [],
  deferred: [fxItem({
    key: 'content_review:cr-4', kind: 'content_review', verb: 'decide', label: 'Handbook v4 · review before publishing',
    subject: { employeeId: null, userId: 'u1', name: 'Dana R.' }, detail: 'Parked until Friday', ageHours: 40,
    parkedUntil: '2026-03-06T00:00:00Z',
  })],
  closeouts: [{ ...openCloseouts[0], sealed_at: '2026-03-02T22:40:00Z' }, openCloseouts[1]],
});

/** Same office after close: today saved but not yet sealed, one person still clocked in. */
export const managerClosedFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  days: closedHistory,
  staffing: staffingClosed,
  snapshot: closedSnapshot,
  now: closedNow,
  todayLog: fxTodayLog(),
  needsNow: [fxItem({
    key: 'pto_request:p1', kind: 'pto_request', verb: 'decide', label: 'PTO request · 2026-03-09 – 2026-03-10 (16h)',
    subject: { employeeId: '3', userId: 'u3', name: 'Priya S.' }, detail: '2 of 3 hygienists would be off that Monday', ageHours: 63,
    why: 'A PTO request is waiting on a manager decision.',
  })],
  closeouts: [{ id: 'fx-log', deposit_date: '2026-03-03', sealed_at: null, needs_manager_review: false }, ...openCloseouts],
  inbox: { outstanding: 1, label: 'doctor notes' },
  personName: 'Good evening, Sofia',
  timeLabel: '10:32 PM',
});

/**
 * Performance materially off pace on Mar 10, and a challenge that is off
 * track too: every office day is recorded, so the meters may read behind,
 * and the observations say what changed.
 */
const offPaceHistory: DayVitals[] = [
  ...fxCloseoutHistory('2025-10-01', '2026-02-27', { complete: true }),
  ...fxCloseoutHistory('2026-03-02', '2026-03-09', { complete: true }).map(d => ({ ...d, productionCents: 450_000, collectedCents: 225_000 })),
];
export const managerOffPaceFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  days: offPaceHistory,
  targets: { productionCents: 18_000_000, collectionsCents: 16_000_000, newPatientsSeen: 40 },
  today: '2026-03-10',
  dateLabel: 'Tue, Mar 10, 2026',
  staffing: staffingOpen,
  now: new Date(2026, 2, 10, 9, 42),
  todayLog: null,
  needsNow: openItems.slice(0, 2),
  closeouts: [{ id: 'log-0309', deposit_date: '2026-03-09', sealed_at: '2026-03-09T22:40:00Z', needs_manager_review: false }],
  goals: [{
    id: 'g3', title: 'Recall reactivation', metric: 'patients',
    progress: 3, target_count: 20, starts_on: '2026-02-16', ends_on: '2026-03-08', status: 'active',
  }],
});

/**
 * Attendance in the queue: an excuse request to decide, an attendance
 * report the rule opened (meet, then sign), three closeouts awaiting seal
 * (one category, three records), and a routine late arrival that is NOT
 * an item — the person acknowledged it and the rule counts it.
 */
const attendanceItems: AttentionItem[] = [
  fxItem({
    key: 'excuse_request:t1', kind: 'excuse_request', verb: 'decide', label: 'Excuse requested: pending review · 2026-03-03',
    subject: { employeeId: '2', userId: 'u2', name: 'Marcus T.' }, detail: '“School drop-off ran long”', ageHours: 1,
    why: 'The person asked for this late arrival to be excused. It waits on a manager decision and does not count toward the late-arrival rule until decided.',
  }),
  fxItem({
    key: 'attendance_meeting:i7', kind: 'attendance_meeting', verb: 'follow_up', label: 'Meet with team member · attendance report',
    subject: { employeeId: '5', userId: 'u5', name: 'Ken W.' }, detail: '3 unexcused late arrivals between 2026-02-04 and 2026-03-02 · 41 minutes late in total', ageHours: 20,
    why: 'Office rule: 3 unexcused late arrivals within a rolling 30-day period open an attendance incident report. It stays open until the meeting is recorded and both of you have signed.',
  }),
  fxItem({ key: 'close_day_unsealed:log-0226', kind: 'close_day_unsealed', verb: 'fix', label: 'Close the Day saved, not sealed · 2026-02-26', detail: 'The record is filled in but unsealed', ageHours: 110, why: 'An unsealed closeout is not on record; sealing locks what is on file.' }),
  fxItem({ key: 'close_day_unsealed:log-0227', kind: 'close_day_unsealed', verb: 'fix', label: 'Close the Day saved, not sealed · 2026-02-27', detail: 'The record is filled in but unsealed', ageHours: 86, why: 'An unsealed closeout is not on record; sealing locks what is on file.' }),
  fxItem({ key: 'close_day_unsealed:log-0302', kind: 'close_day_unsealed', verb: 'fix', label: 'Close the Day saved, not sealed · 2026-03-02', detail: 'The record is filled in but unsealed', ageHours: 14, why: 'An unsealed closeout is not on record; sealing locks what is on file.' }),
  openItems.find(i => i.kind === 'missing_clock_out')!,
  openItems.find(i => i.kind === 'pto_request')!,
].sort(compareByConsequence);

export const managerAttendanceFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  days: fxHistory,
  staffing: staffingOpen,
  now: openNow,
  todayLog: null,
  needsNow: attendanceItems,
  waiting: waitingItems,
  closeouts: [
    { id: 'log-0302', deposit_date: '2026-03-02', sealed_at: null, needs_manager_review: false },
    { id: 'log-0227', deposit_date: '2026-02-27', sealed_at: null, needs_manager_review: false },
    { id: 'log-0226', deposit_date: '2026-02-26', sealed_at: null, needs_manager_review: false },
  ],
  payroll: { dueDate: '2026-03-05', dueLabel: 'payroll Thu' },
});

/** Manager who also covers the front desk — personal lane stays compact. */
export const managerFrontDeskFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'front_desk', ['office_manager'], ['office_manager']),
  days: fxHistory,
  staffing: staffingOpen,
  now: openNow,
  todayLog: null,
  needsNow: openItems,
  waiting: waitingItems,
  closeouts: openCloseouts,
  payroll: { dueDate: '2026-03-05', dueLabel: 'payroll Thu' },
  urgent: bypassUrgent,
});

/** A new office from the manager's chair: nothing recorded, nothing invented. */
export const managerNewFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  days: [],
  targets: NO_TARGETS,
  staffing: staffingNewOffice,
  now: openNow,
  todayLog: null,
  goals: [],
});

/* ------------------------------- member ------------------------------- */

const FINANCIALS_HIDDEN: VitalsVisibility = {
  production: false,
  collections: false,
  newPatients: true,
};

type MemberScenarioArgs = {
  name: string;
  ctx: RoleContext;
  visibility?: VitalsVisibility;
  days?: DayVitals[];
  targets?: VitalsTargets;
  goals?: GoalLike[];
  work?: Partial<MyWorkInput>;
  overrides?: Partial<MemberView>;
};

/**
 * Member fixtures run the REAL visibility filters and the REAL work builder:
 * which metrics appear and which items need the person are decided by the
 * performance block, rolePulseItems, and buildMyWork, never hand-picked.
 */
function makeMember(args: MemberScenarioArgs): MemberView {
  const visibility = args.visibility ?? ALL_VISIBLE;
  const days = args.days ?? fxHistory;
  const { block, pulse: input } = fxPerformance({ role: 'employee', days, targets: args.targets ?? fxTargets, officePhase: 'open', visibility });
  const work = myWorkFor(args.work ?? memberWorkInput);
  const waiting = work.waiting.length;
  return {
    kind: 'member',
    header: header('Team member', `Good morning, ${args.name}`),
    roleContext: args.ctx,
    lanes: lanesFor(args.ctx, bypassUrgent),
    toolGroups: toolsFor(args.ctx),
    work,
    officePulseNote: 'Financial figures update after Close the Day — they are not live during the day.',
    rolePulse: rolePulseItems(args.ctx.primary, input, visibility),
    goal: buildGoalBrief(args.goals ?? fxGoals, input.today),
    ...block,
    status: {
      label: 'On the clock',
      detail: '2h 14m recorded today. Clock out from the bar when you finish.',
      tone: 'steady',
    },
    utilities: [
      { id: 'hours', value: '2:14', label: 'Recorded today', detail: 'Full history on your timesheet', href: '/timesheet' },
      { id: 'pto', value: '46h', label: 'PTO balance', detail: '1–3 years', href: '/pto' },
      { id: 'requests', value: String(waiting), label: 'Requests pending', detail: 'Waiting on a manager', href: '/my-requests' },
    ],
    attendanceStanding: null,
    ...args.overrides,
  };
}

export const frontDeskFixture = makeMember({
  name: 'Dana',
  ctx: context('member', 'Team member', 'front_desk'),
  work: { ...memberWorkInput, repliesOwed: 1 },
});

export const hygienistFixture = makeMember({
  name: 'Priya',
  ctx: context('member', 'Team member', 'hygienist'),
});

export const memberFixture = hygienistFixture;

export const assistantFixture = makeMember({
  name: 'Marcus',
  ctx: context('member', 'Team member', 'dental_assistant'),
  work: { ...memberWorkInput, openChecklistItems: 2 },
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

/** Front desk primary, dental assisting as a backup capability only — nothing of it in the queue. */
export const frontDeskBackupOnlyFixture = makeMember({
  name: 'Dana',
  ctx: context('member', 'Team member', 'front_desk', ['dental_assistant'], []),
});

/**
 * A late arrival waiting on the person's answer, an excuse request already
 * pending, an attendance report whose meeting is on record and needs their
 * signature, and a PTO request waiting on a manager. The standing line
 * reads from the same rule the office set.
 */
const lateArrivalTardies: MyWorkInput['tardies'] = [
  { id: 't-0302', user_id: FX_USER, entry_date: '2026-03-02', minutes_late: 12, approval_status: 'unreviewed', excuse_requested_at: null, acknowledged_at: null, resolved: false, timezone_suspect: false },
  { id: 't-0224', user_id: FX_USER, entry_date: '2026-02-24', minutes_late: 9, approval_status: 'unreviewed', excuse_requested_at: '2026-02-24T13:20:00Z', acknowledged_at: null, resolved: false, timezone_suspect: false },
  { id: 't-0210', user_id: FX_USER, entry_date: '2026-02-10', minutes_late: 15, approval_status: 'unapproved', excuse_requested_at: null, acknowledged_at: '2026-02-10T13:30:00Z', resolved: false, timezone_suspect: false },
];
const lateStanding = standingToday(lateArrivalTardies.map(t => ({ ...t })), DEFAULT_LATE_ARRIVAL_RULE, FX_TODAY);
export const memberLateArrivalFixture = makeMember({
  name: 'Priya',
  ctx: context('member', 'Team member', 'hygienist'),
  work: {
    tardies: lateArrivalTardies,
    incidents: [{ id: 'i-att-1', employee_id: FX_EMPLOYEE, category: 'attendance', status: 'meeting_completed', incident_date: '2026-02-20', meeting_recorded_at: '2026-02-27T15:00:00Z', employee_signed_at: null, manager_signed_at: null }],
    ptoRequests: [{ id: 'p-me', start_date: '2026-03-20', end_date: '2026-03-20', status: 'pending' }],
    acknowledgments: memberWorkInput.acknowledgments,
  },
  overrides: {
    attendanceStanding: {
      text: `Late arrivals: ${standingSentence(lateStanding, DEFAULT_LATE_ARRIVAL_RULE)}.`,
      tone: lateStanding.remaining === 0 ? 'attention' : 'calm',
      href: '/days-off',
    },
  },
});

/** Nothing assigned: the next-move hero says "clear" without a zero wall. */
export const memberClearFixture = makeMember({
  name: 'Priya',
  ctx: context('member', 'Team member', 'hygienist'),
  work: {},
  overrides: {
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
  days: [],
  targets: NO_TARGETS,
  goals: [],
  work: {},
  overrides: {
    officePulseNote: null,
    status: {
      label: 'Not clocked in',
      detail: 'Your punches appear here as soon as you clock in.',
      tone: 'calm',
    },
    utilities: [
      { id: 'hours', value: '0:00', label: 'Recorded today', detail: 'Full history on your timesheet', href: '/timesheet' },
      { id: 'pto', value: '0h', label: 'PTO balance', detail: 'Accrues as you work', href: '/pto' },
      { id: 'requests', value: '0', label: 'Requests pending', detail: 'Waiting on a manager', href: '/my-requests' },
    ],
  },
});
