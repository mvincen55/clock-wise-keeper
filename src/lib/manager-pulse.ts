// Manager daily pulse — the deterministic layer behind Manager Home.
//
// Built on the SAME canonical facts as Owner Home (owner-pulse.ts +
// usePracticeVitals): the manager reads the identical numbers, ordered for a
// different mission — is the office okay, is performance on pace, what needs
// my hands before it reaches the owner, and is Close the Day trustworthy.
//
// Everything is a pure function of recorded data. No AI, no invented urgency:
// a closed office with nobody clocked in is calm, not a crisis, and a missing
// closeout is stated as missing, never rendered as $0.

import type { DepositLog } from '@/hooks/useDepositLog';
import type { OfficePhase } from '@/components/dashboard/staffing';
import {
  buildDailyBrief,
  collectionsPace,
  dailySummary,
  missedCount,
  money,
  productionPace,
  newPatientsSeenPace,
  type DailyBrief,
  type GoalLike,
  type OwnerPulseInput,
  type PulseTone,
  type Receipt,
} from '@/lib/owner-pulse';
import { daysBetween, formatDate } from '@/lib/time-utils';

/* --------------------------- close the day ----------------------------- */

export type CloseDayState =
  | 'not_started'
  | 'in_progress'
  | 'saved_unsealed'
  | 'sealed'
  | 'sealed_needs_review';

export type CloseDayStatus = {
  state: CloseDayState;
  label: string;
  detail: string;
  /** Deep link to the exact Close the Day record. */
  href: string;
  tone: PulseTone;
};

/**
 * Where today's closeout stands, from the deposit_logs row itself.
 * "In progress" means a row exists but the practice-vitals questions are not
 * answered yet; "saved, unsealed" means the record is complete but unsealed.
 */
export function closeDayStatus(log: DepositLog | null, officePhase: OfficePhase): CloseDayStatus {
  const href = '/deposit-log';
  if (!log) {
    const stillWorking =
      officePhase === 'open' || officePhase === 'before_open' || officePhase === 'unknown_hours';
    return {
      state: 'not_started',
      label: 'Not started',
      detail: stillWorking
        ? 'Nothing saved yet — normal while the office is still working.'
        : "Today's closeout has not been started.",
      href,
      tone: stillWorking ? 'calm' : 'attention',
    };
  }
  if (log.sealed_at) {
    if (log.needs_manager_review) {
      return {
        state: 'sealed_needs_review',
        label: 'Sealed — items need review',
        detail: 'The day is sealed, but low-confidence items are flagged for manager review.',
        href,
        tone: 'attention',
      };
    }
    return {
      state: 'sealed',
      label: 'Sealed',
      detail: 'The record is complete and sealed.',
      href,
      tone: 'steady',
    };
  }
  const vitalsAnswered =
    log.production_cents !== null &&
    log.new_patients_scheduled_count !== null &&
    log.new_patients_seen_count !== null;
  if (!vitalsAnswered) {
    return {
      state: 'in_progress',
      label: 'In progress',
      detail: 'Saved, but the practice-vitals questions are not all answered yet.',
      href,
      tone: 'calm',
    };
  }
  return {
    state: 'saved_unsealed',
    label: 'Saved, not sealed',
    detail: 'The record is filled in — it still needs the seal.',
    href,
    tone: 'attention',
  };
}

/* ----------------------------- the briefing ---------------------------- */

export type ManagerBrief = {
  /** One deterministic sentence answering "is the office okay right now?" */
  summary: string;
  /** The day scope + facts, shared with Owner Home (same builder). */
  daily: DailyBrief;
};

/**
 * The manager briefing reuses the owner's daily builders — same facts, same
 * honesty rules — and appends the operational reality a manager acts on.
 */
export function buildManagerBrief(
  input: OwnerPulseInput,
  staffingAssessment: string | null,
): ManagerBrief {
  const daily = buildDailyBrief(input);
  let summary = dailySummary(input, daily, 0);
  if (staffingAssessment === 'unsafe' || staffingAssessment === 'understaffed') {
    summary += ` Staffing was answered "${staffingAssessment === 'unsafe' ? 'unsafe or unsustainable' : 'understaffed'}" — that comes first.`;
  }
  return { summary, daily };
}

/* ----------------------- what needs your hands -------------------------- */

/** One actionable line, shaped like the dashboards' Signal rows. */
export type ActionItem = {
  id: string;
  label: string;
  value: string;
  detail?: string;
  href?: string;
  tone: PulseTone;
};

export type ManagerIntervention = {
  /** The single recommended next intervention, with its evidence. */
  text: string;
  receipts: Receipt[];
  action: { label: string; to: string } | null;
};

