import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';

// Office-level practice settings (one row per org).

export type PracticeSettings = Tables<'org_practice_settings'>;

export function usePracticeSettings() {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['practice-settings', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async (): Promise<PracticeSettings | null> => {
      const { data, error } = await supabase
        .from('org_practice_settings')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export function useUpdatePracticeSettings() {
  const qc = useQueryClient();
  const { data: ctx } = useOrgContext();

  return useMutation({
    mutationFn: async (patch: Partial<PracticeSettings>) => {
      if (!ctx?.org_id) throw new Error('No organization');
      const { error } = await supabase
        .from('org_practice_settings')
        .upsert({ org_id: ctx.org_id, ...patch }, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['practice-settings', ctx?.org_id] });
    },
  });
}
