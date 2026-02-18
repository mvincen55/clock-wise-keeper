import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

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
    mutationFn: async (params: {
      target_table: string;
      target_id: string;
      proposed_change: Record<string, any>;
      reason: string;
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      if (params.reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');
      
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

      const { error } = await supabase
        .from('correction_requests')
        .update({
          status: params.status,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          resolution_note: params.resolution_note.trim(),
        })
        .eq('id', params.id);
      if (error) throw error;

      // If approved, write an audit event
      if (params.status === 'approved') {
        // Fetch the request to get details
        const { data: req } = await supabase
          .from('correction_requests')
          .select('*')
          .eq('id', params.id)
          .single();
        
        if (req) {
          await supabase.from('audit_events').insert({
            org_id: req.org_id,
            employee_id: req.employee_id,
            user_id: req.created_by,
            actor_id: user.id,
            event_type: 'correction_approved',
            action_type: 'request_approve',
            target_table: req.target_table,
            target_id: req.target_id,
            after_json: req.proposed_change as any,
            reason: params.resolution_note.trim(),
            event_details: { correction_request_id: req.id } as any,
          });

          // Mark as applied
          await supabase
            .from('correction_requests')
            .update({ status: 'applied' as any })
            .eq('id', params.id);
        }
      } else {
        // Denied — write audit
        const { data: req } = await supabase
          .from('correction_requests')
          .select('*')
          .eq('id', params.id)
          .single();

        if (req) {
          await supabase.from('audit_events').insert({
            org_id: req.org_id,
            employee_id: req.employee_id,
            user_id: req.created_by,
            actor_id: user.id,
            event_type: 'correction_denied',
            action_type: 'request_deny',
            target_table: req.target_table,
            target_id: req.target_id,
            reason: params.resolution_note.trim(),
            event_details: { correction_request_id: req.id } as any,
          });
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['correction-requests'] });
      qc.invalidateQueries({ queryKey: ['audit-history'] });
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
