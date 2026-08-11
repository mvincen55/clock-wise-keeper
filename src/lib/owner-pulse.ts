// Owner daily pulse — the deterministic layer behind Owner Home.
//
// Everything here is a pure function of recorded office data: deposit_logs
// rollups (via usePracticeVitals), team_goals rows, and the office phase from
// staffing.ts. No AI, no invented targets, no causal claims. Every derived
// judgment ("behind pace", "above recent pace", "on track") states its math in
// a receipt so the UI can show exactly why a sentence was said.
//
// Missing data is never rendered as zero: a day with no deposit-log row has no
// production fact at all, and the pulse says the closeout is not in yet.

import type { DayVitals, VitalsSummary } from '@/hooks/usePracticeVitals';
import type { OfficePhase } from '@/components/dashboard/staffing';
import { daysBetween, formatDate } from '@/lib/time-utils';

/* ------------------------------- inputs -------------------------------- */

/** The slice of a team_goals row the pulse needs. Structural on purpose. */
export type GoalLike = {
  id: string;
  title: string;
  metric: string;
  progress: number;
  target_count: number;
  starts_on: string;
  ends_on: string;
  status: 'active' | 'pending_verification' | string;
};

export type OwnerPulseInput = {
  /** Eastern-local calendar date, YYYY-MM-DD. */
  today: string;
  /** deposit_logs row for today, or null when no closeout is entered yet. */
  todayVitals: DayVitals | null;
  /** Most recent closeout on record (may be today's), or null. */
  latest: DayVitals | null;
  /** Month-to-date rollup of this calendar month's closeouts. */
  thisMonth: VitalsSummary;
  /** Rollup of the true previous calendar month, or null when none exists. */
  prevMonth: (VitalsSummary & { month: string }) | null;
  /** Fraction of this month elapsed, 0–1. */
  monthElapsed: number;
  /** Org-configured monthly collections goal in cents; 0 = not configured. */
  targetCents: number;
  /** targetCents × monthElapsed — what "on pace" collections look like now. */
  pacedTargetCents: number;
  /** Office phase right now, from staffing.ts. */
  officePhase: OfficePhase;
};

/* ------------------------------- outputs ------------------------------- */

export type PulseTone = 'urgent' | 'attention' | 'steady' | 'calm';

/** One high-value fact in the Today's Office Pulse hero. */
export type PulseFact = {
  id: string;
  label: string;
  value: string;
  detail?: string;
  tone: PulseTone;
  href?: string;
};

export type DailyBrief = {
  /** Which recorded day the facts describe. */
  scope: 'today' | 'previous' | 'none';
  /** "Today's closeout" / "Friday's closeout" / "No closeouts yet". */
  dayLabel: string;
  /** The date the facts belong to, or null when there are none. */
  dayDate: string | null;
  /** Honest time-semantics line, e.g. "Today's closeout has not been entered yet." */
  note: string | null;
  /** Production / collected / missed for the shown day. Empty when scope is none. */
  facts: PulseFact[];
};

export type CollectionsPace = {
  collectedCents: number;
  targetCents: number;
  pacedTargetCents: number;
  /** collected − paced target; positive = ahead. */
  diffCents: number;
  /** Percent of the FULL monthly goal collected so far. */
  pctOfTarget: number;
  status: 'ahead' | 'on_pace' | 'behind';
};

export type MissedMonth = {
  total: number;
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
  /**
   * Pace claim vs the previous month, or null when the recorded data cannot
   * support one (no prior month, thin prior month, or a thin current month).
   */
  trend: 'above_pace' | 'improving' | 'steady' | null;
  trendLabel: string | null;
  /** prevMonth.disruptions × monthElapsed — what "usual by now" looks like. */
  baseline: number | null;
};

export type GoalBrief = {
  id: string;
  title: string;
  done: number;
  total: number;
  remaining: number;
  endsOn: string;
  endsLabel: string;
  /** Calendar days from today to ends_on (0 = ends today). Never "working days". */
  daysLeft: number;
  state: 'on_track' | 'needs_push' | 'awaiting_verification';
  stateLabel: string;
  /** The math behind the state, e.g. "70% done · 78% of the window elapsed". */
  stateDetail: string;
  /** Other live goals not shown here. */
  moreCount: number;
};

