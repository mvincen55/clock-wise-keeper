// Streak maths for My Momentum, pulled out of the query so it can be tested.
//
// The one rule that matters: streaks PAUSE, never break, on verified time off —
// approved days off, approved PTO, office closures, and non-scheduled days.
// Only a scheduled working day with unfinished checklist items breaks a streak.

export type StreakDay = {
  date: string;
  state: 'complete' | 'paused' | 'missed' | 'pending';
};

export type AttendanceFacts = {
  is_scheduled_day: boolean;
  office_closed: boolean;
  has_day_off: boolean;
};

export type StreakInput = {
  today: string;
  /** Attendance row per date, if one exists. */
  attendance: Map<string, AttendanceFacts>;
  /** Dates covered by approved PTO — verified records only. */
  ptoDates: Set<string>;
  /** Dates the office was closed — verified records only. */
  closureDates: Set<string>;
  /** How many daily per-person checklist items exist right now. */
  dailyItemCount: number;
  /** Distinct daily items completed, keyed by date. */
  doneByDate: Map<string, number>;
};

export function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}

/** What a single day counts as. */
export function dayState(date: string, input: StreakInput): StreakDay['state'] {
  const { today, attendance, ptoDates, closureDates, dailyItemCount, doneByDate } = input;
  const done = doneByDate.get(date) ?? 0;

  // Verified time off pauses the day outright — even if attendance is silent.
  if (ptoDates.has(date) || closureDates.has(date)) return 'paused';

  const a = attendance.get(date);
  if (a && (a.office_closed || a.has_day_off || !a.is_scheduled_day)) return 'paused';

  // No attendance row and nothing done: not a work day we can judge.
  if (!a && done === 0) return 'paused';

  // Nothing to complete means nothing to miss.
  if (dailyItemCount === 0) return 'paused';

  if (done >= dailyItemCount) return 'complete';
  return date === today ? 'pending' : 'missed';
}

const WINDOW_DAYS = 90;

/** Current streak, walking back from today. Paused days are stepped over. */
export function currentStreak(input: StreakInput, windowDays = WINDOW_DAYS): number {
  let streak = 0;
  for (let i = 0; i < windowDays; i++) {
    const state = dayState(shiftDate(input.today, -i), input);
    if (state === 'complete') streak++;
    else if (state === 'paused' || (i === 0 && state === 'pending')) continue;
    else break;
  }
  return streak;
}

/** Longest streak in the window, same pause rules. */
export function bestStreak(input: StreakInput, windowDays = WINDOW_DAYS): number {
  let best = 0;
  let run = 0;
  for (let i = windowDays; i >= 0; i--) {
    const state = dayState(shiftDate(input.today, -i), input);
    if (state === 'complete') {
      run++;
      best = Math.max(best, run);
    } else if (state === 'paused' || state === 'pending') {
      continue;
    } else {
      run = 0;
    }
  }
  return Math.max(best, currentStreak(input, windowDays));
}

/** The last `count` days, oldest first — the dot strip. */
export function recentDays(input: StreakInput, count = 14): StreakDay[] {
  const days: StreakDay[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const date = shiftDate(input.today, -i);
    days.push({ date, state: dayState(date, input) });
  }
  return days;
}

/** Every date from start to end inclusive — used to expand PTO ranges. */
export function expandDateRange(start: string, end: string): string[] {
  const dates: string[] = [];
  let cursor = start;
  for (let i = 0; i < 400 && cursor <= end; i++) {
    dates.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return dates;
}
