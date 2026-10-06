import { daysBetween, easternDateKey, getToday } from '@/lib/time-utils';

/**
 * A goal's window, as pure functions over the goal row.
 *
 * A goal is the person's goal until they complete it or change it. It is not
 * bound to the calendar month it was set in, and a target date is optional:
 * with one, the plan can be judged against the calendar; without one there
 * is no calendar to trail. Shared by the Goals page, Home, and the tests.
 */

export type GoalWindowRow = {
  status: string;
  /** The month the goal was set (YYYY-MM). History only. */
  month: string;
  due_on: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

/** How long a finished goal stays on the page, so the next team meeting still sees it. */
export const COMPLETED_GOAL_GRACE_DAYS = 30;

/** The Eastern calendar day a goal was set. */
export function goalStartDate(goal: Pick<GoalWindowRow, 'created_at' | 'month'>): string {
  return goal.created_at ? easternDateKey(goal.created_at) : `${goal.month}-01`;
}

/** The Eastern calendar day a completed goal was closed out, when known. */
export function goalCompletedDate(
  goal: Pick<GoalWindowRow, 'completed_at' | 'updated_at'>
): string | null {
  const at = goal.completed_at ?? goal.updated_at;
  return at ? easternDateKey(at) : null;
}

/**
 * A goal is current while it is active, and for a month after it was
 * completed so the next meeting can still hear about it. Archived goals are
 * never current: letting one go always means setting the next.
 */
export function isCurrentGoal(
  goal: Pick<GoalWindowRow, 'status' | 'completed_at' | 'updated_at'>,
  today: string = getToday()
): boolean {
  if (goal.status === 'active') return true;
  if (goal.status !== 'completed') return false;
  const done = goalCompletedDate(goal);
  return !done || daysBetween(done, today) <= COMPLETED_GOAL_GRACE_DAYS;
}

/**
 * The goal a person is on right now: their active goal, else the one they
 * finished most recently (while it is still current). Team cards and the
 * report both read this, so nobody is shown two goals at once.
 */
export function currentGoalFor<
  T extends Pick<GoalWindowRow, 'status' | 'completed_at' | 'updated_at' | 'created_at'> & {
    user_id: string;
    visibility: string;
  },
>(goals: T[], userId: string, visibility?: string, today: string = getToday()): T | undefined {
  const mine = goals.filter(
    g =>
      g.user_id === userId &&
      g.status !== 'archived' &&
      (!visibility || g.visibility === visibility) &&
      isCurrentGoal(g, today)
  );
  const active = mine
    .filter(g => g.status === 'active')
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  if (active[0]) return active[0];
  return mine
    .filter(g => g.status === 'completed')
    .sort((a, b) =>
      (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at)
    )[0];
}

/**
 * Fraction (0–1) of a goal's window that has elapsed, from the day it was set
 * to its target date. A goal with no target date has no calendar to trail, so
 * it is never "behind": 0.
 */
export function goalElapsedFraction(
  goal: Pick<GoalWindowRow, 'created_at' | 'month' | 'due_on'>,
  today: string = getToday()
): number {
  if (!goal.due_on) return 0;
  const start = goalStartDate(goal);
  const total = daysBetween(start, goal.due_on);
  if (total <= 0) return today >= goal.due_on ? 1 : 0;
  return Math.min(1, Math.max(0, daysBetween(start, today) / total));
}
