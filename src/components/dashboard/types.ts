/**
 * View models for the role dashboards.
 *
 * The dashboard components in this folder are PURE: they render one of these
 * objects and nothing else. Every field is produced from an existing product
 * hook by `useDashboardView` (live) or by `fixtures.ts` (design review only).
 * Nothing here fetches, mutates, or re-implements product logic.
 */

import type { OperationalRole } from '@/lib/schedule-reader/types';

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
  /** Set when the lane is compact because the person is not covering it today. */
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
  /** The one chart an owner reads: verified operational trend. */
  chart: Series | null;
  /** Command strip: the four numbers an owner reads first. */
  figures: Figure[];
  /** Decisions and exceptions that are the owner's to resolve. */
  decisions: Signal[];
  /** Staffing risk, today. */
  staffing: { present: number; expected: number; rows: PersonStatus[] };
  /** Operational goals in flight. */
  goals: ProgressRow[];
  /** Verified office pulse lines. */
  pulse: Signal[];
  /** Collections pace — only when the office records deposits and it is visible. */
  health: {
    collectedLabel: string;
    paceLabel: string;
    pacePct: number;
    disruptions: number;
    days: number;
  } | null;
};

export type ManagerView = {
  kind: 'manager';
  header: DashboardHeader;
  roleContext: RoleContext;
  chart: Series | null;
  /** Compact personal-work lane — never displaces the cockpit. */
  lanes: RoleLane[];
  figures: Figure[];
  /** Who is here right now. */
  roster: PersonStatus[];
  /** What needs the manager's hands. */
  attention: Signal[];
  /** Checklist / Close the Day progress. */
  progress: ProgressRow[];
  /** Today, in order. */
  timeline: TimelineRow[];
};

export type MemberView = {
  kind: 'member';
  header: DashboardHeader;
  roleContext: RoleContext;
  chart: Series | null;
  /** Primary role lane first, backup lanes compact underneath. */
  lanes: RoleLane[];
  /** Today's own status line. */
  status: { label: string; detail: string; tone: Tone };
  /** The single next action. */
  next: { title: string; detail: string; href: string; cta: string } | null;
  /** My open work, compact. */
  mine: Signal[];
  /** My progress. */
  progress: ProgressRow[];
  figures: Figure[];
  /** Office context a member is permitted to see. */
  office: Signal[];
};

export type DashboardView = OwnerView | ManagerView | MemberView;