export type Receipt = { label: string; value: string; source: string };

export type OwnerRecommendation = {
  id:
    | 'no_data'
    | 'closeout_gap'
    | 'disruptions_elevated'
    | 'collections_posting'
    | 'collections_behind'
    | 'goal_rescope'
    | 'all_clear';
  text: string;
  receipts: Receipt[];
  action: { label: string; to: string } | null;
};

/* ------------------------------ formatting ----------------------------- */

export function money(cents: number): string {
  return `$${Math.round(Math.abs(cents) / 100).toLocaleString('en-US')}`;
}

function pct(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** "Friday's closeout" within the last week; a dated label beyond that. */
export function closeoutDayLabel(date: string, today: string): string {
  const gap = daysBetween(date, today);
  if (gap <= 0) return "Today's closeout";
  if (gap === 1) return "Yesterday's closeout";
  if (gap <= 6) {
    const [y, m, d] = date.split('-').map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', {
      weekday: 'long',
      timeZone: 'UTC',
    });
    return `${weekday}'s closeout`;
  }
  return `Closeout from ${formatDate(date)}`;
}

/** "2 hygiene cancellations · 1 doctor no-show" — only nonzero parts. */
export function missedBreakdown(d: {
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
}): string {
  const parts: string[] = [];
  const add = (n: number, label: string) => {
    if (n > 0) parts.push(`${n} ${label}${n === 1 ? '' : 's'}`);
  };
  add(d.hygieneCancellations, 'hygiene cancellation');
  add(d.hygieneNoShows, 'hygiene no-show');
  add(d.doctorCancellations, 'doctor cancellation');
  add(d.doctorNoShows, 'doctor no-show');
  return parts.join(' · ');
}

function missedCount(d: DayVitals): number {
  return d.hygieneCancellations + d.hygieneNoShows + d.doctorCancellations + d.doctorNoShows;
}

/* ----------------------------- daily brief ----------------------------- */

/** Facts for one closed-out day. Production may be unrecorded on a real row. */
function dayFacts(day: DayVitals): PulseFact[] {
  const missed = missedCount(day);
  return [
    {
      id: 'production',
      label: 'Production',
      value: day.productionCents !== null ? money(day.productionCents) : '—',
      detail: day.productionCents !== null ? undefined : 'Not recorded in this closeout',
      tone: 'steady',
      href: '/deposit-log',
    },
    {
      id: 'collected',
      label: 'Collected',
      value: money(day.collectedCents),
      tone: 'steady',
      href: '/deposit-log',
    },
    {
      id: 'missed',
      label: 'Missed appointments',
      value: String(missed),
      detail: missed > 0 ? missedBreakdown(day) : 'None recorded — clean schedule day',
      tone: missed > 0 ? 'attention' : 'calm',
      href: '/deposit-log',
    },
  ];
}

/**
 * The TODAY block of the pulse: today's closeout when it exists, otherwise the
 * most recent one, honestly labeled. Never renders $0 for a missing day.
 */
export function buildDailyBrief(input: OwnerPulseInput): DailyBrief {
  const { today, todayVitals, latest, officePhase } = input;

  if (todayVitals) {
    return {
      scope: 'today',
      dayLabel: "Today's closeout",
      dayDate: today,
      note: null,
      facts: dayFacts(todayVitals),
    };
  }

  const workingPhases: OfficePhase[] = ['before_open', 'open', 'unknown_hours'];
  const note = workingPhases.includes(officePhase)
    ? "Today's figures appear after the day is closed out."
    : officePhase === 'after_close'
      ? "Today's closeout has not been entered yet."
      : null;

  if (latest) {
    return {
      scope: 'previous',
      dayLabel: closeoutDayLabel(latest.date, today),
      dayDate: latest.date,
      note: note ?? 'Showing the most recent closed-out day.',
      facts: dayFacts(latest),
    };
  }

  return {
    scope: 'none',
    dayLabel: 'No closeouts recorded yet',
    dayDate: null,
    note: 'The pulse appears once the deposit log has a day closed out.',
    facts: [],
  };
}

/* --------------------------- collections pace -------------------------- */

/** Within ±2% of the full monthly goal counts as "on pace". */
const ON_PACE_BAND = 0.02;

