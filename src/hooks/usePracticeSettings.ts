import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { roleClocksIn } from '@/lib/roles';
import { DEFAULT_CONFIRMATION_LEAD_DAYS } from '@/components/goals/goal-examples';

export type PracticeSettings = {
  /** Office decides whether employees see the practice-vitals collections bar. */
  collections_visibility: 'admin_only' | 'everyone' | string;
  /** Monthly collections target used to pace the vitals gauge. */
  monthly_collections_target_cents: number;
  /** Opt-in: allow the phone-photo fallback for Privacy View Capture. */
  mobile_capture_enabled: boolean;
  /** How many days ahead the front desk confirms appointments (goal starters use this). */
  confirmation_lead_days: number;
};

export type PracticeSettingsPatch = Partial<PracticeSettings>;

/**
 * Rows written before the 20260803 visibility-token migration stored
 * 'team'/'admins'; every consumer (dropdown, vitals gating) expects
 * 'everyone'/'admin_only', so map the legacy tokens on read.
 */
export function normalizeCollectionsVisibility(value: string | null | undefined): string {
  if (value === 'team') return 'everyone';
  if (value === 'admins') return 'admin_only';
  return value || 'everyone';
}

/** Office-wide practice settings, readable by every member of the office. */
export function usePracticeSettings() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['practice-settings', ctx?.org_id],
    enabled: !!ctx,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PracticeSettings> => {
      const { data } = await supabase
        .from('org_practice_settings')
        .select(
          'collections_visibility, monthly_collections_target_cents, mobile_capture_enabled, confirmation_lead_days'
        )
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      return {
        collections_visibility: normalizeCollectionsVisibility(data?.collections_visibility),
        monthly_collections_target_cents: data?.monthly_collections_target_cents ?? 0,
        mobile_capture_enabled: data?.mobile_capture_enabled ?? false,
        confirmation_lead_days: data?.confirmation_lead_days ?? DEFAULT_CONFIRMATION_LEAD_DAYS,
      };
    },
  });
}

export function useUpsertPracticeSettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: PracticeSettingsPatch) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('org_practice_settings')
        .upsert({ org_id: ctx.org_id, ...patch }, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['practice-settings'] });
    },
  });
}

/**
 * True when this member should see the clock and be held to closeout rules.
 * Of the three membership types — Owner, Manager, Team — owners are the only
 * ones who never punch; Managers and Team always do.
 */
export function useClocksIn() {
  const { data: ctx } = useOrgContext();
  return roleClocksIn(ctx?.role);
}
