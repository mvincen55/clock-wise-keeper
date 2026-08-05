import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export type InviteScheduleDay = {
  weekday: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
};

export type PendingInvite = {
  id: string;
  email: string;
  role: 'employee' | 'manager';
  token: string;
  invited_name: string | null;
  operational_role: string | null;
  expires_at: string;
  created_at: string;
  start_date: string | null;
  initial_pto_hours: number | null;
  weekly_schedule: InviteScheduleDay[];
};

export function usePendingInvites() {
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: ['pending-invites', ctx?.org_id],
    enabled: !!ctx?.org_id && isAdmin,
    queryFn: async (): Promise<PendingInvite[]> => {
      const { data, error } = await supabase
        .from('org_invites')
        .select('id, email, role, token, invited_name, operational_role, expires_at, created_at, start_date, initial_pto_hours, weekly_schedule')
        .eq('org_id', ctx!.org_id)
        .is('accepted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []).map((row: any) => ({
        ...row,
        initial_pto_hours: row.initial_pto_hours === null ? null : Number(row.initial_pto_hours),
        weekly_schedule: Array.isArray(row.weekly_schedule) ? row.weekly_schedule : [],
      }));
    },
  });
}

export function useRevokeInvite() {
  const qc = useQueryClient();
  const { data: ctx } = useOrgContext();

  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from('org_invites').delete().eq('id', inviteId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pending-invites', ctx?.org_id] }),
  });
}
