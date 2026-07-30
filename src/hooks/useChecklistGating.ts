import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';
import { periodKeyFor } from '@/hooks/useChecklists';

export type ChecklistGating = {
  /** Per-person daily items still open for this member today. */
  incompleteCount: number;
  incompleteTitles: string[];
  /** Per-person daily items in total today — the denominator for "N of M done". */
  gatingTotal: number;
  /** Shared (team-wide) daily items still open — informational only. */
  openSharedCount: number;
};


/**
 * What gates clock-out: only daily, active, per-person items on checklists this
 * member can see. Shared items never gate — they are shown as information.
 */
export function useChecklistGating() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  const today = getToday();
  const periodKey = periodKeyFor('daily', today);

  return useQuery({
    queryKey: ['checklist-gating', ctx?.org_id, user?.id, periodKey],
    enabled: !!user && !!ctx,
    staleTime: 30_000,
    queryFn: async (): Promise<ChecklistGating> => {
      const empty: ChecklistGating = { incompleteCount: 0, incompleteTitles: [], gatingTotal: 0, openSharedCount: 0 };
      if (!ctx || !user) return empty;

      const audiences = isAdmin ? ['all', 'manager'] : ['all'];
      const { data: lists } = await supabase
        .from('checklists')
        .select('id')
        .eq('org_id', ctx.org_id)
        .in('audience', audiences);

      const listIds = (lists ?? []).map(l => l.id);
      if (!listIds.length) return empty;

      const { data: items } = await supabase
        .from('checklist_items')
        .select('id, title, per_person')
        .eq('org_id', ctx.org_id)
        .in('checklist_id', listIds)
        .eq('cadence', 'daily')
        .eq('is_active', true);

      const all = items ?? [];
      const gating = all.filter(i => i.per_person);
      const shared = all.filter(i => !i.per_person);
      if (!all.length) return empty;

      const { data: completions } = await supabase
        .from('checklist_completions')
        .select('item_id, completed_by')
        .in('item_id', all.map(i => i.id))
        .eq('period_key', periodKey);

      const mine = new Set(
        (completions ?? []).filter(c => c.completed_by === user.id).map(c => c.item_id)
      );
      const anyone = new Set((completions ?? []).map(c => c.item_id));

      const openGating = gating.filter(i => !mine.has(i.id));
      return {
        incompleteCount: openGating.length,
        incompleteTitles: openGating.map(i => i.title),
        gatingTotal: gating.length,
        openSharedCount: shared.filter(i => !anyone.has(i.id)).length,
      };
    },
  });
}