/**
 * Month collections vs the org-configured goal, paced by month elapsed.
 * Null when no goal is configured or nothing is logged this month — a fake
 * "0% of goal" is worse than saying nothing.
 */
export function collectionsPace(input: OwnerPulseInput): CollectionsPace | null {
  const { thisMonth, targetCents, pacedTargetCents } = input;
  if (targetCents <= 0 || thisMonth.days === 0) return null;
  const diff = thisMonth.collectedCents - pacedTargetCents;
  const status: CollectionsPace['status'] =
    Math.abs(diff) <= targetCents * ON_PACE_BAND ? 'on_pace' : diff > 0 ? 'ahead' : 'behind';
  return {
    collectedCents: thisMonth.collectedCents,
    targetCents,
    pacedTargetCents,
    diffCents: diff,
    pctOfTarget: thisMonth.collectedCents / targetCents,
    status,
  };
}

/** The hero's one month-level fact. Honest when the goal is not configured. */
export function monthCollectionsFact(input: OwnerPulseInput): PulseFact | null {
  const pace = collectionsPace(input);
  if (pace) {
    const paceLabel =
      pace.status === 'on_pace'
        ? 'on pace'
        : `${money(pace.diffCents)} ${pace.status === 'ahead' ? 'ahead of' : 'behind'} pace`;
    return {
      id: 'month-collections',
      label: 'Collections this month',
      value: money(pace.collectedCents),
      detail: `${pct(pace.pctOfTarget)} of the ${money(pace.targetCents)} goal · ${paceLabel}`,
      tone: pace.status === 'behind' ? 'attention' : 'steady',
      href: '/reports',
    };
  }
  if (input.thisMonth.days > 0) {
    return {
      id: 'month-collections',
      label: 'Collections this month',
      value: money(input.thisMonth.collectedCents),
      detail: 'No monthly collections goal is set.',
      tone: 'calm',
      href: '/settings',
    };
  }
  return null;
}

/* -------------------------- missed appointments ------------------------ */

/** Same tolerance the Practice Pulse orb uses: a quarter above usual. */
const DISRUPTION_TOLERANCE = 1.25;
/** A trend claim needs at least this many closed-out days on each side. */
const TREND_MIN_DAYS = 5;

export function missedMonth(input: OwnerPulseInput): MissedMonth {
  const { thisMonth, prevMonth, monthElapsed } = input;
  const total = thisMonth.disruptions;

  let trend: MissedMonth['trend'] = null;
  let trendLabel: string | null = null;
  let baseline: number | null = null;

  const canCompare =
    prevMonth !== null &&
    prevMonth.days >= TREND_MIN_DAYS &&
    thisMonth.days >= TREND_MIN_DAYS &&
    prevMonth.disruptions > 0 &&
    monthElapsed > 0;

  if (canCompare) {
    baseline = prevMonth.disruptions * monthElapsed;
    if (total > baseline * DISRUPTION_TOLERANCE) {
      trend = 'above_pace';
      trendLabel = `Running above recent pace (~${Math.round(baseline)} expected by now)`;
    } else if (total < baseline * 0.75) {
      trend = 'improving';
      trendLabel = `Improving vs last month (~${Math.round(baseline)} expected by now)`;
    } else {
      trend = 'steady';
      trendLabel = 'Tracking close to last month';
    }
  }

  return {
    total,
    hygieneCancellations: thisMonth.hygieneCancellations,
    hygieneNoShows: thisMonth.hygieneNoShows,
    doctorCancellations: thisMonth.doctorCancellations,
    doctorNoShows: thisMonth.doctorNoShows,
    trend,
    trendLabel,
    baseline,
  };
}

/* --------------------------- month in progress -------------------------- */

export type MonthDetail = {
  /** "August" — which month the facts describe. */
  monthLabel: string;
  /** Closed-out days backing every figure below. */
  daysLogged: number;
  /** Month-to-date production, factual. Purple Envelope has no production target. */
  productionLabel: string;
  /**
   * Comparison against the previous month's recorded pace — only when the
   * prior month has enough days to make the math meaningful. Never a target.
   */
  productionCompare: string | null;
  /** Month-to-date missed appointments with breakdown and a grounded trend. */
  missed: MissedMonth;
  /** Up to six months of recorded history for the compact trend. */
  trend: { month: string; productionCents: number; disruptions: number }[];
};

