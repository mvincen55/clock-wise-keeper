/**
 * View models for the role dashboards.
 *
 * The dashboard components in this folder are PURE: they render one of these
 * objects and nothing else. Every field is produced from an existing product
 * hook by `useDashboardView` (live) or by `fixtures.ts` (design review only).
 * Nothing here fetches, mutates, or re-implements product logic.
 */

import type { OperationalRole } from '@/lib/schedule-reader/types';
import type { OfficeStatus, StaffingSummary } from './staffing';
import type {
  DailyBrief, GoalBrief, MissedMonth, MonthDetail, MonthPaceLine, OwnerRecommendation, PulseFact,
} from '@/lib/owner-pulse';
import type { ActionItem, CloseDayStatus, ManagerIntervention } from '@/lib/manager-pulse';
import type { RolePulseItem } from '@/lib/member-pulse';

export type { OfficeStatus, StaffingSummary };
export type {
  DailyBrief, GoalBrief, MissedMonth, MonthDetail, MonthPaceLine, OwnerRecommendation, PulseFact,
};
export type { ActionItem, CloseDayStatus, ManagerIntervention, RolePulseItem };

export type Tone = 'urgent' | 'attention' | 'steady' | 'calm';

/** Permission/authority tier — what you are allowed to see and do. */
export type PermissionTier = 'owner' | 'manager' | 'member';

/** A link into an existing surface. `minTier` hides links the tier cannot open. */
export type Shortcut = {
  id: string;
  label: string;
  to: string;
  detail?: string;
  minTier?: PermissionTier;
};

/**
 * The two personalization dimensions, resolved.
 * Permission tier decides the dashboard MISSION; operational roles decide the
 * daily WORK surfaced inside it. They are never conflated.
 */
export type RoleContext = {
  tier: PermissionTier;
  tierLabel: string;
  primary: OperationalRole | null;
  primaryLabel: string | null;
  secondary: OperationalRole[];
  secondaryLabels: string[];
  /** Secondary roles whose assignment window covers today. */
  coveringToday: OperationalRole[];
  coveringTodayLabels: string[];
};

/**
 * One operational-role lane. The primary lane sets emphasis; backup lanes are
 * compact and sit lower unless the person is covering that role today.
 */
export type RoleLane = {
  role: OperationalRole;
  label: string;
  kind: 'primary' | 'backup';
  mission: string;
  shortcuts: Shortcut[];
  /** Time-sensitive items from this role — only elevated when covering today. */
  urgent: Signal[];
  /** True only for an explicit, dated coverage assignment that includes today. */
  covering?: boolean;
  /** Short state line: "Also covering today" vs "Backup — can cover". */
  note?: string;
};

/**
 * A chart series. Every chart must answer `question` and link into the
 * workflow that fixes it — no decorative analytics.
 */
export type Series = {
  id: string;
  title: string;
  question: string;
  caption: string;
  href?: string;
  /** Optional context line rendered under the chart. */
  footnote?: string;
  points: { x: string; value: number; of?: number; muted?: boolean }[];
  /** Formats the big readout. */
  format?: 'count' | 'percent' | 'hours';
};

/** A single actionable line: what it is, how many, where to go. */
export type Signal = {
  id: string;
  label: string;
  /** Big value on the right of the row. Empty string hides it. */
  value: string;
  detail?: string;
  href?: string;
  tone: Tone;
};

/** A headline number in the command strip. */
export type Figure = {
  id: string;
  value: string;
  label: string;
  detail?: string;
  tone?: Tone;
  href?: string;
};

export type PersonStatus = {
  id: string;
  name: string;
  /** Short human status: "In", "Late 12m", "Out — PTO", "No punch". */
  status: string;
  tone: Tone;
};

export type ProgressRow = {
  id: string;
  label: string;
  done: number;
  total: number;
  detail?: string;
  href?: string;
};

export type TimelineRow = {
  id: string;
  time: string;
  label: string;
  detail?: string;
  tone: Tone;
};

