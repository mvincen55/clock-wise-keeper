import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export type PracticeSettings = {
  /** Doctors/owners are only in the clock + closeout flow if the office says so. */
  owners_clock_in: boolean;
  /** Office decides whether employees see the practice-vitals collections bar. */
  collections_visibility: 'admin_only' | 'everyone' | string;
  /** Monthly collections target used to pace the vitals gauge. */
  monthly_collections_target_cents: number;
  /** Opt-in: allow the phone-photo fallback for Privacy View Capture. */
  mobile_capture_enabled: boolean;
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
          'owners_clock_in, collections_visibility, monthly_collections_target_cents, mobile_capture_enabled'
        )
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      return {
        owners_clock_in: data?.owners_clock_in ?? false,
        collections_visibility: normalizeCollectionsVisibility(data?.collections_visibility),
        monthly_collections_target_cents: data?.monthly_collections_target_cents ?? 0,
        mobile_capture_enabled: data?.mobile_capture_enabled ?? false,
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

/** True when this member should see the clock and be held to closeout rules. */
export function useClocksIn() {
  const { data: ctx } = useOrgContext();
  const { data: settings } = usePracticeSettings();
  if (!ctx) return false;
  if (ctx.role !== 'owner') return true;
  return !!settings?.owners_clock_in;
}
