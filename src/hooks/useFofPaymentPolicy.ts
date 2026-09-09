import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  DEFAULT_PAYMENT_POLICY,
  policyFromRow,
  type PaymentPolicy,
  type PaymentPolicyRow,
} from '@/lib/fof/payment-plan';

/**
 * The active organization's FOF payment policy, stored on its own
 * `fof_settings` row (the table that already owns FOF configuration — no
 * second source of truth). Reads and writes are org-scoped; RLS restricts
 * reads to members and writes to owners/managers.
 *
 * Until the pending schema change in docs/sql/20260909213000_fof_payment_
 * policy.sql is applied, the payment columns do not exist yet: the read
 * degrades to the neutral disabled default and every office keeps its
 * current schedule.
 */
export function useFofPaymentPolicy() {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['fof-payment-policy', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PaymentPolicy> => {
      const { data, error } = await supabase
        .from('fof_settings')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      // The payment columns are additive; the generated types catch up when
      // the migration is applied. Reading them defensively keeps the app
      // working either way.
      return policyFromRow(data as PaymentPolicyRow | null);
    },
  });
}

export type PaymentPolicyPatch = Partial<{
  payment_policy_enabled: boolean;
  payment_threshold_cents: number;
  payment_threshold_inclusive: boolean;
  payment_work_up_codes: string[];
  payment_implant_advance_exception: boolean;
  payment_mixed_group_uplift: boolean;
  payment_combine_mode: 'linked_events' | 'never';
  payment_rounding: 'last' | 'first';
  payment_strategies: PaymentPolicy['strategies'];
  payment_milestone_labels: PaymentPolicy['labels'];
}>;

export function useUpsertFofPaymentPolicy() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: PaymentPolicyPatch) => {
      if (!ctx) throw new Error('Not authenticated');
      const payload = { org_id: ctx.org_id, ...patch };
      const { error } = await supabase
        .from('fof_settings')
        // Same additive-columns note as the read above.
        .upsert(payload as unknown as never, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fof-payment-policy'] });
      qc.invalidateQueries({ queryKey: ['fof-policy-settings'] });
    },
  });
}

export { DEFAULT_PAYMENT_POLICY };
