import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type DayOffRow = {
  id: string;
  user_id: string | null;
  date_start: string;
  date_end: string;
  type: 'scheduled_with_notice' | 'unscheduled' | 'office_closed' | 'medical_leave' | 'other';
  hours: number | null;
  notes: string | null;
  created_at: string;
};

export function useDaysOff(year?: number) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['days-off', ctx?.org_id, ctx?.employee_id, year],
    enabled: !!user && !!ctx?.employee_id,
    queryFn: async () => {
      let q = supabase.from('days_off').select('*').eq('org_id', ctx!.org_id).eq('employee_id', ctx!.employee_id).order('date_start', { ascending: false });
      if (year) {
        q = q.gte('date_end', `${year}-01-01`).lte('date_start', `${year}-12-31`);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as DayOffRow[];
    },
  });
}

export function useAddDayOff() {
  const { user } = useAuth();
  const { data: ctx, isLoading: ctxLoading } = useOrgContext();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: {
      date_start: string; date_end: string;
      type: 'scheduled_with_notice' | 'unscheduled' | 'office_closed' | 'medical_leave' | 'other';
      hours?: number; notes?: string;
      /** Whose day off this is (admin flows). Defaults to the caller's own record. */
      target?: { user_id: string | null; employee_id: string };
    }) => {
      if (!user) throw new Error('Not authenticated — please log in');
      if (!ctx) throw new Error('Organization not found — make sure you have an org set up');
      const { target, ...fields } = input;
      const { error } = await supabase.from('days_off').insert({
        user_id: target?.user_id ?? user.id,
        org_id: ctx.org_id,
        employee_id: target?.employee_id ?? ctx.employee_id,
        created_by: user.id,
        ...fields,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['days-off'] });
      qc.invalidateQueries({ queryKey: ['employee-days-off'] });
      qc.invalidateQueries({ queryKey: ['employee-attendance'] });
      qc.invalidateQueries({ queryKey: ['org-attendance-summary'] });
    },
  });

  return { ...mutation, isReady: !!user && !!ctx && !ctxLoading };
}

export function useUpdateDayOffHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, hours }: { id: string; hours: number }) => {
      const { error } = await supabase.from('days_off').update({ hours }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['days-off'] });
      qc.invalidateQueries({ queryKey: ['employee-days-off'] });
      qc.invalidateQueries({ queryKey: ['employee-attendance'] });
      qc.invalidateQueries({ queryKey: ['org-attendance-summary'] });
    },
  });
}

export function useDeleteDayOff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('days_off').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['days-off'] });
      qc.invalidateQueries({ queryKey: ['employee-days-off'] });
      qc.invalidateQueries({ queryKey: ['employee-attendance'] });
      qc.invalidateQueries({ queryKey: ['org-attendance-summary'] });
    },
  });
}
