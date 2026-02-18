import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type DayOffRow = {
  id: string;
  user_id: string;
  date_start: string;
  date_end: string;
  type: 'scheduled_with_notice' | 'unscheduled' | 'office_closed' | 'medical_leave' | 'other';
  hours: number | null;
  notes: string | null;
  created_at: string;
};

export function useDaysOff(year?: number) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['days-off', year],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('days_off').select('*').order('date_start', { ascending: false });
      if (year) {
        q = q.gte('date_start', `${year}-01-01`).lte('date_start', `${year}-12-31`);
      }
      const { data } = await q;
      return (data || []) as DayOffRow[];
    },
  });
}

export function useAddDayOff() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      date_start: string; date_end: string;
      type: 'scheduled_with_notice' | 'unscheduled' | 'office_closed' | 'medical_leave' | 'other';
      hours?: number; notes?: string;
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('days_off').insert({
        user_id: user.id,
        org_id: ctx.org_id,
        employee_id: ctx.employee_id,
        created_by: user.id,
        ...input,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['days-off'] }),
  });
}

export function useDeleteDayOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('days_off').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['days-off'] }),
  });
}
