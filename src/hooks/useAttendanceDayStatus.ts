import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type AttendanceDayStatusRow = {
  id: string;
  user_id: string;
  entry_date: string;
  schedule_expected_start: string | null;
  schedule_expected_end: string | null;
  is_scheduled_day: boolean;
  office_closed: boolean;
  has_punches: boolean;
  is_remote: boolean;
  is_absent: boolean;
  is_incomplete: boolean;
  is_late: boolean;
  minutes_late: number;
  tardy_approval_status: string;
  has_edits: boolean;
  has_day_comment: boolean;
  has_day_off: boolean;
  timezone_suspect: boolean;
  computed_at: string;
};

export function useAttendanceDayStatus(startDate?: string, endDate?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['attendance-day-status', startDate, endDate],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('attendance_day_status')
        .select('*')
        .order('entry_date', { ascending: false });
      if (startDate) q = q.gte('entry_date', startDate);
      if (endDate) q = q.lte('entry_date', endDate);
      const { data } = await q;
      return (data || []) as AttendanceDayStatusRow[];
    },
  });
}

/**
 * Call the server-side recompute function via RPC.
 * Triggers handle auto-recompute, but this can be called manually for bulk recompute.
 */
export function useRecomputeAttendance() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: string; endDate: string }) => {
      if (!user) throw new Error('Not authenticated');
      const { data, error } = await supabase.rpc('recompute_attendance_range', {
        p_user_id: user.id,
        p_start_date: startDate,
        p_end_date: endDate,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-day-status'] });
    },
  });
}
