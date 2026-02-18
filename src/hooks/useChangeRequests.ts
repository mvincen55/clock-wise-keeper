import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type ChangeRequestRow = {
  id: string;
  org_id: string;
  employee_id: string;
  requested_by: string;
  request_type: 'punch_edit' | 'day_off' | 'schedule_change' | 'other';
  payload: Record<string, any>;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_reason: string | null;
  created_at: string;
  updated_at: string;
};

/** Employee: fetch own change requests */
export function useMyChangeRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['change-requests', 'mine'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('change_requests')
        .select('*')
        .eq('requested_by', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as ChangeRequestRow[];
    },
  });
}

/** Manager: fetch all pending requests for the org */
export function useOrgChangeRequests(status?: string) {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['change-requests', 'org', ctx?.org_id, status],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      let q = supabase
        .from('change_requests')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('created_at', { ascending: false });
      if (status && status !== 'all') {
        q = q.eq('status', status as 'pending' | 'approved' | 'denied');
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as ChangeRequestRow[];
    },
  });
}

/** Employee: submit a new change request */
export function useSubmitChangeRequest() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      request_type: ChangeRequestRow['request_type'];
      payload: Record<string, any>;
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('change_requests').insert({
        org_id: ctx.org_id,
        employee_id: ctx.employee_id,
        requested_by: user.id,
        request_type: params.request_type,
        payload: params.payload as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['change-requests'] });
    },
  });
}

/** Manager: review (approve/deny) a change request */
export function useReviewChangeRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      status: 'approved' | 'denied';
      review_reason: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('change_requests')
        .update({
          status: params.status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          review_reason: params.review_reason,
        })
        .eq('id', params.id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['change-requests'] });
    },
  });
}
