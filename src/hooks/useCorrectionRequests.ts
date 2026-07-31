import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { createNotification } from '@/hooks/useNotifications';

export type CorrectionRequestRow = {
  id: string;
  org_id: string;
  employee_id: string;
  created_by: string;
  target_table: string;
  target_id: string;
  proposed_change: Record<string, any>;
  reason: string;
  status: 'pending' | 'approved' | 'denied' | 'applied';
  reviewed_by: string | null;
  reviewed_at: string | null;
  resolution_note: string | null;
  created_at: string;
};

/** Employee: fetch own correction requests */
export function useMyCorrectionRequests() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['correction-requests', 'mine'],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('correction_requests')
        .select('*')
        .eq('created_by', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as CorrectionRequestRow[];
    },
  });
}

/** Manager: fetch correction requests for the org */
export function useOrgCorrectionRequests(status?: string) {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['correction-requests', 'org', ctx?.org_id, status],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      let q = supabase
        .from('correction_requests')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('created_at', { ascending: false });
      if (status && status !== 'all') {
        q = q.eq('status', status as 'pending' | 'approved' | 'denied' | 'applied');
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as CorrectionRequestRow[];
    },
  });
}

/** Employee: submit a correction request */
export function useSubmitCorrectionRequest() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    retry: 2,
    mutationFn: async (params: {
      target_table: string;
      target_id: string;
      proposed_change: Record<string, any>;
      reason: string;
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      if (!params.reason.trim()) throw new Error('Reason is required');

      // Check for duplicate pending request
      const { data: existing } = await supabase
        .from('correction_requests')
        .select('id')
        .eq('target_id', params.target_id)
        .eq('created_by', user.id)
        .eq('status', 'pending')
        .maybeSingle();
      if (existing) throw new Error('You already have a pending request for this item');
      
      const { error } = await supabase.from('correction_requests').insert({
        org_id: ctx.org_id,
        employee_id: ctx.employee_id,
        created_by: user.id,
        target_table: params.target_table,
        target_id: params.target_id,
        proposed_change: params.proposed_change as any,
        reason: params.reason.trim(),
      });
      if (error) throw error;

      // Notify managers about the new correction request
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

      if (managers) {
        for (const m of managers) {
          if (m.user_id === user.id) continue;
          await createNotification({
            org_id: ctx.org_id,
            recipient_user_id: m.user_id,
            actor_user_id: user.id,
            notification_type: 'correction_request_new',
            title: 'New Correction Request',
            message: `${emp?.display_name || 'An employee'} submitted a correction request: ${params.reason.trim()}`,
            related_table: 'correction_requests',
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['correction-requests'] });
    },
  });
}

/** Manager: review a correction request (approve/deny) */
export function useReviewCorrectionRequest() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      id: string;
      status: 'approved' | 'denied';
      resolution_note: string;
    }) => {
      if (!user) throw new Error('Not authenticated');
      if (params.status === 'denied' && params.resolution_note.trim().length < 10) {
        throw new Error('Denial reason must be at least 10 characters');
      }

      const updateStatus = params.status === 'approved' ? 'applied' : params.status;
      
      const { error } = await supabase
        .from('correction_requests')
        .update({
          status: updateStatus,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          resolution_note: params.resolution_note.trim(),
        })
        .eq('id', params.id);
      if (error) throw error;

      // Fetch the request to get details for audit and apply changes
      const { data: req } = await supabase
        .from('correction_requests')
        .select('*')
        .eq('id', params.id)
        .single();

      if (req) {
        // Apply the proposed change to the target record when approved
        if (params.status === 'approved' && req.target_table === 'pto_requests') {
          const proposed = req.proposed_change as Record<string, any>;
          if (proposed.action === 'cancel') {
            await supabase
              .from('pto_requests')
              .update({ status: 'cancelled' })
              .eq('id', req.target_id);
          } else if (proposed.action === 'correct') {
            const updates: Record<string, any> = {};
            if (proposed.start_date) updates.start_date = proposed.start_date;
            if (proposed.end_date) updates.end_date = proposed.end_date;
            if (proposed.hours_requested !== undefined) updates.hours_requested = proposed.hours_requested;
            if (proposed.pto_type) updates.pto_type = proposed.pto_type;
            if (Object.keys(updates).length > 0) {
              await supabase
                .from('pto_requests')
                .update(updates as never)
                .eq('id', req.target_id);
            }
          }
        }

        await supabase.from('audit_events').insert({
          org_id: req.org_id,
          employee_id: req.employee_id,
          user_id: req.created_by,
          actor_id: user.id,
          event_type: params.status === 'approved' ? 'correction_approved' : 'correction_denied',
          action_type: params.status === 'approved' ? 'request_approve' : 'request_deny',
          target_table: req.target_table,
          target_id: req.target_id,
          after_json: params.status === 'approved' ? (req.proposed_change as any) : undefined,
          reason: params.resolution_note.trim(),
          event_details: { correction_request_id: req.id } as any,
        });

        // Notify the employee about the decision
        if (req.created_by !== user.id) {
          await createNotification({
            org_id: req.org_id,
            recipient_user_id: req.created_by,
            actor_user_id: user.id,
            notification_type: params.status === 'approved' ? 'correction_approved' : 'correction_denied',
            title: params.status === 'approved' ? 'Correction Request Approved' : 'Correction Request Denied',
            message: params.status === 'approved'
              ? 'Your correction request has been approved and applied'
              : `Your correction request has been denied: ${params.resolution_note.trim()}`,
            related_table: 'correction_requests',
            related_id: req.id,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['correction-requests'] });
      qc.invalidateQueries({ queryKey: ['audit-history'] });
      qc.invalidateQueries({ queryKey: ['pto-requests'] });
      qc.invalidateQueries({ queryKey: ['approval-counts'] });
    },
  });
}

/** Fetch audit history for a specific record */
export function useAuditHistory(targetTable?: string, targetId?: string) {
  return useQuery({
    queryKey: ['audit-history', targetTable, targetId],
    enabled: !!targetTable && !!targetId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_events')
        .select('*')
        .eq('target_table', targetTable!)
        .eq('target_id', targetId!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

/** Fetch audit history for a date + employee */
export function useAuditHistoryByDate(employeeId?: string, entryDate?: string) {
  return useQuery({
    queryKey: ['audit-history', 'date', employeeId, entryDate],
    enabled: !!employeeId && !!entryDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_events')
        .select('*')
        .eq('employee_id', employeeId!)
        .eq('related_date', entryDate!)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });
}

/** Manager: write a direct-edit audit event */
export function useWriteManagerEditAudit() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (params: {
      employee_id: string;
      target_table: string;
      target_id: string;
      before_json: Record<string, any>;
      after_json: Record<string, any>;
      reason: string;
      related_date?: string;
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      
      const { error } = await supabase.from('audit_events').insert({
        org_id: ctx.org_id,
        employee_id: params.employee_id,
        user_id: params.employee_id, // the employee affected
        actor_id: user.id,
        event_type: 'manager_edit',
        action_type: 'manager_edit',
        target_table: params.target_table,
        target_id: params.target_id,
        before_json: params.before_json as any,
        after_json: params.after_json as any,
        reason: params.reason,
        related_date: params.related_date,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['audit-history'] });
    },
  });
}
