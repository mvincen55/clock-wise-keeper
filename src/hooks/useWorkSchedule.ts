import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type WorkScheduleRow = {
  id: string;
  user_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  enabled: boolean;
  grace_minutes: number;
  threshold_minutes: number;
  apply_to_remote: boolean;
  created_at: string;
  updated_at: string;
};

const DEFAULT_SCHEDULE: Omit<WorkScheduleRow, 'id' | 'user_id' | 'created_at' | 'updated_at'>[] = [
  { weekday: 0, start_time: '08:00', end_time: '17:00', enabled: false, grace_minutes: 0, threshold_minutes: 1, apply_to_remote: false },
  { weekday: 1, start_time: '08:20', end_time: '17:00', enabled: true, grace_minutes: 0, threshold_minutes: 1, apply_to_remote: false },
  { weekday: 2, start_time: '09:50', end_time: '16:00', enabled: true, grace_minutes: 0, threshold_minutes: 1, apply_to_remote: false },
  { weekday: 3, start_time: '09:50', end_time: '19:00', enabled: true, grace_minutes: 0, threshold_minutes: 1, apply_to_remote: false },
  { weekday: 4, start_time: '08:00', end_time: '17:00', enabled: false, grace_minutes: 0, threshold_minutes: 1, apply_to_remote: false },
  { weekday: 5, start_time: '08:20', end_time: '17:00', enabled: true, grace_minutes: 0, threshold_minutes: 1, apply_to_remote: false },
  { weekday: 6, start_time: '08:00', end_time: '17:00', enabled: false, grace_minutes: 0, threshold_minutes: 1, apply_to_remote: false },
];

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export { WEEKDAY_NAMES };

export function useWorkSchedule() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['work-schedule'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('work_schedule')
        .select('*')
        .order('weekday');
      return (data || []) as WorkScheduleRow[];
    },
  });
}

export function useInitSchedule() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');
      const rows = DEFAULT_SCHEDULE.map(s => ({ ...s, user_id: user.id }));
      const { error } = await supabase.from('work_schedule').upsert(rows, { onConflict: 'user_id,weekday' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-schedule'] }),
  });
}

export function useUpdateScheduleDay() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<WorkScheduleRow> }) => {
      const { error } = await supabase.from('work_schedule').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['work-schedule'] }),
  });
}

export function getScheduleForWeekday(schedule: WorkScheduleRow[], date: string): WorkScheduleRow | null {
  const d = new Date(date + 'T00:00:00');
  const weekday = d.getDay();
  return schedule.find(s => s.weekday === weekday) || null;
}
