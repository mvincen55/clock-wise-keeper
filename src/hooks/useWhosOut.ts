import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';

/**
 * Who is out today — days off covering today, matched to a name.
 * Row-level security decides how much of this a member can see; whatever
 * comes back is shown, and nothing at all when there is nothing to show.
 */
export function useWhosOutToday() {
  const { data: ctx } = useOrgContext();
  const today = getToday();

  return useQuery({
    queryKey: ['whos-out-today', ctx?.org_id, today],
    enabled: !!ctx,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data: off, error } = await supabase
        .from('days_off')
        .select('user_id, type')
        .lte('date_start', today)
        .gte('date_end', today);
      if (error) throw error;

      const rows = (off ?? []).filter(r => r.type !== 'office_closed');
      if (!rows.length) return [];

      const { data: people } = await supabase
        .from('employees')
        .select('user_id, display_name')
        .eq('org_id', ctx!.org_id);

      const byUser = new Map((people ?? []).map(p => [p.user_id, p.display_name]));
      const names = rows
        .map(r => byUser.get(r.user_id) ?? null)
        .filter((n): n is string => !!n);
      return Array.from(new Set(names)).sort();
    },
  });
}
