import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { currentMonth, monthLabel } from '@/hooks/useGoals';

/**
 * A read-only look back at my own goals: how many I finished, how many of my
 * steps got done, and whether I kept checking in. Counts only what the system
 * recorded — no self-reported scores, no ranking against anyone else.
 */

export type GoalMonthStat = {
  month: string;
  label: string;
  /** Short label for chart axes, e.g. "Mar". */
  short: string;
  goals: number;
  goalsCompleted: number;
  tasks: number;
  tasksDone: number;
  updates: number;
  /** Steps done / steps planned, 0-100. Null when nothing was planned. */
  taskRate: number | null;
};

export type GoalAnalytics = {
  months: GoalMonthStat[];
  totalGoals: number;
  goalsCompleted: number;
  /** Finished goals / goals that are no longer active, 0-100. */
  completionRate: number | null;
  totalTasks: number;
  tasksDone: number;
  taskRate: number | null;
  /** Consecutive most recent months with at least one check-in. */
  checkInStreak: number;
  bestCheckInStreak: number;
  /** Plain-English read on the last three months vs the three before. */
  trend: 'up' | 'steady' | 'down' | 'new';
  trendNote: string;
};

const MONTHS_BACK = 6;

/** Month keys oldest -> newest, ending with the current month. */
function recentMonths(count: number): string[] {
  const [y, m] = currentMonth().split('-').map(Number);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

function shortLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

export function useGoalAnalytics() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['goal-analytics', ctx?.org_id, user?.id],
    enabled: !!user && !!ctx,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<GoalAnalytics> => {
      const months = recentMonths(MONTHS_BACK);
      const earliest = months[0];

      const { data: goals, error } = await supabase
        .from('goals')
        .select('id, month, status')
        .eq('org_id', ctx!.org_id)
        .eq('user_id', user!.id)
        .gte('month', earliest);
      if (error) throw error;

      const goalIds = (goals ?? []).map(g => g.id);
      const monthOf = new Map((goals ?? []).map(g => [g.id, g.month]));

      let tasks: { goal_id: string; done: boolean }[] = [];
      let updates: { goal_id: string }[] = [];
      if (goalIds.length > 0) {
        const [taskRes, updateRes] = await Promise.all([
          supabase.from('goal_tasks').select('goal_id, done').in('goal_id', goalIds),
          supabase.from('goal_updates').select('goal_id').in('goal_id', goalIds),
        ]);
        if (taskRes.error) throw taskRes.error;
        if (updateRes.error) throw updateRes.error;
        tasks = taskRes.data ?? [];
        updates = updateRes.data ?? [];
      }

      const stats: GoalMonthStat[] = months.map(month => {
        const monthGoals = (goals ?? []).filter(g => g.month === month);
        const ids = new Set(monthGoals.map(g => g.id));
        const monthTasks = tasks.filter(t => ids.has(t.goal_id));
        const tasksDone = monthTasks.filter(t => t.done).length;
        return {
          month,
          label: monthLabel(month),
          short: shortLabel(month),
          goals: monthGoals.length,
          goalsCompleted: monthGoals.filter(g => g.status === 'completed').length,
          tasks: monthTasks.length,
          tasksDone,
          updates: updates.filter(u => ids.has(u.goal_id)).length,
          taskRate: monthTasks.length ? Math.round((tasksDone / monthTasks.length) * 100) : null,
        };
      });

      const totalGoals = goals?.length ?? 0;
      const goalsCompleted = (goals ?? []).filter(g => g.status === 'completed').length;
      // Active goals are still in flight, so they don't count against the rate.
      const settled = (goals ?? []).filter(g => g.status !== 'active').length;
      const totalTasks = tasks.length;
      const tasksDone = tasks.filter(t => t.done).length;

      // Check-in streak: consecutive most recent months that carried an update.
      const withUpdates = stats.map(s => s.updates > 0);
      let checkInStreak = 0;
      for (let i = withUpdates.length - 1; i >= 0; i--) {
        // The current month is only counted once it actually has a check-in.
        if (withUpdates[i]) checkInStreak += 1;
        else break;
      }
      let best = 0;
      let run = 0;
      for (const hit of withUpdates) {
        run = hit ? run + 1 : 0;
        if (run > best) best = run;
      }

      const rated = stats.filter(s => s.taskRate !== null);
      const recent = average(rated.slice(-3).map(s => s.taskRate!));
      const prior = average(rated.slice(0, -3).map(s => s.taskRate!));

      let trend: GoalAnalytics['trend'] = 'new';
      let trendNote = 'Not enough history yet — a couple of months will make the pattern clear.';
      if (recent !== null && prior !== null) {
        const delta = Math.round(recent - prior);
        if (delta >= 8) {
          trend = 'up';
          trendNote = `You're finishing ${delta} points more of your steps lately than you were earlier this stretch.`;
        } else if (delta <= -8) {
          trend = 'down';
          trendNote = `Step follow-through is down ${Math.abs(delta)} points from earlier. Often that means the goals got bigger than the month.`;
        } else {
          trend = 'steady';
          trendNote = 'Your follow-through has held steady across these months.';
        }
      } else if (recent !== null) {
        trend = 'steady';
        trendNote = `So far you've finished ${Math.round(recent)}% of the steps you set.`;
      }

      return {
        months: stats,
        totalGoals,
        goalsCompleted,
        completionRate: settled ? Math.round((goalsCompleted / settled) * 100) : null,
        totalTasks,
        tasksDone,
        taskRate: totalTasks ? Math.round((tasksDone / totalTasks) * 100) : null,
        checkInStreak,
        bestCheckInStreak: best,
        trend,
        trendNote,
      };
    },
  });
}
