import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export type FofPolicySettings = {
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
        .select('membership_plan_name, doctor_names, day_of_service_threshold_cents, min_standalone_payment_cents, downgrade_default_on')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      return {
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
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('fof_settings')
        .upsert({ org_id: ctx.org_id, ...patch }, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fof-policy-settings'] });
      qc.invalidateQueries({ queryKey: ['fof-settings'] });
    },
  });
}