/** Everything the queue can know, all optional-by-zero. */
export type InterventionInput = {
  input: OwnerPulseInput;
  closeDay: CloseDayStatus;
  /** Today's human staffing answer from the closeout, if any. */
  staffingAssessment: string | null;
  /** Rows flagged low-confidence / needing manager review today. */
  lowConfidenceCount: number;
  ptoRequests: number;
  timeCorrections: number;
  changeRequests: number;
  managerReviews: number;
  bypasses: number;
  overdueAcks: number;
  openTraining: number;
  nudges: number;
  goals: GoalLike[];
};

/**
 * The manager's action queue, ordered by operational consequence — a fixed
 * priority list, never "whichever hook returned first". Returns the whole
 * ordered queue; the first item is the recommended next intervention.
 */
export function buildInterventionQueue(args: InterventionInput): {
  next: ManagerIntervention | null;
  queue: ActionItem[];
} {
  const { input, closeDay, staffingAssessment } = args;
  const queue: ActionItem[] = [];
  let next: ManagerIntervention | null = null;
  const propose = (candidate: ManagerIntervention) => {
    if (!next) next = candidate;
  };

  // 1 — a human said the day was unsafe or understaffed. Nothing outranks it.
  if (staffingAssessment === 'unsafe' || staffingAssessment === 'understaffed') {
    const label =
      staffingAssessment === 'unsafe' ? 'Unsafe staffing answer today' : 'Understaffed answer today';
    queue.push({
      id: 'staffing-answer',
      label,
      value: '!',
      detail: 'The closeout staffing question was answered by a person — read it first.',
      href: '/deposit-log',
      tone: 'urgent',
    });
    propose({
      text: `Today's closeout answered staffing as "${staffingAssessment}". Look at what drove it before planning tomorrow's schedule.`,
      receipts: [
        {
          label: 'Staffing (human read)',
          value: staffingAssessment,
          source: "deposit_logs, today's staffing_assessment",
        },
      ],
      action: { label: 'Open Close the Day', to: '/deposit-log' },
    });
  }

  // 2 — the record of truth: closeouts missing, unsealed, or flagged.
  if (input.latest !== null) {
    const gap = daysBetween(input.latest.date, input.today);
    if (gap >= 2) {
      queue.push({
        id: 'closeout-gap',
        label: 'Close the Day is behind',
        value: String(gap),
        detail: `No day closed out since ${formatDate(input.latest.date)}. Every pulse number ages with it.`,
        href: '/deposit-log',
        tone: 'urgent',
      });
      propose({
        text: `No day has been closed out since ${formatDate(input.latest.date)}. The office pulse can only be as current as the deposit log — enter the missing days first.`,
        receipts: [
          { label: 'Last closeout', value: formatDate(input.latest.date), source: 'deposit_logs, most recent row' },
          { label: 'Days since', value: String(gap), source: 'calendar days, Eastern' },
        ],
        action: { label: 'Open Close the Day', to: '/deposit-log' },
      });
    }
  }
  if (closeDay.state === 'saved_unsealed' || closeDay.state === 'sealed_needs_review') {
    queue.push({
      id: 'closeout-state',
      label: closeDay.state === 'saved_unsealed' ? "Today's closeout needs the seal" : 'Sealed day has items to review',
      value: '1',
      detail: closeDay.detail,
      href: closeDay.href,
      tone: 'attention',
    });
    propose({
      text:
        closeDay.state === 'saved_unsealed'
          ? "Today's record is filled in but unsealed. Sealing it locks what is on file and closes the day cleanly."
          : 'Today is sealed with low-confidence items flagged. A quick review keeps the record trustworthy.',
      receipts: [{ label: 'Close the Day', value: closeDay.label, source: 'deposit_logs, today' }],
      action: { label: 'Open Close the Day', to: closeDay.href },
    });
  }

  // 3 — accountability records waiting on this manager. People wait on these.
  if (args.managerReviews > 0) {
    queue.push({
      id: 'reviews',
      label: 'Records awaiting your review',
      value: String(args.managerReviews),
      detail: 'Accountability chain — you cannot review your own.',
      href: '/management',
      tone: 'urgent',
    });
    propose({
      text: `${args.managerReviews} accountability record${args.managerReviews === 1 ? ' is' : 's are'} waiting on your review — someone is blocked until it moves.`,
      receipts: [
        { label: 'Awaiting manager', value: String(args.managerReviews), source: 'accountability reports, status awaiting_manager' },
      ],
      action: { label: 'Open management', to: '/management' },
    });
  }

  // 4 — a metric materially off its own pace.
  const paces = [
    { id: 'production', label: 'Production behind pace', pace: productionPace(input), fmt: money },
    { id: 'collections', label: 'Collections behind pace', pace: collectionsPace(input), fmt: money },
    { id: 'new-patients', label: 'New patients seen behind pace', pace: newPatientsSeenPace(input), fmt: String },
  ];
  for (const p of paces) {
    if (p.pace && p.pace.status === 'behind') {
      queue.push({
        id: `pace-${p.id}`,
        label: p.label,
        value: p.fmt(Math.abs(p.pace.diff)),
        detail: `${p.fmt(p.pace.actual)} vs ${p.fmt(p.pace.pacedTarget)} expected by now (its own goal — never another metric's).`,
        href: '/reports',
        tone: 'attention',
      });
      propose({
        text: `${p.label.replace(' behind pace', '')} is running behind its own monthly goal. The day-by-day detail says whether it is a posting gap or a schedule gap.`,
        receipts: [
          {
            label: 'Actual vs paced goal',
            value: `${p.fmt(p.pace.actual)} vs ${p.fmt(p.pace.pacedTarget)}`,
            source: `deposit_logs vs its configured goal, ${input.thisMonth.days} closed-out days`,
          },
        ],
        action: { label: 'Open reports', to: '/reports' },
      });
    }
  }

  // 5 — low-confidence schedule metrics flagged for review.
  if (args.lowConfidenceCount > 0) {
    queue.push({
      id: 'low-confidence',
      label: 'Schedule metrics need review',
      value: String(args.lowConfidenceCount),
      detail: 'Low-confidence captures — confirm or correct them.',
      href: '/deposit-log',
      tone: 'attention',
    });
  }

  // 6 — people waiting on approvals.
  if (args.ptoRequests > 0) {
    queue.push({
      id: 'pto',
      label: 'PTO requests pending',
      value: String(args.ptoRequests),
      detail: 'Approve or decline before the schedule locks.',
      href: '/approvals',
      tone: 'attention',
    });
  }
  if (args.timeCorrections > 0) {
    queue.push({
      id: 'corrections',
      label: 'Time corrections pending',
      value: String(args.timeCorrections),
      detail: 'Each one keeps the original punch on record.',
      href: '/approvals',
      tone: 'attention',
    });
  }
  if (args.changeRequests > 0) {
    queue.push({
      id: 'changes',
      label: 'Change requests pending',
      value: String(args.changeRequests),
      detail: 'Waiting on a manager decision.',
      href: '/approvals',
      tone: 'attention',
    });
  }

  // 7 — follow-through: bypasses, acknowledgments, training, nudges.
  if (args.bypasses > 0) {
    queue.push({
      id: 'bypasses',
      label: 'Checklist bypass reasons open',
      value: String(args.bypasses),
      detail: 'A sentence closes each one.',
      href: '/checklists',
      tone: 'attention',
    });
  }
  if (args.overdueAcks > 0) {
    queue.push({
      id: 'acks',
      label: 'Unsigned policy acknowledgments',
      value: String(args.overdueAcks),
      detail: 'Exact published versions still unsigned.',
      href: '/playbook',
      tone: 'attention',
    });
  }
  if (args.openTraining > 0) {
    queue.push({
      id: 'training',
      label: 'Training assignments open',
      value: String(args.openTraining),
      detail: 'Assigned modules not yet completed.',
      href: '/training',
      tone: 'attention',
    });
  }
  if (args.nudges > 0) {
    queue.push({
      id: 'nudges',
      label: 'Unresolved office notes',
      value: String(args.nudges),
      detail: 'Notes Purple Envelope flagged, still open.',
      href: '/inbox',
      tone: 'attention',
    });
  }

  // 8 — a sprint running out of runway.
  const active = args.goals.filter(g => g.status === 'active');
  for (const g of active) {
    const daysLeft = Math.max(0, daysBetween(input.today, g.ends_on));
    const remaining = Math.max(0, g.target_count - g.progress);
    if (daysLeft <= 3 && remaining > 0) {
      queue.push({
        id: `sprint-${g.id}`,
        label: `"${g.title}" is running out of runway`,
        value: `${daysLeft}d`,
        detail: `${remaining} to go with ${daysLeft} day${daysLeft === 1 ? '' : 's'} left.`,
        href: '/goals',
        tone: 'attention',
      });
    }
  }

  // If nothing proposed itself yet, the first queued item is the intervention.
  if (!next && queue.length > 0) {
    const top = queue[0];
    propose({
      text: `${top.label} is the biggest thing waiting on you right now.`,
      receipts: [{ label: top.label, value: top.value, source: top.detail ?? 'live queue' }],
      action: top.href ? { label: 'Open it', to: top.href } : null,
    });
  }

  return { next, queue };
}

/* -------- re-export the shared day helpers the manager view uses -------- */

export { missedCount };
