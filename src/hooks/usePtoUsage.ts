import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/pending-schema';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { PtoUsageRow } from '@/lib/pto-usage';

/**
 * PTO usage (`pto_usage`): the hours a team member records as used. Reads
 * are plain selects under row-level security (own rows, or the office for
 * owners and managers); writes go through the database functions that
 * stamp who did what and apply the bank guard:
 *
 *   record_pto_usage   the team member for themselves, an owner or manager
 *                      for anyone on the roster
 *   void_pto_usage     takes a recorded use back, with a reason
 *
 * Vocabulary and the pure helpers live in `src/lib/pto-usage.ts`.
 */

/** Everything a PTO-use change can move: the rows, the ledger, every bank reading. */
function invalidatePtoUsage(qc: ReturnType<typeof useQueryClient>) {
  for (const key of ['pto-usage', 'org-pto-usage', 'pto-ledger', 'pto-settings', 'pto-snapshots', 'team-pto-balances', 'pto-available', 'notifications']) {
    qc.invalidateQueries({ queryKey: [key] });
  }
}

/** One person's recorded uses, newest first, voided rows included (the page shows them struck through). */
export function usePtoUsage(employeeId?: string, enabled = true) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const target = employeeId ?? ctx?.employee_id;
  return useQuery({
    queryKey: ['pto-usage', ctx?.org_id, target],
    enabled: enabled && !!user && !!ctx?.org_id && !!target,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PtoUsageRow[]> => {
      const { data, error } = await supabase
        .from('pto_usage')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('employee_id', target!)
        .order('usage_date', { ascending: false })
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(normalize);
    },
  });
}

/**
 * Every recorded use in the office dated in the range, for owners and
 * managers (RLS limits everyone else to their own rows). Voided rows come
 * back too so a report can say what was taken back.
 */
export function useOrgPtoUsage(startDate?: string, endDate?: string, enabled = true) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-pto-usage', ctx?.org_id, startDate ?? null, endDate ?? null],
    enabled: enabled && !!user && !!ctx?.org_id,
    refetchInterval: 30_000,
    queryFn: async (): Promise<PtoUsageRow[]> => {
      let q = supabase.from('pto_usage').select('*').eq('org_id', ctx!.org_id).order('usage_date', { ascending: false });
      if (startDate) q = q.gte('usage_date', startDate);
      if (endDate) q = q.lte('usage_date', endDate);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map(normalize);
    },
  });
}

/** The server's own "available" reading for one bank: what the guard enforces. */
export function usePtoAvailable(employeeId: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['pto-available', employeeId],
    enabled: !!user && !!employeeId,
    queryFn: async () => {
      const [available, negative] = await Promise.all([
        supabase.rpc('pto_available_hours', { p_employee_id: employeeId! }),
        supabase.rpc('pto_allows_negative', { p_employee_id: employeeId! }),
      ]);
      if (available.error) throw available.error;
      if (negative.error) throw negative.error;
      return { available: available.data == null ? null : Number(available.data), allowNegative: !!negative.data };
    },
  });
}

export function useRecordPtoUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { employeeId: string; usageDate: string; hours: number; note?: string }) => {
      const { data, error } = await supabase.rpc('record_pto_usage', {
        p_employee_id: input.employeeId, p_usage_date: input.usageDate, p_hours: input.hours, p_note: input.note ?? '',
      });
      if (error) throw error;
      return normalize(data as PtoUsageRow);
    },
    onSuccess: () => invalidatePtoUsage(qc),
  });
}

export function useVoidPtoUsage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const { data, error } = await supabase.rpc('void_pto_usage', { p_id: input.id, p_reason: input.reason ?? '' });
      if (error) throw error;
      return normalize(data as PtoUsageRow);
    },
    onSuccess: () => invalidatePtoUsage(qc),
  });
}

/** PostgREST returns numerics as strings. */
function normalize(row: PtoUsageRow): PtoUsageRow {
  return { ...row, hours: Number(row.hours) };
}
