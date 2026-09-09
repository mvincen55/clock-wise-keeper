import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { paymentPolicySchema, type PaymentPolicy, type PaymentClass } from '@/lib/fof/payment-policy';
import type { Json } from '@/integrations/supabase/types';

export type FofPolicySettings = {
  payment_policy: PaymentPolicy | null;
  membership_plan_name: string;
  doctor_names: string[];
  day_of_service_threshold_cents: number;
  min_standalone_payment_cents: number;
  downgrade_default_on: boolean;
};

export function useFofPolicySettings() {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['fof-policy-settings', ctx?.org_id],
    enabled: !!ctx,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<FofPolicySettings> => {
      const { data, error } = await supabase
        .from('fof_settings')
        .select('membership_plan_name, doctor_names, day_of_service_threshold_cents, min_standalone_payment_cents, downgrade_default_on, payment_policy')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      return {
        payment_policy: data?.payment_policy == null ? null : paymentPolicySchema.parse(data.payment_policy),
        membership_plan_name: data?.membership_plan_name ?? 'Membership',
        doctor_names: Array.isArray(data?.doctor_names)
          ? (data?.doctor_names as string[]).filter((n) => typeof n === 'string' && n.trim() !== '')
          : [],
        day_of_service_threshold_cents: data?.day_of_service_threshold_cents ?? 100_000,
        min_standalone_payment_cents: data?.min_standalone_payment_cents ?? 10_000,
        downgrade_default_on: data?.downgrade_default_on ?? false,
      };
    },
  });
}

export function useUpsertFofPolicySettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<FofPolicySettings>) => {
      if (!ctx || !['owner', 'manager'].includes(ctx.role)) throw new Error('Owner or manager access required');
      const allowed = ['membership_plan_name', 'doctor_names', 'day_of_service_threshold_cents', 'min_standalone_payment_cents', 'downgrade_default_on', 'payment_policy'];
      const clean = Object.fromEntries(Object.entries(patch).filter(([key]) => allowed.includes(key)));
      if (clean.payment_policy != null) clean.payment_policy = paymentPolicySchema.parse(clean.payment_policy);
      const { error } = await supabase
        .from('fof_settings')
        .upsert({ ...clean, org_id: ctx.org_id } as { org_id: string; payment_policy?: Json }, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fof-policy-settings'] });
      qc.invalidateQueries({ queryKey: ['fof-settings'] });
    },
  });
}

/** Payment semantics stay in the existing procedure registry, separate from insurance categories. */
export function usePaymentClassifications() {
  const { data: ctx } = useOrgContext();
  return useQuery({ queryKey: ['payment-classifications', ctx?.org_id], enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase.from('procedure_meta').select('code, payment_class').eq('org_id', ctx!.org_id);
      if (error) throw error;
      return Object.fromEntries((data ?? []).map(row => [row.code, row.payment_class as PaymentClass | 'review' | null]));
    } });
}

export function useSavePaymentClassification() {
  const { data: ctx } = useOrgContext(); const qc = useQueryClient();
  return useMutation({ mutationFn: async ({ code, classification }: { code: string; classification: PaymentClass | 'review' }) => {
    if (!ctx || !['owner', 'manager'].includes(ctx.role)) throw new Error('Owner or manager access required');
    const normalized = code.trim().toUpperCase();
    if (!normalized || !['workup', 'implant', 'restoration', 'denture', 'other', 'review'].includes(classification)) throw new Error('Invalid procedure classification');
    const { error } = await supabase.from('procedure_meta').upsert({ org_id: ctx.org_id, code: normalized, payment_class: classification }, { onConflict: 'org_id,code' });
    if (error) throw error;
  }, onSuccess: () => { qc.invalidateQueries({ queryKey: ['payment-classifications', ctx?.org_id] }); } });
}
