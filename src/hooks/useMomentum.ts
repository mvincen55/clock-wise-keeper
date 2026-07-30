import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';

/**
 * Motivational momentum, computed ONLY from verified system records:
 * checklist completions, attendance rows, goal updates, goal completions.
 * Nothing here can be influenced by self-reported text.
 *
 * Streaks PAUSE (never break) on approved days off, PTO, office closures,
 * and non-scheduled days.
 */

export type StreakDay = {
  date: string;
  state: 'complete' | 'paused' | 'missed' | 'pending';
};

export type Badge = {
  id: string;
  label: string;
  detail: string;
  earned: boolean;
};

export type Momentum = {
  streak: number;
  bestStreak: number;
  days: StreakDay[]; // oldest -> newest, last 14 days
  pausedToday: boolean;
  dailyItemCount: number;
  sharedBeforeMeeting: number;
  goalsCompleted: number;
  latestGoalTitle: string | null;
  badges: Badge[];
  /** Training momentum — forward framing only, never comparison. */
  modulesThisMonth: number;
  bestModuleMonth: number;
  /** Deposit close-out streak, for whoever runs the deposit log. */
  depositStreak: number;
  depositBestStreak: number;
  runsDepositLog: boolean;
};

function shiftDate(date: string, delta: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d, 12));
  t.setUTCDate(t.getUTCDate() + delta);
  return t.toISOString().slice(0, 10);
}

const WINDOW_DAYS = 90;

