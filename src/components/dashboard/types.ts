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
import type { CloseDayStatus } from '@/lib/manager-pulse';
import type { RolePulseItem } from '@/lib/member-pulse';
import type { HomeBrief, HomeSummary, NeedsYou, StatusLine, TodayBand } from '@/lib/home-brief';
import type { PerformanceData } from '@/lib/home-performance';
import type { GoalMeter } from '@/lib/goal-progress';
import type { HomeInsight } from '@/lib/home-insights';
import type { MyWork } from '@/lib/my-work';
import type { ChosenGoals } from '@/lib/dashboard-goals';

export type { OfficeStatus, StaffingSummary };
export type {
  DailyBrief, GoalBrief, MissedMonth, MonthDetail, MonthPaceLine, OwnerRecommendation, PulseFact,
};
export type { CloseDayStatus, RolePulseItem, HomeBrief, HomeSummary, NeedsYou, MyWork, TodayBand };
export type { PerformanceData, GoalMeter, HomeInsight };

/** Whether the performance rows are in hand, still loading, or failed to read. */
export type PerformanceState = 'loading' | 'ok' | 'error';

/**
 * The shared performance surfaces every role renders through the same
 * components: the rows behind the chart and strip, the month's goal meters,
 * and the observations. A member view carries only what the office shares.
 */
export type PerformanceBlock = {
  /** Self-chosen monthly goals, already scoped to the viewer and office. */
  chosenGoals?: ChosenGoals;
  performance: PerformanceData | null;
  performanceState: PerformanceState;
  /** Production and collections against their own targets; null while loading. */
  goalMeters: GoalMeter[] | null;
  /** At most three observations; null while loading; absent for members. */
  insights: HomeInsight[] | null;
  /** The frequent tools that sit in the header as primary actions (admins). */
  tools: Shortcut[];
};

export type Tone = 'urgent' | 'attention' | 'steady' | 'calm';

/** Permission/authority tier — what you are allowed to see and do. */
export type PermissionTier = 'owner' | 'manager' | 'member';

/**
 * A link into an existing surface. `minTier` hides links the tier cannot
 * open; `permission` names a per-employee grant that unlocks the link for a
 * member anyway (mirroring the RLS that actually enforces it).
 */
export type Shortcut = {
  id: string;
  label: string;
  to: string;
  detail?: string;
  minTier?: PermissionTier;
  permission?: string;
};

/**
 * One group in the tools area. `emphasis` decides whether the group is
 * open by default: an assigned responsibility and today's coverage are;
 * a backup capability and the long tail are revealed on request.
 */
export type ToolGroup = {
  id: string;
  label: string;
  /** "Assigned", "Covering today", "Backup — can cover", "Management", "Everyone". */
  note?: string;
  emphasis: 'primary' | 'secondary';
  tools: Shortcut[];
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
 * One operational-role lane: the assignment itself (primary) or a backup
 * role, with the time-sensitive items it contributes today. Only a role the
 * person is covering today elevates items; a backup capability never does.
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
  /** Today's shift as the schedule prints it — "8:00 AM – 5:00 PM", "from 1:00 PM" — or null when no times are set. */
  shift?: string | null;
  /** Clocking from home today. */
  remote?: boolean;
  /** Minutes after the scheduled start the first punch landed; null when on time or not yet in. */
  minutesLate?: number | null;
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

export type OwnerView = PerformanceBlock & {
  kind: 'owner';
  header: DashboardHeader;
  roleContext: RoleContext;
  /** Compact lane when the owner also works a chair or the desk. */
  lanes: RoleLane[];
  /** The organized tools area: the owner's tools first, the rest on request. */
  toolGroups: ToolGroup[];
  /** Current office state — open, closed, nobody scheduled. */
  office: OfficeStatus;
  /** The short summary: the office state, everyone on the roster, and at most three priorities. */
  summary: HomeSummary;
  /** Today's exceptions and count line — the same band Manager Home reads. */
  today: TodayBand;
  /** The latest closed-out day's facts, honestly labeled. */
  brief: DailyBrief | null;
  /** The latest closeout's state (sealed, not sealed, none on record), shown with its facts. */
  lastDay: StatusLine | null;
  /** Everything waiting on owner authority, resolved to one number. */
  decisionCount: number;
  /** The same Attention lists Manager Home shows. */
  needs: NeedsYou;
  /** The owner's own open items (a policy to sign, a module assigned). */
  mine: MyWork;
  /** The office challenge, shown once; moreCount collapses the rest. */
  goal: GoalBrief | null;
  /** Phase-aware staffing. Attendance surfaces here ONLY as a real exception. */
  staffing: StaffingSummary;
  /** Real, unresolved operational exceptions (notes, attendance review). */
  exceptions: Signal[];
};

export type ManagerView = PerformanceBlock & {
  kind: 'manager';
  header: DashboardHeader;
  roleContext: RoleContext;
  /** A compact personal-work lane; never displaces the briefing. */
  lanes: RoleLane[];
  toolGroups: ToolGroup[];
  /** Current office state, kept calm and compact. */
  office: OfficeStatus;
  /**
   * The briefing: the summary, the Attention lists, today's exceptions,
   * the status lines, the spotlight, wrap-up. Every number has one home.
   */
  home: HomeBrief;
  /** The latest closed-out day's facts, honestly labeled. */
  brief: DailyBrief | null;
  /** What needs the manager personally; empty when there is nothing. */
  mine: MyWork;
  /** The chosen office goal, shown once; moreCount collapses the rest. */
  goal: GoalBrief | null;
};

export type MemberView = PerformanceBlock & {
  kind: 'member';
  header: DashboardHeader;
  roleContext: RoleContext;
  /** Primary role lane first, backup lanes compact underneath. */
  lanes: RoleLane[];
  toolGroups: ToolGroup[];
  /** My open work: what needs me now, and what waits on someone else. */
  work: MyWork;
  /** Honest time-semantics line for the pulse (e.g. updates after closeout). */
  officePulseNote: string | null;
  /** Office facts relevant to this member's operational role. */
  rolePulse: RolePulseItem[];
  /** The shared office goal (never personal blame for office results). */
  goal: GoalBrief | null;
  /** Personal utilities: today's recorded time, PTO, timesheet links. */
  status: { label: string; detail: string; tone: Tone };
  utilities: Figure[];
  /** Where the person stands against the office's late-arrival rule, when it applies. */
  attendanceStanding: { text: string; tone: Tone; href: string } | null;
};

export type DashboardView = OwnerView | ManagerView | MemberView;
