import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/pending-schema';
import { useAuth } from '@/hooks/useAuth';

/**
 * Late arrivals (`tardies`): rows the attendance engine writes when a
 * clock-in lands past the scheduled start plus grace. Nothing here creates
 * or edits one directly — the engine owns the facts, and the three things a
 * person can do about a row go through their database functions, which
 * stamp who did what and when and enforce who may:
 *
 *   acknowledge_tardy      the employee, on their own row; a receipt
 *   request_tardy_excuse   the employee, on their own row; pending review
 *   decide_tardy_excuse    an owner or manager, never on their own row
 *
 * Vocabulary (excuse state, what counts) lives in `src/lib/late-arrivals.ts`.
 */
export type TardyRow = {
  id: string;
  user_id: string;
  /** Whose tardy this is — what the manager view groups and filters on. */
  employee_id: string;
  time_entry_id: string | null;
  entry_date: string;
  expected_start_time: string;
  actual_start_time: string;
  minutes_late: number;
  /** The employee's explanation, when they asked for an excuse. */
  reason_text: string | null;
  /** unreviewed (no decision) · approved (excused) · unapproved (unexcused). */
  approval_status: 'unreviewed' | 'approved' | 'unapproved';
  approved_by: string | null;
  approved_at: string | null;
  /** True once a correction made the day on time; the row stays for the record and never counts. */
  resolved: boolean;
  timezone_suspect: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
  excuse_requested_at: string | null;
  excuse_decided_at: string | null;
  excuse_decided_by: string | null;
  manager_note: string;
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
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as TardyRow[];
    },
  });
}

/** Everything a tardy change can move: the rows, the day statuses, the queue, and any report it opened. */
function invalidateLateArrivals(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['tardies'] });
  qc.invalidateQueries({ queryKey: ['employee-tardies'] });
  qc.invalidateQueries({ queryKey: ['attendance-day-status'] });
  qc.invalidateQueries({ queryKey: ['incident-reports'] });
  qc.invalidateQueries({ queryKey: ['notifications'] });
}

/** Acknowledge as unexcused: records who and when. No reason, no signature, no manager. */
export function useAcknowledgeTardy() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tardyId: string) => {
      const { data, error } = await supabase.rpc('acknowledge_tardy', { p_tardy_id: tardyId });
      if (error) throw error;
      return data as unknown as TardyRow;
    },
    onSuccess: () => invalidateLateArrivals(qc),
  });
}

/** Request excused: a short explanation, decided by a manager; pending review at once. */
export function useRequestTardyExcuse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tardyId, explanation }: { tardyId: string; explanation: string }) => {
      const { data, error } = await supabase.rpc('request_tardy_excuse', { p_tardy_id: tardyId, p_explanation: explanation });
      if (error) throw error;
      return data as unknown as TardyRow;
    },
    onSuccess: () => invalidateLateArrivals(qc),
  });
}

/**
 * A manager's decision, on a request or on any late arrival at any time.
 * The note is optional. The server refuses the person the row is about.
 */
export function useDecideTardyExcuse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ tardyId, decision, note }: { tardyId: string; decision: 'excused' | 'unexcused'; note?: string }) => {
      const { data, error } = await supabase.rpc('decide_tardy_excuse', { p_tardy_id: tardyId, p_decision: decision, p_note: note ?? '' });
      if (error) throw error;
      return data as unknown as TardyRow;
    },
    onSuccess: () => invalidateLateArrivals(qc),
  });
}