export function useMomentum() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['momentum', ctx?.org_id, user?.id],
    enabled: !!user && !!ctx,
    staleTime: 60 * 1000,
    queryFn: async (): Promise<Momentum> => {
      const today = getToday();
      const start = shiftDate(today, -WINDOW_DAYS);

      const [
        itemsRes,
        completionsRes,
        attendanceRes,
        meetingsRes,
        updatesRes,
        goalsRes,
        attemptsRes,
        depositsRes,
      ] = await Promise.all([
          supabase
            .from('checklist_items')
            .select('id, per_person, cadence, is_active')
            .eq('org_id', ctx!.org_id)
            .eq('cadence', 'daily')
            .eq('per_person', true)
            .eq('is_active', true),
          supabase
            .from('checklist_completions')
            .select('item_id, period_key, completed_by')
            .eq('completed_by', user!.id)
            .gte('period_key', start)
            .lte('period_key', today),
          supabase
            .from('attendance_day_status')
            .select('entry_date, is_scheduled_day, office_closed, has_day_off, has_punches')
            .eq('user_id', user!.id)
            .gte('entry_date', start)
            .lte('entry_date', today),
          supabase
            .from('office_events')
            .select('event_date, start_time, category')
            .eq('org_id', ctx!.org_id)
            .eq('category', 'team_meeting')
            .gte('event_date', start)
            .lte('event_date', today),
          supabase
            .from('goal_updates')
            .select('created_at')
            .eq('author_id', user!.id)
            .gte('created_at', `${start}T00:00:00Z`),
          supabase
            .from('goals')
            .select('title, status, updated_at')
            .eq('user_id', user!.id)
            .is('archived_at', null),
          supabase
            .from('training_attempts')
            .select('module_id, passed, completed_at')
            .eq('user_id', user!.id)
            .eq('passed', true),
          supabase
            .from('deposit_logs')
            .select('deposit_date, prepared_by')
            .eq('prepared_by', user!.id)
            .gte('deposit_date', start)
            .lte('deposit_date', today),
        ]);

      const dailyItems = itemsRes.data ?? [];
      const dailyItemIds = new Set(dailyItems.map((i) => i.id));
      const doneByDate = new Map<string, Set<string>>();
      for (const c of completionsRes.data ?? []) {
        if (!dailyItemIds.has(c.item_id)) continue;
        const set = doneByDate.get(c.period_key) ?? new Set<string>();
        set.add(c.item_id);
        doneByDate.set(c.period_key, set);
      }

      const attendance = new Map(
        (attendanceRes.data ?? []).map((a) => [a.entry_date, a])
      );

      const dayState = (date: string): StreakDay['state'] => {
        const a = attendance.get(date);
        // Pause: earned time off, office closed, or simply not a work day.
        if (a && (a.office_closed || a.has_day_off || !a.is_scheduled_day)) return 'paused';
        if (!a && !doneByDate.get(date)?.size) return 'paused';
        if (dailyItems.length === 0) return 'paused';
        const done = doneByDate.get(date)?.size ?? 0;
        if (done >= dailyItems.length) return 'complete';
        return date === today ? 'pending' : 'missed';
      };

      // Current streak: walk back from today; pauses/pending are skipped.
      let streak = 0;
      for (let i = 0; i < WINDOW_DAYS; i++) {
        const date = shiftDate(today, -i);
        const s = dayState(date);
        if (s === 'complete') streak++;
        else if (s === 'paused' || (i === 0 && s === 'pending')) continue;
        else break;
      }

      // Best streak in the window, same pause rules.
      let best = 0;
      let run = 0;
      for (let i = WINDOW_DAYS; i >= 0; i--) {
        const s = dayState(shiftDate(today, -i));
        if (s === 'complete') {
          run++;
          best = Math.max(best, run);
        } else if (s === 'paused' || s === 'pending') {
          continue;
        } else {
          run = 0;
        }
      }
      best = Math.max(best, streak);

      const days: StreakDay[] = [];
      for (let i = 13; i >= 0; i--) {
        const date = shiftDate(today, -i);
        days.push({ date, state: dayState(date) });
      }

      // "Shared before the meeting": a goal update posted before the meeting
      // started (or before meeting day, when no time is set).
      const updates = (updatesRes.data ?? []).map((u) => new Date(u.created_at).getTime());
      let sharedBeforeMeeting = 0;
      for (const m of meetingsRes.data ?? []) {
        const cutoff = new Date(
          `${m.event_date}T${(m.start_time ?? '09:00:00').slice(0, 8)}-05:00`
        ).getTime();
        const windowStart = cutoff - 7 * 24 * 3600 * 1000;
        if (updates.some((u) => u > windowStart && u <= cutoff)) sharedBeforeMeeting++;
      }

      const goals = goalsRes.data ?? [];
      const completed = goals.filter((g) => g.status === 'completed');
      const latest = [...completed].sort((a, b) =>
        (b.updated_at ?? '').localeCompare(a.updated_at ?? '')
      )[0];

      const badges: Badge[] = [
        {
          id: 'streak-5',
          label: '5-day rhythm',
          detail: 'Five checklist days in a row',
          earned: best >= 5,
        },
        {
          id: 'streak-20',
          label: '20-day rhythm',
          detail: 'Twenty checklist days in a row',
          earned: best >= 20,
        },
        {
          id: 'shared-before-meeting',
          label: 'Shared before the meeting',
          detail: sharedBeforeMeeting
            ? `${sharedBeforeMeeting} update${sharedBeforeMeeting === 1 ? '' : 's'} posted ahead of a team meeting`
            : 'Post a goal update before the next team meeting',
          earned: sharedBeforeMeeting > 0,
        },
        {
          id: 'module-passed',
          label: 'Module passed',
          detail: 'Pass a module quiz or roleplay',
          earned: (attemptsRes.data ?? []).length > 0,
        },
        {
          id: 'goal-complete',
          label: 'Goal completed',
          detail: latest ? latest.title : 'Finish a goal to unlock',
          earned: completed.length > 0,
        },
      ];

      // ---- Training momentum: modules passed per calendar month.
      // Verified from training_attempts (quiz/roleplay passes) — one credit
      // per module per month, never self-reported.
      const perMonth = new Map<string, Set<string>>();
      for (const a of attemptsRes.data ?? []) {
        const key = (a.completed_at ?? '').slice(0, 7);
        if (!key) continue;
        const set = perMonth.get(key) ?? new Set<string>();
        set.add(a.module_id);
        perMonth.set(key, set);
      }
      const thisMonthKey = today.slice(0, 7);
      const modulesThisMonth = perMonth.get(thisMonthKey)?.size ?? 0;
      const bestModuleMonth = Math.max(
        0,
        ...[...perMonth.values()].map((s) => s.size)
      );

      // ---- Deposit close-out streak: consecutive business days with a
      // deposit log this person closed out. Paused days (closures, time off,
      // non-scheduled days) are skipped, never counted as a break.
      const depositDates = new Set((depositsRes.data ?? []).map((d) => d.deposit_date));
      const runsDepositLog = depositDates.size > 0;
      const isBusinessDay = (date: string) => {
        const [y, m, d] = date.split('-').map(Number);
        const wd = new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay();
        return wd !== 0 && wd !== 6;
      };
      const depositState = (date: string): 'complete' | 'paused' | 'missed' => {
        const a = attendance.get(date);
        if (!isBusinessDay(date)) return 'paused';
        if (a && (a.office_closed || a.has_day_off || !a.is_scheduled_day)) return 'paused';
        if (depositDates.has(date)) return 'complete';
        return 'missed';
      };
      let depositStreak = 0;
      for (let i = 0; i < WINDOW_DAYS; i++) {
        const date = shiftDate(today, -i);
        const s = depositState(date);
        if (s === 'complete') depositStreak++;
        else if (s === 'paused' || (i === 0 && !depositDates.has(date))) continue;
        else break;
      }
      let depositBest = 0;
      let depositRun = 0;
      for (let i = WINDOW_DAYS; i >= 0; i--) {
        const s = depositState(shiftDate(today, -i));
        if (s === 'complete') {
          depositRun++;
          depositBest = Math.max(depositBest, depositRun);
        } else if (s === 'paused') {
          continue;
        } else {
          depositRun = 0;
        }
      }
      depositBest = Math.max(depositBest, depositStreak);

      const todayState = dayState(today);

      return {
        modulesThisMonth,
        bestModuleMonth,
        depositStreak,
        depositBestStreak: depositBest,
        runsDepositLog,
        streak,
        bestStreak: best,
        days,
        pausedToday: todayState === 'paused',
        dailyItemCount: dailyItems.length,
        sharedBeforeMeeting,
        goalsCompleted: completed.length,
        latestGoalTitle: latest?.title ?? null,
        badges,
      };
    },
  });
}
