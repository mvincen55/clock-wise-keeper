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
      const empty: ChecklistGating = { incompleteCount: 0, incompleteTitles: [], openSharedCount: 0 };
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
        .select('id, title, per_person, owner_user_id, due_date')
        .eq('org_id', ctx.org_id)
        .in('checklist_id', listIds)
        .eq('cadence', 'daily')
        .eq('is_active', true);

      // Captured items gate exactly like manual ones — but only on (or after)
      // the day they were set for, and only for the person who confirmed them.
      const all = (items ?? []).filter(
        i =>
          (!i.owner_user_id || i.owner_user_id === user.id) &&
          (!i.due_date || i.due_date <= today)
      );
      const gating = all.filter(i => i.per_person);
      const shared = all.filter(i => !i.per_person);
      if (!all.length) return empty;

      const { data: completions } = await supabase
        .from('checklist_completions')
        .select('item_id, completed_by, period_key')
        .in('item_id', all.map(i => i.id));

      // A dated item completes for its own day; undated daily items for today.
      const keyFor = (dueDate: string | null) => dueDate ?? periodKey;
      const byItem = new Map(all.map(i => [i.id, i.due_date as string | null]));
      const relevant = (completions ?? []).filter(
        c => c.period_key === keyFor(byItem.get(c.item_id) ?? null)
      );

      const mine = new Set(relevant.filter(c => c.completed_by === user.id).map(c => c.item_id));
      const anyone = new Set(relevant.map(c => c.item_id));

      const openGating = gating.filter(i => !mine.has(i.id));
      return {
        incompleteCount: openGating.length,
        incompleteTitles: openGating.map(i => i.title),
        openSharedCount: shared.filter(i => !anyone.has(i.id)).length,
      };

    },
  });
}
