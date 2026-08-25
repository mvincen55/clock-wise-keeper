import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';

/**
 * Onboarding instances — reads are plain org-scoped selects (clients hold
 * SELECT only); every write goes through an RPC or the attest edge
 * function, so snapshots and recorded signatures can't be edited from a
 * browser. See migration 20260825140000_onboarding_instances.sql.
 */

export type OnboardingInstance = Tables<'onboarding_instances'>;
export type OnboardingInstanceItem = Tables<'onboarding_instance_items'>;

export interface InstanceDetail {
  instance: OnboardingInstance;
  items: OnboardingInstanceItem[];
}

/** Every instance in the org (managers see all; members see the same list on shared terminals). */
export function useOnboardingInstances() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['onboarding-instances', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async (): Promise<OnboardingInstance[]> => {
      const { data, error } = await supabase
        .from('onboarding_instances')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('started_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The signed-in member's own instances (their personal progress view). */
export function useMyOnboardingInstances() {
  const { data: ctx } = useOrgContext();
  const all = useOnboardingInstances();
  return {
    ...all,
    data: (all.data ?? []).filter(i => i.employee_id === ctx?.employee_id),
  };
}

export function useOnboardingInstance(instanceId: string | undefined) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['onboarding-instance', instanceId],
    enabled: !!ctx && !!instanceId,
    queryFn: async (): Promise<InstanceDetail | null> => {
      const [inst, items] = await Promise.all([
        supabase.from('onboarding_instances').select('*').eq('id', instanceId!).maybeSingle(),
        supabase
          .from('onboarding_instance_items')
          .select('*')
          .eq('instance_id', instanceId!)
          .order('section_sort')
          .order('sort_order'),
      ]);
      if (inst.error) throw inst.error;
      if (items.error) throw items.error;
      if (!inst.data) return null;
      return { instance: inst.data, items: items.data ?? [] };
    },
  });
}

export function useStartOnboarding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      employeeId,
      templateId,
    }: {
      employeeId: string;
      templateId: string;
    }): Promise<string> => {
      const { data, error } = await supabase.rpc('start_onboarding_instance', {
        _employee_id: employeeId,
        _template_id: templateId,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding-instances'] }),
  });
}

/** Editable-initials fallback — only valid while require_pin_on_signoff is off. */
export function useFallbackSignoff() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      itemId,
      side,
      initials,
      trainerEmployeeId,
    }: {
      itemId: string;
      instanceId: string;
      side: 'trainer' | 'trainee';
      initials: string;
      trainerEmployeeId?: string;
    }) => {
      const { error } = await supabase.rpc('record_onboarding_signoff_fallback', {
        _item_id: itemId,
        _side: side,
        _initials: initials,
        _trainer_employee_id: trainerEmployeeId ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { instanceId }) => {
      qc.invalidateQueries({ queryKey: ['onboarding-instance', instanceId] });
      qc.invalidateQueries({ queryKey: ['onboarding-instances'] });
    },
  });
}
