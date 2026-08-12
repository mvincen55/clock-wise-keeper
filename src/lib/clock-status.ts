import type { PunchRow } from '@/hooks/useTimeEntries';

/**
 * Punch semantics, in one place.
 *
 * `punch_type` ('in'/'out') is the mechanical direction the hours math pairs
 * on. `punch_kind` is what the member SAID they were doing — and the two must
 * never be conflated: leaving for lunch and leaving for the day both write an
 * 'out' punch, but only `shift_end` means "done for the day", and only
 * `shift_end` runs the end-of-day checklist enforcement.
 *
 * A kind is recorded at the moment of the member's explicit choice. It is
 * never inferred from the time of day, the schedule, hours worked, or how
 * many punches exist — guessed intent makes bad accountability data. The one
 * structural derivation allowed: the first 'in' of a day is `clock_in`,
 * any later 'in' is `break_end` (a return), because that is a fact of the
 * punch sequence, not a guess about intent.
 *
 * `punch_kind = null` means "no stated intent": rows from before kinds
 * existed, spreadsheet imports, GPS auto-punches, and manual corrections.
 * Enforcement never fires on an unknown kind.
 */

export type ClockActionKind = 'clock_in' | 'break_start' | 'break_end' | 'shift_end';

export type ClockStatus = 'clocked_out' | 'clocked_in' | 'on_break';

/** The mechanical direction each semantic action writes. */
export function punchTypeForAction(action: ClockActionKind): 'in' | 'out' {
  return action === 'clock_in' || action === 'break_end' ? 'in' : 'out';
}

/**
 * Which semantic action an "in" tap means: first punch of the day is the
 * clock-in; any later one is a return. Structural, never time-based.
 */
export function clockInActionFor(punches: Pick<PunchRow, 'punch_type'>[]): ClockActionKind {
  return punches.length === 0 ? 'clock_in' : 'break_end';
}

/**
 * The rule this whole module exists for: only an explicit end-of-shift with
 * open required items is interrupted by the checklist dialog. Breaks never
 * are, no matter how much is open — the checklist stops work leaving
 * unresolved for the DAY, it does not stand between anyone and their lunch.
 */
export function shouldInterceptForChecklist(
  action: ClockActionKind,
  incompleteCount: number,
): boolean {
  return action === 'shift_end' && incompleteCount > 0;
}

export function getClockStatus(
  punches: Pick<PunchRow, 'punch_type' | 'punch_kind'>[],
): ClockStatus {
  if (!punches.length) return 'clocked_out';
  const last = punches[punches.length - 1];
  if (last.punch_type !== 'out') return 'clocked_in';
  // An unknown-kind 'out' (legacy, GPS, import) stays plain "clocked out" —
  // we never guess whether someone is coming back.
  return last.punch_kind === 'break_start' ? 'on_break' : 'clocked_out';
}

/**
 * When the member finally left for the day, or null if they haven't (or we
 * can't know). A `break_start` is never a departure. An unknown-kind 'out'
 * counts only while it is the last word of the day — the pre-kinds behavior.
 */
export function finalClockOutAt(
  punches: Pick<PunchRow, 'punch_type' | 'punch_kind' | 'punch_time'>[],
): string | null {
  if (!punches.length) return null;
  const last = punches[punches.length - 1];
  if (last.punch_type !== 'out' || last.punch_kind === 'break_start') return null;
  return last.punch_time;
}

/**
 * Display word for a punch. The break words are the ones that matter — an
 * unknown kind falls back to the mechanical in/out rather than guessing.
 */
export function punchLabel(p: Pick<PunchRow, 'punch_type' | 'punch_kind'>): string {
  switch (p.punch_kind) {
    case 'break_start':
      return 'break';
    case 'break_end':
      return 'back';
    default:
      return p.punch_type;
  }
}

export function getRunningMinutes(punches: PunchRow[]): number {
  let total = 0;
  const sorted = [...punches].sort(
    (a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime()
  );
  for (let i = 0; i < sorted.length; i += 2) {
    const inP = sorted[i];
    const outP = sorted[i + 1];
    if (inP?.punch_type === 'in') {
      const end = outP?.punch_type === 'out' ? new Date(outP.punch_time).getTime() : Date.now();
      total += (end - new Date(inP.punch_time).getTime()) / 60000;
    }
  }
  return Math.round(total);
}