/** Prior-month production comparison needs at least this many recorded days. */
const COMPARE_MIN_DAYS = 5;

export function buildMonthDetail(
  input: OwnerPulseInput,
  months: { month: string; productionCents: number; disruptions: number }[],
): MonthDetail | null {
  if (input.thisMonth.days === 0) return null;
  const [y, m] = input.today.split('-').map(Number);
  const prodBaseline =
    input.prevMonth && input.prevMonth.days >= COMPARE_MIN_DAYS && input.prevMonth.productionCents > 0
      ? input.prevMonth.productionCents * input.monthElapsed
      : null;
  return {
    monthLabel: new Date(Date.UTC(y, m - 1, 1, 12)).toLocaleDateString('en-US', {
      month: 'long',
      timeZone: 'UTC',
    }),
    daysLogged: input.thisMonth.days,
    productionLabel: money(input.thisMonth.productionCents),
    productionCompare: prodBaseline
      ? `Last month had reached about ${money(prodBaseline)} by this point`
      : null,
    missed: missedMonth(input),
    trend: months.slice(-6).map(mo => ({
      month: mo.month,
      productionCents: mo.productionCents,
      disruptions: mo.disruptions,
    })),
  };
}

/* -------------------------------- goals -------------------------------- */

/**
 * The one office goal the hero shows, chosen deterministically: a sprint
 * awaiting verification first (it is blocked on a human), then the active
 * sprint ending soonest. "On track" is progress share ≥ time share of the goal
 * window — the math is exposed, never a vibe.
 */
export function buildGoalBrief(goals: GoalLike[], today: string): GoalBrief | null {
  const live = goals.filter(g => g.status === 'active' || g.status === 'pending_verification');
  if (live.length === 0) return null;

  const pending = live.filter(g => g.status === 'pending_verification');
  const active = live
    .filter(g => g.status === 'active')
    .sort((a, b) => a.ends_on.localeCompare(b.ends_on));
  const pick = pending[0] ?? active[0];

  const done = Math.min(pick.progress, pick.target_count);
  const total = pick.target_count;
  const daysLeft = Math.max(0, daysBetween(today, pick.ends_on));

  const windowDays = Math.max(1, daysBetween(pick.starts_on, pick.ends_on) + 1);
  const elapsedDays = Math.min(windowDays, Math.max(0, daysBetween(pick.starts_on, today) + 1));
  const timeShare = elapsedDays / windowDays;
  const progressShare = total > 0 ? done / total : 0;

  let state: GoalBrief['state'];
  let stateLabel: string;
  if (pick.status === 'pending_verification') {
    state = 'awaiting_verification';
    stateLabel = 'Awaiting verification';
  } else if (progressShare >= timeShare) {
    state = 'on_track';
    stateLabel = 'On track';
  } else {
    state = 'needs_push';
    stateLabel = 'Needs a push';
  }

  return {
    id: pick.id,
    title: pick.title,
    done,
    total,
    remaining: Math.max(0, total - done),
    endsOn: pick.ends_on,
    endsLabel: formatDate(pick.ends_on),
    daysLeft,
    state,
    stateLabel,
    stateDetail: `${pct(progressShare)} done · ${pct(timeShare)} of the window elapsed`,
    moreCount: live.length - 1,
  };
}

/* ---------------------------- recommendation ---------------------------- */

/** True when a goal reads like a cancellation / no-show / schedule sprint. */
function isScheduleGoal(g: GoalLike): boolean {
  return /cancel|no.?show|missed|schedule/i.test(`${g.title} ${g.metric}`);
}

/**
 * One grounded suggestion, or a grounded "nothing to suggest". Signals are
 * checked in a fixed priority order; the first one that fires wins. Every
 * branch carries receipts naming the recorded numbers behind it.
 */
