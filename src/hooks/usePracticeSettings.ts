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
};

export type PracticeSettingsPatch = Partial<PracticeSettings>;

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
        .select('owners_clock_in, collections_visibility, monthly_collections_target_cents')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      return {
        owners_clock_in: data?.owners_clock_in ?? false,
        collections_visibility: data?.collections_visibility ?? 'everyone',
        monthly_collections_target_cents: data?.monthly_collections_target_cents ?? 0,
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
