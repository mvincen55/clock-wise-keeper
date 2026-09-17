import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type TardyRow = {
  id: string;
  user_id: string;
  org_id: string;
  /** Whose tardy this is — admins read the whole office's rows. */
  employee_id: string;
  time_entry_id: string | null;
  entry_date: string;
  expected_start_time: string;
  actual_start_time: string;
  minutes_late: number;
  reason_text: string | null;
  /** Unapproved until a manager excuses it — the office policy. */
  approval_status: 'approved' | 'unapproved';
  approved_by: string | null;
  approved_at: string | null;
  /** Stamped by every manager decision; null means nobody has decided. */
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolved: boolean;
  timezone_suspect: boolean;
  created_at: string;
  updated_at: string;
};

export function useTardies(startDate?: string, endDate?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['tardies', startDate, endDate],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('tardies').select('*').order('entry_date', { ascending: false });
      if (startDate) q = q.gte('entry_date', startDate);
      if (endDate) q = q.lte('entry_date', endDate);
      const { data } = await q;
      return (data || []) as TardyRow[];
    },
  });
}

export function useDeleteTardy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('tardies').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tardies'] }),
  });
}