export function ownerRecommendation(
  input: OwnerPulseInput,
  goals: GoalLike[],
): OwnerRecommendation {
  const { today, latest, thisMonth, prevMonth, monthElapsed, targetCents, pacedTargetCents } =
    input;

  // 0 — nothing recorded at all: say so instead of judging an empty office.
  if (latest === null && thisMonth.days === 0 && prevMonth === null) {
    return {
      id: 'no_data',
      text:
        'There is not enough recorded office data to offer anything useful yet. ' +
        'Once the deposit log has closed-out days, the pulse starts reading them.',
      receipts: [
        { label: 'Closeouts on record', value: '0', source: 'deposit_logs, last 12 months' },
      ],
      action: { label: 'Open the deposit log', to: '/deposit-log' },
    };
  }

  // 1 — the log itself has gone quiet. Missing data is a data problem, not a
  // performance problem, so it outranks every performance signal.
  if (latest !== null) {
    const gap = daysBetween(latest.date, today);
    if (gap >= 4) {
      return {
        id: 'closeout_gap',
        text:
          `No day has been closed out since ${formatDate(latest.date)}. ` +
          'The pulse can only be as current as the deposit log — worth entering the missing days before reading this month as a performance story.',
        receipts: [
          { label: 'Last closeout', value: formatDate(latest.date), source: 'deposit_logs, most recent row' },
          { label: 'Days since', value: String(gap), source: 'calendar days, Eastern' },
        ],
        action: { label: 'Open the deposit log', to: '/deposit-log' },
      };
    }
  }

  // 2 — schedule disruption above its recorded pace.
  const missed = missedMonth(input);
  if (missed.trend === 'above_pace' && missed.baseline !== null) {
    const scheduleGoal = goals.find(g => g.status === 'active' && isScheduleGoal(g));
    const lever = scheduleGoal
      ? `Your "${scheduleGoal.title}" sprint may be the best lever to focus on this week.`
      : 'If you want a lever, the Sprint Builder can scope a cancellation goal around it.';
    return {
      id: 'disruptions_elevated',
      text: `Missed appointments are running above their recent pace. ${lever}`,
      receipts: [
        {
          label: 'Missed this month',
          value: String(missed.total),
          source: `deposit_logs, ${thisMonth.days} closed-out days`,
        },
        {
          label: 'Usual by this point',
          value: `~${Math.round(missed.baseline)}`,
          source: `${prevMonth!.disruptions} last month × ${pct(monthElapsed)} elapsed; flagged above 125%`,
        },
      ],
      action: { label: 'Open goals', to: '/goals' },
    };
  }

  // 3 — collections behind pace while production holds up: check posting
  // before treating it as performance. Both halves must be verifiable.
  const pace = collectionsPace(input);
  if (pace && pace.status === 'behind' && prevMonth && prevMonth.productionCents > 0) {
    const prodBaseline = prevMonth.productionCents * monthElapsed;
    if (thisMonth.productionCents >= prodBaseline * 0.95) {
      return {
        id: 'collections_posting',
        text:
          'Collections are behind pace while production remains healthy. It may be worth checking that recent payments are fully posted before treating this as a performance problem.',
        receipts: [
          {
            label: 'Collected vs paced goal',
            value: `${money(pace.collectedCents)} vs ${money(pace.pacedTargetCents)}`,
            source: `deposit_logs vs ${money(targetCents)} goal × ${pct(monthElapsed)} elapsed`,
          },
          {
            label: 'Production month to date',
            value: money(thisMonth.productionCents),
            source: `at or above last month's pace (~${money(prodBaseline)} by now)`,
          },
        ],
        action: { label: 'Open the deposit log', to: '/deposit-log' },
      };
    }
  }

  // 4 — collections behind pace, no healthier signal to soften it. Factual.
  if (pace && pace.status === 'behind') {
    return {
      id: 'collections_behind',
      text: `Collections are running ${money(pace.diffCents)} behind the paced monthly goal with ${thisMonth.days} day${thisMonth.days === 1 ? '' : 's'} closed out. Reports has the day-by-day detail.`,
      receipts: [
        {
          label: 'Collected vs paced goal',
          value: `${money(pace.collectedCents)} vs ${money(pace.pacedTargetCents)}`,
          source: `deposit_logs vs ${money(targetCents)} goal × ${pct(monthElapsed)} elapsed`,
        },
      ],
      action: { label: 'Open reports', to: '/reports' },
    };
  }

  // 5 — a goal that is about to run out of runway.
  const goal = buildGoalBrief(goals, today);
  if (goal && goal.state === 'needs_push' && goal.daysLeft <= 3 && goal.remaining > 0) {
    return {
      id: 'goal_rescope',
      text: `"${goal.title}" has ${goal.remaining} to go with ${goal.daysLeft} day${goal.daysLeft === 1 ? '' : 's'} left. Consider rescoping the next step so the sprint ends with a real result.`,
      receipts: [
        { label: 'Progress', value: `${goal.done} / ${goal.total}`, source: 'team_goals progress tally' },
        { label: 'Ends', value: goal.endsLabel, source: 'team_goals ends_on' },
      ],
      action: { label: 'Open goals', to: '/goals' },
    };
  }

  // Nothing fired — say so, with the checks that passed as the receipt.
  const clearReceipts: Receipt[] = [];
  if (pace) {
    clearReceipts.push({
      label: 'Collections pace',
      value: pace.status === 'ahead' ? 'Ahead' : 'On pace',
      source: `${money(pace.collectedCents)} vs ${money(pace.pacedTargetCents)} paced goal`,
    });
  }
  if (missed.trend !== null) {
    clearReceipts.push({
      label: 'Missed appointments',
      value: missed.trend === 'improving' ? 'Improving' : 'Near usual pace',
      source: `${missed.total} this month vs ~${Math.round(missed.baseline ?? 0)} expected by now`,
    });
  }
  if (latest) {
    clearReceipts.push({
      label: 'Closeouts',
      value: 'Current',
      source: `last closed out ${formatDate(latest.date)}`,
    });
  }
  return {
    id: 'all_clear',
    text: 'Nothing is materially off track today. No intervention suggested.',
    receipts: clearReceipts,
    action: null,
  };
}

