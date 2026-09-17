import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { formatEmployeeName } from '@/lib/employee-name';

/**
 * Tardy approval requests.
 *
 * Office policy: a late arrival is unapproved unless a manager excuses it.
 * An employee asks through `request_tardy_approval`; a manager answers
 * through `decide_tardy_approval_request`, or decides straight from the
 * tardy with `review_tardy` (which also answers any waiting request). The
 * table itself takes no client writes — every change is one of those RPCs,
 * so the tardy and the request always move together.
 */
export type TardyApprovalRequestRow = {
  id: string;
  org_id: string;
  employee_id: string;
  tardy_id: string;
  entry_date: string;
  requested_by: string;
  reason: string;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  created_at: string;
  updated_at: string;
  /** Joined for the manager's queue. */
  employee_name: string;
  /** Joined so the queue can show the lateness without a second lookup. */
  tardy: { minutes_late: number; expected_start_time: string; actual_start_time: string } | null;
};

export type TardyRequestStatusFilter = 'pending' | 'approved' | 'denied' | 'all';

const QUERY_KEY = 'tardy-approval-requests';

function invalidateTardyState(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [QUERY_KEY] });
  qc.invalidateQueries({ queryKey: ['tardies'] });
  qc.invalidateQueries({ queryKey: ['employee-tardies'] });
  qc.invalidateQueries({ queryKey: ['attendance-day-status'] });
  qc.invalidateQueries({ queryKey: ['approval-counts'] });
  qc.invalidateQueries({ queryKey: ['notifications'] });
}

/**
 * Every request the viewer may read: their own, or the whole office's for
 * owners and managers (row-level security decides, the query does not).
 */
export function useTardyApprovalRequests(status: TardyRequestStatusFilter = 'all') {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: [QUERY_KEY, ctx?.org_id, user?.id, status],
    enabled: !!user && !!ctx?.org_id,
    queryFn: async () => {
      let q = supabase
        .from('tardy_approval_requests')
        .select('*, employees!tardy_approval_requests_employee_id_fkey(display_name), tardies!tardy_approval_requests_tardy_id_fkey(minutes_late, expected_start_time, actual_start_time)')
        .eq('org_id', ctx!.org_id)
        .order('created_at', { ascending: false });
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return (data || []).map(r => {
        const { employees, tardies, ...row } = r as typeof r & {
          employees: { display_name: string } | null;
          tardies: TardyApprovalRequestRow['tardy'];
        };
        return {
          ...row,
          employee_name: employees?.display_name ? formatEmployeeName(employees.display_name) : 'Unknown',
          tardy: tardies ?? null,
        } as TardyApprovalRequestRow;
      });
    },
  });
}

/** Waiting requests keyed by tardy id, for the tables that show a tardy's state. */
export function usePendingTardyRequests() {
  const query = useTardyApprovalRequests('pending');
  const byTardy = useMemo(() => {
    const map = new Map<string, TardyApprovalRequestRow>();
    (query.data || []).forEach(r => map.set(r.tardy_id, r));
    return map;
  }, [query.data]);
  return { ...query, byTardy };
}

/** Employee: ask a manager to excuse one of their own tardies. */
export function useRequestTardyApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tardyId, reason }: { tardyId: string; reason: string }) => {
      const { data, error } = await supabase.rpc('request_tardy_approval', {
        p_tardy_id: tardyId,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => invalidateTardyState(qc),
  });
}

/** Manager: answer a waiting request. A denial needs a note. */
export function useDecideTardyApprovalRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, approve, note }: { id: string; approve: boolean; note?: string }) => {
      const { error } = await supabase.rpc('decide_tardy_approval_request', {
        p_request_id: id,
        p_approve: approve,
        p_note: note?.trim() || undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateTardyState(qc),
  });
}

/** Manager: decide straight from the tardy; any waiting request follows. */
export function useReviewTardy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tardyId, status, reason }: { tardyId: string; status: 'approved' | 'unapproved'; reason: string }) => {
      const { error } = await supabase.rpc('review_tardy', {
        p_tardy_id: tardyId,
        p_status: status,
        p_reason: reason.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => invalidateTardyState(qc),
  });
}
