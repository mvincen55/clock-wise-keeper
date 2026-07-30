/**
 * How long a problem report should wait before someone hears back.
 *
 * The everyday agent answers in seconds, so these targets are really about the
 * human follow-up: how long is too long for this report to be sitting there.
 * Nothing here is punitive — it just says plainly when a report is past due.
 */

export type SlaTicket = {
  status?: string | null;
  tier?: string | null;
  severity?: string | null;
  category?: string | null;
  created_at: string;
  escalated_at?: string | null;
  resolved_at?: string | null;
  /** When the analyst first replied, if it has. */
  first_answer_at?: string | null;
};

/** Target reply window in minutes, by how bad the person said it is. */
const TARGET_MINUTES: Record<string, number> = {
  critical: 60,
  high: 4 * 60,
  medium: 24 * 60,
  low: 48 * 60,
};

/**
 * Some things can't wait as long, whatever the person clicked. Anything that
 * touches pay, records or getting into the app gets a tighter clock; cosmetic
 * things get a little more room.
 */
const CATEGORY_FACTOR: Record<string, number> = {
  payroll: 0.5,
  time_clock: 0.5,
  access: 0.5,
  timesheet: 0.75,
  pto: 1,
  schedule: 1,
  other: 1,
  display: 1.5,
};

/** The senior agent gets a tighter clock — it only runs on real problems. */
const SENIOR_MINUTES = 2 * 60;

export type SlaState = {
  /** Nothing left to wait for. */
  done: boolean;
  /** When an answer is expected by. */
  dueAt: Date | null;
  minutesLeft: number;
  overdue: boolean;
  /** The full promised window, in minutes. */
  targetMinutes: number;
  /** "within 2 hrs" — the promise, independent of the clock. */
  windowLabel: string;
  /** Live countdown, e.g. "1:42:09" or "3 hrs 12 min". */
  countdown: string;
  /** One short line for the UI. */
  label: string;
};

function fmt(minutes: number): string {
  const m = Math.max(1, Math.round(Math.abs(minutes)));
  if (m < 60) return `${m} min`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr${h === 1 ? '' : 's'}`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'}`;
}

/** Ticking form: seconds while it's close, plain words when it's far off. */
function countdownFor(msLeft: number): string {
  const ms = Math.abs(msLeft);
  if (ms < 60 * 60_000) {
    const total = Math.floor(ms / 1000);
    const m = Math.floor(total / 60);
    const s = total % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }
  if (ms < 24 * 60 * 60_000) {
    const total = Math.floor(ms / 60_000);
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${h} hr${h === 1 ? '' : 's'} ${m} min`;
  }
  return fmt(ms / 60_000);
}

/** How long this kind of report is promised, in minutes. */
export function targetMinutesFor(
  severity?: string | null,
  category?: string | null,
  escalated = false,
): number {
  if (escalated) return SENIOR_MINUTES;
  const base = TARGET_MINUTES[String(severity ?? 'medium')] ?? TARGET_MINUTES.medium;
  const factor = CATEGORY_FACTOR[String(category ?? 'other')] ?? 1;
  return Math.max(30, Math.round(base * factor));
}

/** The promise on its own — usable before a report is even sent. */
export function responseWindowLabel(severity?: string | null, category?: string | null): string {
  return `within ${fmt(targetMinutesFor(severity, category))}`;
}


function stampEastern(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** Where a report stands against its reply target, right now. */
export function slaFor(t: SlaTicket, now: Date = new Date()): SlaState {
  const escalated = t.status === 'escalated' || t.tier === 'senior';
  const target = targetMinutesFor(t.severity, t.category, escalated);
  const windowLabel = escalated
    ? `within ${fmt(target)} (senior)`
    : responseWindowLabel(t.severity, t.category);

  const closed = t.status === 'resolved' || t.status === 'closed';
  if (closed) {
    const at = t.resolved_at ? new Date(t.resolved_at) : null;
    return {
      done: true,
      dueAt: null,
      minutesLeft: 0,
      overdue: false,
      targetMinutes: target,
      windowLabel,
      countdown: '',
      label: at ? `Solved ${stampEastern(at)}` : 'Solved',
    };
  }

  const from = new Date(escalated && t.escalated_at ? t.escalated_at : t.created_at);
  const dueAt = new Date(from.getTime() + target * 60_000);
  const msLeft = dueAt.getTime() - now.getTime();
  const minutesLeft = Math.round(msLeft / 60_000);
  const overdue = msLeft < 0;
  const countdown = countdownFor(msLeft);

  return {
    done: false,
    dueAt,
    minutesLeft,
    overdue,
    targetMinutes: target,
    windowLabel,
    countdown,
    label: overdue
      ? `Overdue by ${countdown} · target was ${windowLabel}`
      : `Reply ${windowLabel} · ${countdown} left · by ${stampEastern(dueAt)}`,
  };

}