/* --------------------------- summary sentence --------------------------- */

/**
 * The 20-second briefing, built only from facts the system holds. Reads like a
 * competent practice manager, never like a scoreboard.
 */
export function dailySummary(
  input: OwnerPulseInput,
  brief: DailyBrief,
  decisionCount: number,
): string {
  const attention =
    decisionCount > 0
      ? `${decisionCount} owner decision${decisionCount === 1 ? '' : 's'} waiting`
      : null;

  if (brief.scope === 'none') {
    const tail = attention ? ` Operationally, ${attention.toLowerCase()}.` : '';
    return `No office days have been closed out yet, so there is no pulse to read.${tail}`;
  }

  const day = input.todayVitals ?? input.latest!;
  const missed = missedCount(day);
  const pace = collectionsPace(input);

  const paceClause =
    pace === null
      ? null
      : pace.status === 'ahead'
        ? `collections are ${money(pace.diffCents)} ahead of monthly pace`
        : pace.status === 'behind'
          ? `collections are ${money(pace.diffCents)} behind monthly pace`
          : 'collections are on monthly pace';

  const missedClause =
    missed === 0
      ? 'the schedule held with no missed appointments'
      : `${missedBreakdown(day)} ${missed === 1 ? 'is' : 'are'} the main thing worth watching`;

  const prodClause =
    day.productionCents !== null ? `Production was ${money(day.productionCents)}` : null;

  const dayName =
    brief.scope === 'today'
      ? 'Today'
      : brief.dayLabel.replace(/'s closeout$/, '').replace(/^Closeout from /, '');

  let opener: string;
  if (missed >= 3) {
    // A financial verdict is only claimed when the pace math exists to back it.
    opener =
      pace !== null && pace.status !== 'behind'
        ? `${dayName} was a solid financial day with a rough schedule.`
        : `${dayName} was a rough schedule day.`;
  } else if (missed === 0 && pace?.status === 'ahead') {
    opener = `${dayName} was a strong day.`;
  } else {
    opener = `${dayName} was steady.`;
  }

  const clauses = [prodClause, paceClause, missedClause].filter(Boolean) as string[];
  let sentence = `${opener} ${clauses.join(', ')}.`;
  // First clause already starts the sentence; make sure it reads as one line.
  sentence = sentence.replace(/\.\s*$/, '.');

  if (brief.scope === 'previous') {
    const prefix =
      brief.note === "Today's closeout has not been entered yet."
        ? "Today's closeout isn't in yet — this is the last closed day. "
        : '';
    sentence = `${prefix}${sentence}`;
  }
  if (attention) sentence += ` ${attention[0].toUpperCase()}${attention.slice(1)}.`;
  return sentence;
}
