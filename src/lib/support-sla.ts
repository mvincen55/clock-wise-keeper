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

/** The senior agent gets a tighter clock — it only runs on real problems. */
const SENIOR_MINUTES = 2 * 60;

export type SlaState = {
  /** Nothing left to wait for. */
  done: boolean;
  /** When an answer is expected by. */
  dueAt: Date | null;
  minutesLeft: number;
  overdue: boolean;
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
  const closed = t.status === 'resolved' || t.status === 'closed';
  if (closed) {
    const at = t.resolved_at ? new Date(t.resolved_at) : null;
    return {
      done: true,
      dueAt: null,
      minutesLeft: 0,
      overdue: false,
      label: at ? `Solved ${stampEastern(at)}` : 'Solved',
    };
  }

  const escalated = t.status === 'escalated' || t.tier === 'senior';
  const from = new Date(escalated && t.escalated_at ? t.escalated_at : t.created_at);
  const target = escalated
    ? SENIOR_MINUTES
    : (TARGET_MINUTES[String(t.severity ?? 'medium')] ?? TARGET_MINUTES.medium);

  const dueAt = new Date(from.getTime() + target * 60_000);
  const minutesLeft = Math.round((dueAt.getTime() - now.getTime()) / 60_000);
  const overdue = minutesLeft < 0;

  return {
    done: false,
    dueAt,
    minutesLeft,
    overdue,
    label: overdue
      ? `Overdue by ${fmt(minutesLeft)}`
      : `Reply expected within ${fmt(minutesLeft)} · by ${stampEastern(dueAt)}`,
  };
}
