import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';
import { depositChecks, type DepositLog } from '@/hooks/useDepositLog';

// The practice's one shared number for the month: collections.
// The target is a setting (never hardcoded); month-to-date is computed live
// from the deposit log, which is the source of truth for money collected.

export type CollectionsVisibility = 'team' | 'admins';

export type PracticeSettings = {
  id: string;
  org_id: string;
  monthly_collections_target_cents: number | null;
  collections_visibility: CollectionsVisibility;
};

export function usePracticeSettings() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['practice-settings', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async (): Promise<PracticeSettings | null> => {
      const { data, error } = await supabase
        .from('org_practice_settings')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      return (data as PracticeSettings) ?? null;
    },
  });
}

export function useSavePracticeSettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: {
      monthly_collections_target_cents?: number | null;
      collections_visibility?: CollectionsVisibility;
    }) => {
      if (!ctx) throw new Error('No organization loaded yet.');
      const { error } = await supabase
        .from('org_practice_settings')
        .upsert({ org_id: ctx.org_id, ...patch }, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['practice-settings'] }),
  });
}

function depositTotalCents(log: DepositLog): number {
  const checks = depositChecks(log).reduce((s, c) => s + (c || 0), 0);
  return (
    (log.cash_cents ?? 0) +
    checks +
    (log.ins_cc_cents ?? 0) +
    (log.pt_cc_cents ?? 0) +
    (log.illumitrac_cents ?? 0) +
    (log.outside_financing_cents ?? 0)
  );
}

/** Collections so far this month, summed live from the deposit log. */
export function useCollectionsMonthToDate() {
  const { data: ctx } = useOrgContext();
  const today = getToday();
  const month = today.slice(0, 7);

  return useQuery({
    queryKey: ['collections-mtd', ctx?.org_id, month],
    enabled: !!ctx,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('deposit_logs')
        .select('*')
        .gte('deposit_date', `${month}-01`)
        .lte('deposit_date', today);
      if (error) throw error;
      const logs = (data ?? []) as DepositLog[];
      return {
        month,
        cents: logs.reduce((sum, l) => sum + depositTotalCents(l), 0),
        days: logs.length,
      };
    },
  });
}

export function formatDollars(cents: number): string {
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
}
