import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export type PracticeSettings = {
  /** Doctors/owners are only in the clock + closeout flow if the office says so. */
  owners_clock_in: boolean;
};

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
        .select('owners_clock_in')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      return { owners_clock_in: data?.owners_clock_in ?? false };
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