export type DashboardHeader = {
  officeName: string;
  roleLabel: string;
  personName: string;
  dateLabel: string;
  timeLabel: string;
};

export type OwnerView = {
  kind: 'owner';
  header: DashboardHeader;
  roleContext: RoleContext;
  /** Compact lane when the owner also works a chair or the desk. */
  lanes: RoleLane[];
  /** Current office state — open, closed, nobody scheduled. */
  office: OfficeStatus;
  /**
   * The 20-second briefing sentence, deterministically built from recorded
   * facts. Null while vitals are still loading — never a fabricated line.
   */
  summary: string | null;
  /** TODAY block of the pulse: honest day scope, facts, and time semantics. */
  brief: DailyBrief | null;
  /** One grounded recommendation with receipts, or null while loading. */
  lookAt: OwnerRecommendation | null;
  /** Everything waiting on owner authority, resolved to one number. */
  decisionCount: number;
  /** The decision lines behind that number (component renders open ones). */
  decisions: Signal[];
  /** The office goal the hero shows; moreCount collapses the rest. */
  goal: GoalBrief | null;
  /**
   * Month in progress — the three pace lines (production, collections, new
   * patients seen), missed MTD, compact trend. The month numbers' one home.
   */
  month: MonthDetail | null;
  /** Phase-aware staffing. Attendance surfaces here ONLY as a real exception. */
  staffing: StaffingSummary;
  /** Real, unresolved operational exceptions (notes, attendance review). */
  exceptions: Signal[];
};

export type ManagerView = {
  kind: 'manager';
  header: DashboardHeader;
  roleContext: RoleContext;
  /** H — compact personal-work lane; never displaces the cockpit. */
  lanes: RoleLane[];
  /** A — current office state, kept calm and compact. */
  office: OfficeStatus;
  /**
   * B — Manager Pulse: deterministic briefing sentence + the day's facts,
   * built by the same canonical layer Owner Home reads. Null while loading.
   */
  summary: string | null;
  brief: DailyBrief | null;
  /** C — the three performance cards. Null while vitals load. */
  performance: MonthPaceLine[] | null;
  /** The new-patient card's pipeline row: scheduled this week. */
  pipeline: { scheduledThisWeek: number; recordedDays: number } | null;
  /** D — the single recommended intervention, with receipts. */
  next: ManagerIntervention | null;
  /** D — the rest of the queue, ordered by operational consequence. */
  queue: ActionItem[];
  /** E — where today's Close the Day record stands. */
  closeDay: CloseDayStatus | null;
  /** F — phase-aware staffing: live roster while open, calm summary after. */
  staffing: StaffingSummary;
  /** G — the primary office sprint; moreCount collapses the rest. */
  goal: GoalBrief | null;
};

export type MemberView = {
  kind: 'member';
  header: DashboardHeader;
  roleContext: RoleContext;
  /** C — primary role lane first, backup lanes compact underneath. */
  lanes: RoleLane[];
  /** A — the single next action ("My Next Move"). */
  next: { title: string; detail: string; href: string; cta: string } | null;
  /**
   * B — Our Office Pulse: the same canonical month lines the owner reads,
   * filtered by each metric's own visibility setting. A hidden metric is
   * omitted entirely — no locked teaser.
   */
  officePulse: MonthPaceLine[];
  /** Honest time-semantics line for the pulse (e.g. updates after closeout). */
  officePulseNote: string | null;
  /** C — office facts relevant to this member's operational role. */
  rolePulse: RolePulseItem[];
  /** D — my open work, compact. */
  mine: Signal[];
  /** E — the shared office goal (never personal blame for office results). */
  goal: GoalBrief | null;
  /** F — personal utilities: today's recorded time, PTO, timesheet links. */
  status: { label: string; detail: string; tone: Tone };
  utilities: Figure[];
};

export type DashboardView = OwnerView | ManagerView | MemberView;
