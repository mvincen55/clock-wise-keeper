import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export type PracticeSettings = {
  monthlyCollectionsTargetCents: number | null;
  collectionsVisibility: string;
};

/** Office-level practice settings (monthly collections target, visibility). */
export function usePracticeSettings() {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['practice-settings', ctx?.org_id],
    enabled: !!ctx,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PracticeSettings> => {
      const { data, error } = await supabase
        .from('org_practice_settings')
        .select('monthly_collections_target_cents, collections_visibility')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      return {
        monthlyCollectionsTargetCents: data?.monthly_collections_target_cents ?? null,
        collectionsVisibility: data?.collections_visibility ?? 'managers',
      };
    },
  });
}
