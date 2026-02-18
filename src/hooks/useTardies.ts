import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type TardyRow = {
  id: string;
  user_id: string;
  time_entry_id: string | null;
  entry_date: string;
  expected_start_time: string;
  actual_start_time: string;
  minutes_late: number;
  reason_text: string | null;
  approval_status: 'unreviewed' | 'approved' | 'unapproved';
  approved_by: string | null;
  approved_at: string | null;
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

export function useUpsertTardy() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      time_entry_id?: string; entry_date: string; expected_start_time: string;
      actual_start_time: string; minutes_late: number; reason_text?: string; resolved?: boolean;
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('tardies').upsert(
        { user_id: user.id, org_id: ctx.org_id, employee_id: ctx.employee_id, ...input },
        { onConflict: 'user_id,entry_date' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tardies'] }),
  });
}

export function useUpdateTardy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, updates }: {
      id: string;
      updates: Partial<Pick<TardyRow, 'reason_text' | 'approval_status' | 'approved_by' | 'approved_at' | 'resolved'>>;
    }) => {
      const { error } = await supabase.from('tardies').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tardies'] }),
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
