/**
 * View models for the role dashboards.
 *
 * The dashboard components in this folder are PURE: they render one of these
 * objects and nothing else. Every field is produced from an existing product
 * hook by `useDashboardView` (live) or by `fixtures.ts` (design review only).
 * Nothing here fetches, mutates, or re-implements product logic.
 */

export type Tone = 'urgent' | 'attention' | 'steady' | 'calm';

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
