import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type ReminderLogRow = {
  id: string;
  run_date: string;
  run_hour: number;
  item_id: string | null;
  item_title: string | null;
  owner_user_id: string | null;
  due_date: string | null;
  days_left: number | null;
  outcome: string;
  reason: string | null;
  channel: string | null;
  created_at: string;
};

/**
 * Recent reminder scheduling history. RLS keeps people to their own rows and
 * lets owners/managers see the whole practice.
 */
export function useReminderLog(days = 14) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['goal-reminder-log', user?.id, days],
    enabled: !!user,
    queryFn: async (): Promise<ReminderLogRow[]> => {
      const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
      const { data, error } = await supabase
        .from('goal_reminder_log')
        .select(
          'id, run_date, run_hour, item_id, item_title, owner_user_id, due_date, days_left, outcome, reason, channel, created_at',
        )
        .gte('run_date', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as ReminderLogRow[];
    },
  });
}
