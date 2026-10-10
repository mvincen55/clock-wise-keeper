import { shiftDate } from '@/lib/time-utils';

/**
 * Picking a goal by talking it through. The conversation lives on the client
 * until a goal exists (there is no row to hang it on yet), so these are the
 * pure rules for what Pathfinder is sent and what comes back.
 */

export type FinderTurn = { author: 'member' | 'pathfinder'; content: string };

export type GoalCandidate = {
  /** One first-person sentence, the member's own framing kept where possible. */
  title: string;
  /** A number, count or clear done-state. */
  target: string;
  /** One sentence on why it fits what the member said. */
  why: string;
  /** A realistic timeframe, or null when Pathfinder gave none. */
  weeks: number | null;
};

/** Pathfinder's opening line — static, so picking a goal starts without a round trip. */
export const FINDER_OPENER =
  "What are you looking at? A number that's bugging you, something you keep putting off, something you'd like to get better at. Say it in your own words and I'll suggest a few goals that fit — you pick.";

export const FINDER_MAX_TURNS = 12;
export const FINDER_MAX_CHARS = 1500;

/** The transcript Pathfinder reads: the latest turns, each capped, blanks dropped. */
export function boundTranscript(
  turns: FinderTurn[],
  maxTurns = FINDER_MAX_TURNS,
  maxChars = FINDER_MAX_CHARS
): FinderTurn[] {
  return turns
    .map(t => ({
      author: t.author === 'pathfinder' ? ('pathfinder' as const) : ('member' as const),
      content: (t.content ?? '').trim().slice(0, maxChars),
    }))
    .filter(t => t.content !== '')
    .slice(-maxTurns);
}

/** The real exchange, without the static opener — what is worth keeping with the goal. */
export function exchangeOnly(turns: FinderTurn[]): FinderTurn[] {
  const kept = turns.filter(t => !(t.author === 'pathfinder' && t.content === FINDER_OPENER));
  return kept.some(t => t.author === 'member') ? kept : [];
}

const text = (value: unknown, cap: number): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, cap) : '';

/** Reads candidates out of a Pathfinder reply defensively: at most three, titled, bounded. */
export function parseCandidates(raw: unknown): GoalCandidate[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => {
      const row = (item ?? {}) as Record<string, unknown>;
      const weeks = Number(row.weeks);
      return {
        title: text(row.title, 160),
        target: text(row.target, 60),
        why: text(row.why, 220),
        weeks: Number.isInteger(weeks) && weeks >= 1 && weeks <= 26 ? weeks : null,
      };
    })
    .filter(c => c.title !== '')
    .slice(0, 3);
}

/** The target date a candidate's timeframe implies, or null when it gave none. */
export function candidateDueOn(candidate: Pick<GoalCandidate, 'weeks'>, today: string): string | null {
  return candidate.weeks ? shiftDate(today, candidate.weeks * 7) : null;
}

/** What the form gets when a candidate is picked. Everything stays editable. */
export function candidateToForm(
  candidate: GoalCandidate,
  today: string
): { title: string; target: string; dueOn: string } {
  return {
    title: candidate.title,
    target: candidate.target,
    dueOn: candidateDueOn(candidate, today) ?? '',
  };
}
