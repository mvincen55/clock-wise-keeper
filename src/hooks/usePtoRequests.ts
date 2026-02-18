import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useToast } from '@/hooks/use-toast';

/* ───────── Types ───────── */

export type PtoRequest = {
  id: string;
  org_id: string;
  employee_id: string;
  created_by: string;
  start_date: string;
  end_date: string;
  hours_requested: number | null;
  pto_type: 'pto' | 'sick' | 'unpaid' | 'other';
  note: string;
  status: 'pending' | 'approved' | 'denied' | 'cancelled';
  reviewed_by: string | null;
  reviewed_at: string | null;
  manager_note: string | null;
  created_at: string;
  updated_at: string;
  // joined
  employee_name?: string;
};

export type PtoTransaction = {
  id: string;
  org_id: string;
  employee_id: string;
  transaction_date: string;
  hours: number;
  transaction_type: 'accrual' | 'taken' | 'adjustment';
  source: 'system' | 'manager' | 'request';
  source_id: string | null;
  reason: string | null;
  created_by: string;
  created_at: string;
};

/* ───────── Employee: My PTO Requests ───────── */

export function useMyPtoRequests() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-pto-requests', user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pto_requests')
        .select('*')
        .eq('created_by', user!.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as PtoRequest[];
    },
  });
}

/* ───────── Employee: Submit PTO Request ───────── */

export function useSubmitPtoRequest() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      start_date: string;
      end_date: string;
      hours_requested?: number;
      pto_type: 'pto' | 'sick' | 'unpaid' | 'other';
      note: string;
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated or no org');
      const { data, error } = await supabase
        .from('pto_requests')
        .insert({
          org_id: ctx.org_id,
          employee_id: ctx.employee_id,
          created_by: user.id,
          start_date: input.start_date,
          end_date: input.end_date,
          hours_requested: input.hours_requested || null,
          pto_type: input.pto_type,
          note: input.note,
        })
        .select()
        .single();
      if (error) throw error;

      // Write audit event
      await supabase.from('audit_events').insert({
        org_id: ctx.org_id,
        employee_id: ctx.employee_id,
        user_id: user.id,
        actor_id: user.id,
        event_type: 'pto_request_create',
        action_type: 'request_create',
        target_table: 'pto_requests',
        target_id: data.id,
        reason: input.note,
        after_json: data,
      });

      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-pto-requests'] });
      qc.invalidateQueries({ queryKey: ['org-pto-requests'] });
      toast({ title: 'PTO request submitted' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

/* ───────── Employee: Cancel own pending request ───────── */

export function useCancelPtoRequest() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (requestId: string) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('pto_requests')
        .update({ status: 'cancelled' as any })
        .eq('id', requestId)
        .eq('created_by', user.id)
        .eq('status', 'pending' as any);
      if (error) throw error;

      await supabase.from('audit_events').insert({
        org_id: ctx.org_id,
        employee_id: ctx.employee_id,
        user_id: user.id,
        actor_id: user.id,
        event_type: 'pto_request_cancel',
        action_type: 'request_create',
        target_table: 'pto_requests',
        target_id: requestId,
        reason: 'Cancelled by employee',
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-pto-requests'] });
      toast({ title: 'PTO request cancelled' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

/* ───────── Manager: Org PTO Requests ───────── */

export function useOrgPtoRequests(statusFilter?: string) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-pto-requests', ctx?.org_id, statusFilter],
    enabled: !!ctx && (ctx.role === 'owner' || ctx.role === 'manager'),
    queryFn: async () => {
      let q = supabase
        .from('pto_requests')
        .select('*, employees!pto_requests_employee_id_fkey(display_name)')
        .eq('org_id', ctx!.org_id)
        .order('created_at', { ascending: false });
      if (statusFilter && statusFilter !== 'all') {
        q = q.eq('status', statusFilter as any);
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map((r: any) => ({
        ...r,
        employee_name: r.employees?.display_name || 'Unknown',
      })) as PtoRequest[];
    },
  });
}

/* ───────── Manager: Review PTO Request (approve/deny) ───────── */

export function useReviewPtoRequest() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: 'approved' | 'denied';
      manager_note?: string;
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');

      // Get request details first
      const { data: request, error: fetchErr } = await supabase
        .from('pto_requests')
        .select('*')
        .eq('id', input.id)
        .single();
      if (fetchErr) throw fetchErr;

      // Update the request
      const { error } = await supabase
        .from('pto_requests')
        .update({
          status: input.status as any,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
          manager_note: input.manager_note || null,
        })
        .eq('id', input.id);
      if (error) throw error;

      if (input.status === 'approved') {
        // Create days_off entries for the approved range
        const startDate = new Date(request.start_date + 'T00:00:00');
        const endDate = new Date(request.end_date + 'T00:00:00');

        // Get the employee's user_id for days_off
        const { data: emp } = await supabase
          .from('employees')
          .select('user_id')
          .eq('id', request.employee_id)
          .single();

        if (emp?.user_id) {
          const dayOffType = request.pto_type === 'sick' ? 'medical_leave' : 'scheduled_with_notice';

          // Calculate total hours (default 8 per day if not specified)
          const dayCount = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
          const totalHours = request.hours_requested || dayCount * 8;

          await supabase.from('days_off').insert({
            org_id: ctx.org_id,
            employee_id: request.employee_id,
            user_id: emp.user_id,
            date_start: request.start_date,
            date_end: request.end_date,
            type: dayOffType,
            hours: totalHours,
            notes: `PTO Request: ${request.note}`,
            created_by: user.id,
            source: 'pto_request',
            request_id: request.id,
          });

          // Create PTO transaction (deduction)
          await supabase.from('pto_transactions').insert({
            org_id: ctx.org_id,
            employee_id: request.employee_id,
            transaction_date: request.start_date,
            hours: totalHours,
            transaction_type: 'taken' as any,
            source: 'request' as any,
            source_id: request.id,
            reason: request.note,
            created_by: user.id,
          });

          // Recompute attendance
          await supabase.rpc('recompute_attendance_range', {
            p_user_id: emp.user_id,
            p_start_date: request.start_date,
            p_end_date: request.end_date,
          });
        }
      }

      // Write audit event
      await supabase.from('audit_events').insert({
        org_id: ctx.org_id,
        employee_id: request.employee_id,
        user_id: user.id,
        actor_id: user.id,
        event_type: input.status === 'approved' ? 'pto_request_approve' : 'pto_request_deny',
        action_type: input.status === 'approved' ? 'request_approve' : 'request_deny',
        target_table: 'pto_requests',
        target_id: input.id,
        before_json: { status: 'pending' },
        after_json: { status: input.status, manager_note: input.manager_note },
        reason: input.manager_note || request.note,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-pto-requests'] });
      qc.invalidateQueries({ queryKey: ['my-pto-requests'] });
      qc.invalidateQueries({ queryKey: ['days-off'] });
      qc.invalidateQueries({ queryKey: ['pto-ledger'] });
      toast({ title: 'PTO request reviewed' });
    },
    onError: (e: any) => toast({ title: 'Error', description: e.message, variant: 'destructive' }),
  });
}

/* ───────── PTO Transactions ───────── */

export function usePtoTransactions(employeeId?: string) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['pto-transactions', ctx?.org_id, employeeId],
    enabled: !!ctx && !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pto_transactions')
        .select('*')
        .eq('employee_id', employeeId!)
        .order('transaction_date', { ascending: false });
      if (error) throw error;
      return (data || []) as PtoTransaction[];
    },
  });
}
