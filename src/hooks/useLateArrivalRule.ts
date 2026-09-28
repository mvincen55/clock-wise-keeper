import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { DEFAULT_LATE_ARRIVAL_RULE, type LateArrivalRule } from '@/lib/late-arrivals';

/**
 * The office's late-arrival rule: how many unexcused late arrivals within a
 * rolling window open an attendance incident report. It is the existing
 * `escalation_policies` row of kind `tardy_threshold` (every office has
 * one; the database seeds it), read by every member and edited by owners
 * and managers. Evaluation happens in the database the moment a relevant
 * record changes, so nothing here has to be "run".
 */
const KIND = 'tardy_threshold';

export const lateArrivalRuleKey = (orgId?: string) => ['late-arrival-rule', orgId] as const;

export function useLateArrivalRule() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: lateArrivalRuleKey(ctx?.org_id),
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<LateArrivalRule> => {
      const { data, error } = await supabase
        .from('escalation_policies')
        .select('threshold_count, threshold_window_days, is_active')
        .eq('org_id', ctx!.org_id)
        .eq('kind', KIND)
        .maybeSingle();
      if (error) throw error;
      if (!data) return DEFAULT_LATE_ARRIVAL_RULE;
      return {
        threshold_count: data.threshold_count,
        threshold_window_days: data.threshold_window_days,
        is_active: data.is_active,
      };
    },
  });
}

/** Owners and managers set the rule. Saving re-checks everyone against it (a database trigger). */
export function useSaveLateArrivalRule() {
  const qc = useQueryClient();
  const { data: ctx } = useOrgContext();
  return useMutation({
    mutationFn: async (rule: LateArrivalRule) => {
      if (!ctx) throw new Error('Not ready');
      const count = Math.floor(rule.threshold_count);
      const days = Math.floor(rule.threshold_window_days);
      if (!Number.isFinite(count) || count < 1 || count > 99) throw new Error('How many: enter a whole number from 1 to 99.');
      if (!Number.isFinite(days) || days < 1 || days > 365) throw new Error('Within how many days: enter a whole number from 1 to 365.');
      const { error } = await supabase
        .from('escalation_policies')
        .upsert(
          { org_id: ctx.org_id, kind: KIND, threshold_count: count, threshold_window_days: days, is_active: rule.is_active },
          { onConflict: 'org_id,kind' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['late-arrival-rule'] });
      qc.invalidateQueries({ queryKey: ['escalation-policies'] });
      qc.invalidateQueries({ queryKey: ['incident-reports'] });
    },
  });
}
