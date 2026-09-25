import type { OperationalRole } from '@/lib/schedule-reader/types';
import { summarizeVitals, type DayVitals, type VitalsSummary, type VitalsTargets, type VitalsVisibility } from '@/hooks/usePracticeVitals';
import type { DepositLog } from '@/hooks/useDepositLog';
import {
  buildDailyBrief, buildGoalBrief, dailySummary, monthPaceLines, type GoalLike, type OwnerPulseInput,
} from '@/lib/owner-pulse';
import { closeDayStatus } from '@/lib/manager-pulse';
import { buildHomeBrief, needsYou } from '@/lib/home-brief';
import { compareByConsequence, type AttentionItem } from '@/lib/attention';
import type { EmployeeSnapshot } from '@/hooks/useOrgAttendanceSnapshot';
import { rolePulseItems } from '@/lib/member-pulse';
import type { PreparedReport } from '@/lib/prepared-report';
import type { ReportImportRow } from '@/lib/report-history';
import type { MissedEventLite } from '@/lib/missed-trend';
import type { PerformanceRaw } from '@/lib/home-performance';
import type { AttentionSummary } from '@/lib/home-insights';
import { daysInMonthOf, weeklyPaceForMonth } from '@/lib/metric-pace';
import { mondayOf } from '@/lib/time-utils';
import { shortcutsFor, roleLabel, roleMission } from './opRoles';
import { performanceBlockFrom } from './performance/block';
import type {
  ManagerView, MemberView, OwnerView, PerformanceBlock, PermissionTier, RoleContext, RoleLane, Signal,
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
 * sentence, recommendation, item ordering, and visibility filter below is
 * computed by the same production functions the live dashboards call
 * (owner-pulse.ts, home-brief.ts, attention/, member-pulse.ts). Fixtures
 * must never reimplement or hard-code that business logic.
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
//
// FICTIONAL closeout history. One deterministic generator produces the
// office days every fixture reads, so the strip, the chart, the meters, the
// observations, and the briefing sentence all agree with each other — and
// disagree with any real office, which is the point of a fixture.

const FX_TODAY = '2026-03-03';
const ALL_VISIBLE: VitalsVisibility = { production: true, collections: true, newPatients: true };

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

/** The weekdays between two dates, with a handful deliberately unrecorded. */
export function fxCloseoutHistory(from: string, to: string): DayVitals[] {
  const days: DayVitals[] = [];
  let i = 0;
  for (let d = new Date(`${from}T12:00:00Z`); d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = d.toISOString().slice(0, 10);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue; // the office is closed on weekends
    i += 1;
    if (i % 9 === 4) continue; // an unrecorded weekday now and then — a gap, never a zero
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

/** Oct 1, 2025 through yesterday, the last day saved but not yet sealed. */
const fxHistory: DayVitals[] = [
  ...fxCloseoutHistory('2025-10-01', '2026-02-27'),
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

/** A fictional loaded report package: posted charges and receipts by posting date. */
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
  const payload = {
    schema_version: 'purple-envelope-prepared-report-package-v1',
    target_org_id: 'fx-office',
    report_start: start,
    report_end: end,
    daily_financials_by_entry_date: rows,
    monthly_financials_by_entry_date: [],
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
    ...over,
  }) as DepositLog;

/* ------------------------------- owner -------------------------------- */

const ownerContext = context('owner', 'Owner', 'dentist');

/** A recorded Attention item, in the shape deriveAttention() returns. */
const fxItem = (over: Partial<AttentionItem> & Pick<AttentionItem, 'key' | 'kind' | 'verb' | 'label'>): AttentionItem => ({
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
    payroll: true, deadline: { label: 'payroll Thu', date: '2026-03-05', days: 2 },
  }),
  fxItem({
    key: 'pto_request:p1', kind: 'pto_request', verb: 'decide', label: 'PTO request · 2026-03-09 – 2026-03-10 (16h)',
    subject: { employeeId: '3', userId: 'u3', name: 'Priya S.' }, detail: '2 of 3 hygienists would be off that Monday', ageHours: 50,
  }),
  fxItem({
    key: 'content_review:v4', kind: 'content_review', verb: 'decide', label: 'Sterilization log · version 4 in review',
    detail: 'Submitted by Dana R.', ageHours: 20,
  }),
  fxItem({
    key: 'incident_countersign:i2', kind: 'incident_countersign', verb: 'decide', label: 'Incident report awaiting countersignature',
    subject: { employeeId: '2', userId: 'u2', name: 'Marcus T.' }, detail: 'Sharps exposure, first aid given', ageHours: 6,
  }),
  fxItem({
    key: 'challenge_verify:g2', kind: 'challenge_verify', verb: 'decide', label: 'Challenge result to verify',
    detail: 'Morning huddle on time — 10 of 10 claimed', ageHours: 3,
  }),
].sort(compareByConsequence);

const ownerAttention = { needsNow: ownerItems, waiting: [] as AttentionItem[], deferred: [] as AttentionItem[], degradedSources: [], enabled: true };
const ownerAttentionSummary: AttentionSummary = { enabled: true, needsNow: ownerItems.length, waiting: 0, oldestHours: 50, payroll: { label: 'payroll Thu', days: 2 }, degraded: false };

const openPerformance = fxPerformance({ role: 'owner', days: fxHistory, targets: fxTargets, officePhase: 'open', attention: ownerAttentionSummary });
const openBrief = buildDailyBrief(openPulseInput);

/** Established office, mid-morning, with real activity. */
export const ownerFixture: OwnerView = {
  kind: 'owner',
  header: header('Owner', 'Good morning, Megan'),
  roleContext: ownerContext,
  lanes: lanesFor(ownerContext),
  office: staffingOpen.office,
  summary: dailySummary(openPulseInput, openBrief, ownerItems.length),
  brief: openBrief,
  decisionCount: ownerItems.length,
  needs: needsYou(ownerAttention),
  goal: buildGoalBrief(fxGoals, FX_TODAY),
  staffing: staffingOpen,
  exceptions: [
    { id: 'p1', label: 'Unresolved office notes', detail: 'Notes Purple Envelope flagged, still open.', value: '3', href: '/inbox', tone: 'attention' },
    { id: 'p2', label: '1 attendance item needs review', detail: '1 unreviewed late arrival', value: '1', href: '/management/people', tone: 'attention' },
  ],
  ...openPerformance.block,
};

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
const closedPerformance = fxPerformance({ role: 'owner', days: closedHistory, targets: fxTargets, officePhase: 'after_close' });
const closedPulseInput: OwnerPulseInput = closedPerformance.pulse;
const closedBrief = buildDailyBrief(closedPulseInput);

export const ownerClosedFixture: OwnerView = {
  ...ownerFixture,
  header: header('Owner', 'Good evening, Megan', '10:32 PM'),
  office: staffingClosed.office,
  summary: dailySummary(closedPulseInput, closedBrief, 0),
  brief: closedBrief,
  decisionCount: 0,
  needs: needsYou({ ...ownerAttention, needsNow: [] }),
  staffing: staffingClosed,
  exceptions: [],
  ...closedPerformance.block,
};

/** A brand-new office: setup guidance, not a wall of zeros. */
const newPerformance = fxPerformance({ role: 'owner', days: [], targets: NO_TARGETS, officePhase: 'no_schedule', events: [] });
const newPulseInput: OwnerPulseInput = newPerformance.pulse;
const newBrief = buildDailyBrief(newPulseInput);

export const ownerNewFixture: OwnerView = {
  kind: 'owner',
  header: header('Owner', 'Good morning, Megan'),
  roleContext: ownerContext,
  lanes: lanesFor(ownerContext),
  office: staffingNewOffice.office,
  summary: dailySummary(newPulseInput, newBrief, 0),
  brief: newBrief,
  decisionCount: 0,
  needs: needsYou({ ...ownerAttention, needsNow: [] }),
  goal: null,
  staffing: staffingNewOffice,
  exceptions: [],
  ...newPerformance.block,
};

/**
 * Incomplete history: closeouts began on Feb 16, a loaded report package
 * covers Nov through January by posting date, and no goals are configured.
 * The chart shows gaps as gaps and offers the report view separately.
 */
const incompleteHistory: DayVitals[] = fxCloseoutHistory('2026-02-16', '2026-03-02');
const incompletePerformance = fxPerformance({
  role: 'owner', days: incompleteHistory, targets: NO_TARGETS, officePhase: 'open',
  reports: [fxReportPackage('2025-11-01', '2026-01-31', '2026-02-20T15:00:00Z')],
  attention: ownerAttentionSummary,
});
const incompleteBrief = buildDailyBrief(incompletePerformance.pulse);

export const ownerIncompleteFixture: OwnerView = {
  ...ownerFixture,
  summary: dailySummary(incompletePerformance.pulse, incompleteBrief, 2),
  brief: incompleteBrief,
  decisionCount: 2,
  needs: needsYou({ ...ownerAttention, needsNow: ownerItems.slice(0, 2) }),
  ...incompletePerformance.block,
};

/* ------------------------------ manager ------------------------------- */

/** Tue Mar 3, mid-morning: five things need the manager, one is waiting on a person. */
const openItems: AttentionItem[] = [
  fxItem({
    key: 'missing_clock_out:d1', kind: 'missing_clock_out', verb: 'fix', label: 'No clock-out · 2026-03-02',
    subject: { employeeId: '5', userId: 'u5', name: 'Ken W.' }, detail: 'Clocked in 7:58 AM, no clock-out on record', ageHours: 18,
    payroll: true, deadline: { label: 'payroll Thu', date: '2026-03-05', days: 2 },
  }),
  fxItem({
    key: 'pto_request:p1', kind: 'pto_request', verb: 'decide', label: 'PTO request · 2026-03-09 – 2026-03-10 (16h)',
    subject: { employeeId: '3', userId: 'u3', name: 'Priya S.' }, detail: '2 of 3 hygienists would be off that Monday', ageHours: 50,
  }),
  fxItem({
    key: 'correction_request:c1', kind: 'correction_request', verb: 'decide', label: 'Time correction · 2026-03-02',
    subject: { employeeId: '2', userId: 'u2', name: 'Marcus T.' }, detail: 'Forgot to clock out at lunch', ageHours: 20,
  }),
  fxItem({
    key: 'close_day_unsealed:log-0302', kind: 'close_day_unsealed', verb: 'fix', label: 'Close the Day saved, not sealed · 2026-03-02',
    detail: 'The record is filled in but unsealed', ageHours: 14,
  }),
  fxItem({
    key: 'tardy_unreviewed:t1', kind: 'tardy_unreviewed', verb: 'follow_up', label: 'Late 12 min · 2026-03-03 · unreviewed',
    subject: { employeeId: '2', userId: 'u2', name: 'Marcus T.' }, detail: 'No reason given yet', ageHours: 1,
  }),
].sort(compareByConsequence);

const waitingItems: AttentionItem[] = [
  fxItem({
    key: 'bypass_followup:b1', kind: 'bypass_followup', verb: 'follow_up', label: 'Checklist bypass reason owed · 2026-02-27',
    subject: { employeeId: '1', userId: 'u1', name: 'Dana R.' }, detail: '2 items were open · level 1', ageHours: 96,
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
  mine?: Signal[];
  personName?: string;
  timeLabel?: string;
  urgent?: Signal[];
};

/**
 * Every manager fixture runs the REAL briefing layer: the sentence, the item
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
    attention: attentionSummary, events: args.days.length ? undefined : [], today: args.today,
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
    office: staffing.office,
    home,
    mine: args.mine ?? [],
    ...block,
  };
}

// Wall-clock moments (the staffing rules read local hours): 9:42 AM and 10:32 PM.
const openNow = new Date(2026, 2, 3, 9, 42);
const closedNow = new Date(2026, 2, 3, 22, 32);

const openCloseouts = [
  { id: 'log-0302', deposit_date: '2026-03-02', sealed_at: null, needs_manager_review: false },
  { id: 'log-0227', deposit_date: '2026-02-27', sealed_at: '2026-02-27T22:40:00Z', needs_manager_review: false },
];

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
  mine: [
    { id: 'acks', label: 'Policies to sign', detail: 'Signing means you read that exact version.', value: '1', href: '/playbook', tone: 'attention' },
  ],
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
  })],
  closeouts: [{ id: 'fx-log', deposit_date: '2026-03-03', sealed_at: null, needs_manager_review: false }, ...openCloseouts],
  inbox: { outstanding: 1, label: 'doctor notes' },
  personName: 'Good evening, Sofia',
  timeLabel: '10:32 PM',
});

/**
 * Performance materially off pace on Mar 10, and a challenge that is off
 * track too: eight closed-out days whose collections lag a goal the office
 * set high, so the meters read behind and the observations say so.
 */
const offPaceHistory: DayVitals[] = [
  ...fxCloseoutHistory('2025-10-01', '2026-02-27'),
  ...fxCloseoutHistory('2026-03-02', '2026-03-09').map(d => ({ ...d, productionCents: 450_000, collectedCents: 225_000 })),
];
export const managerOffPaceFixture = makeManager({
  ctx: context('manager', 'Practice manager', 'office_manager'),
  days: offPaceHistory,
  targets: { productionCents: 18_000_000, collectionsCents: 16_000_000, newPatientsSeen: 40 },
  today: '2026-03-10',
  dateLabel: 'Tue, Mar 10, 2026',
  staffing: staffingOpen,
  now: openNow,
  todayLog: null,
  needsNow: openItems.slice(0, 2),
  closeouts: openCloseouts,
  goals: [{
    id: 'g3', title: 'Recall reactivation', metric: 'patients',
    progress: 3, target_count: 20, starts_on: '2026-02-16', ends_on: '2026-03-08', status: 'active',
  }],
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
  overrides?: Partial<MemberView>;
};

/**
 * Member fixtures run the REAL visibility filters: which metrics appear is
 * decided by the performance block and rolePulseItems, never hand-picked.
 */
function makeMember(args: MemberScenarioArgs): MemberView {
  const visibility = args.visibility ?? ALL_VISIBLE;
  const days = args.days ?? fxHistory;
  const { block, pulse: input } = fxPerformance({ role: 'employee', days, targets: args.targets ?? fxTargets, officePhase: 'open', visibility });
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
    officePulseNote: 'Financial figures update after Close the Day — they are not live during the day.',
    rolePulse: rolePulseItems(args.ctx.primary, input, visibility),
    mine: [
      { id: '1', label: 'Training assigned to me', detail: 'Modules not yet completed.', value: '2', href: '/training', tone: 'attention' },
      { id: '2', label: 'Policies to sign', detail: 'Signing means you read that exact version.', value: '1', href: '/playbook', tone: 'attention' },
      { id: '3', label: 'Bypass reasons owed', detail: 'Never blocks you — just needs a sentence.', value: '1', href: '/checklists', tone: 'attention' },
    ],
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
  days: [],
  targets: NO_TARGETS,
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
