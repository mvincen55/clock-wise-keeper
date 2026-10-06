import type { Goal, GoalTask } from '@/hooks/useGoals';
import { goalStartDate, isCurrentGoal } from './goal-window';

export type PersonalGoalSummary = {
  id: string;
  userId: string;
  name: string;
  title: string;
  target: string | null;
  done: number;
  total: number;
  completed: boolean;
  private: boolean;
  /** The day the goal was set. */
  startedOn: string;
  /** The member's optional target date; null means it runs until it is done. */
  dueOn: string | null;
};
export type ChosenGoals = {
  viewerId: string;
  state: 'loading' | 'error' | 'ok';
  people: { userId: string; name: string }[];
  goals: PersonalGoalSummary[];
};

/**
 * The goals people are on right now: active ones, plus those finished in the
 * last month. Never month-scoped — a goal stays until it is done or changed.
 * Never infer numeric achievement from the SMART text or a self-reported update.
 */
export function chosenGoalsFrom(args: {
  orgId: string;
  viewerId: string;
  viewerName: string;
  admin: boolean;
  today: string;
  state: ChosenGoals['state'];
  goals: Goal[];
  tasks: GoalTask[];
  people: { user_id: string; display_name: string }[];
}): ChosenGoals {
  const people = args.admin
    ? args.people.map(p => ({ userId: p.user_id, name: p.display_name }))
    : [{ userId: args.viewerId, name: args.viewerName }];
  const visible = args.goals.filter(g => g.org_id === args.orgId && isCurrentGoal(g, args.today) && (args.admin || g.user_id === args.viewerId));
  for (const goal of visible) {
    if (!people.some(p => p.userId === goal.user_id)) people.push({ userId: goal.user_id, name: goal.user_id === args.viewerId ? args.viewerName : 'Team member' });
  }
  return {
    viewerId: args.viewerId, state: args.state,
    people: people.sort((a, b) => a.name.localeCompare(b.name)),
    goals: visible.map(goal => {
      const tasks = args.tasks.filter(t => t.org_id === args.orgId && t.goal_id === goal.id);
      return {
        id: goal.id, userId: goal.user_id, name: people.find(p => p.userId === goal.user_id)?.name ?? 'Team member',
        title: goal.title, target: goal.smart_target, done: tasks.filter(t => t.done).length,
        total: tasks.length, completed: goal.status === 'completed', private: goal.visibility === 'private',
        startedOn: goalStartDate(goal), dueOn: goal.due_on,
      };
    }),
  };
}
