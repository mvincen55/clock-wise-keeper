import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { createNotification } from '@/hooks/useNotifications';

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
      const { data: created, error } = await supabase
        .from('change_requests')
        .insert({
          org_id: ctx.org_id,
          employee_id: ctx.employee_id,
          requested_by: user.id,
          request_type: params.request_type,
          payload: params.payload as any,
        })
        .select('id')
        .single();
      if (error) throw error;

      // Notify managers about the new request, pointing at the exact row.
      const { data: managers } = await supabase
        .from('org_members')
        .select('user_id')
        .eq('org_id', ctx.org_id)
        .in('role', ['owner', 'manager'])
        .eq('status', 'active');

      const { data: emp } = await supabase
        .from('employees')
        .select('display_name')
        .eq('id', ctx.employee_id)
        .single();

      const typeLabel = params.request_type.replace(/_/g, ' ');
      for (const m of managers ?? []) {
        if (m.user_id === user.id) continue;
        await createNotification({
          org_id: ctx.org_id,
          recipient_user_id: m.user_id,
          actor_user_id: user.id,
          notification_type: 'change_request_new',
          title: 'New Change Request',
          message: `${emp?.display_name || 'An employee'} submitted a ${typeLabel} request`,
          related_table: 'change_requests',
          related_id: created.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['change-requests'] });
    },
  });
}

/** Manager: review (approve/deny) a change request */
export function useReviewChangeRequest() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
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

      // Notify the employee who submitted the request
      const { data: req } = await supabase
        .from('change_requests')
        .select('requested_by, org_id, request_type')
        .eq('id', params.id)
        .single();

      if (req && req.requested_by !== user.id) {
        await createNotification({
          org_id: req.org_id,
          recipient_user_id: req.requested_by,
          actor_user_id: user.id,
          notification_type: params.status === 'approved' ? 'change_request_approved' : 'change_request_denied',
          title: params.status === 'approved' ? 'Change Request Approved' : 'Change Request Denied',
          message: params.status === 'approved'
            ? `Your change request has been approved`
            : `Your change request has been denied: ${params.review_reason}`,
          related_table: 'change_requests',
          related_id: params.id,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['change-requests'] });
      qc.invalidateQueries({ queryKey: ['approval-counts'] });
    },
  });
}
