import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';
import { useClocksIn } from '@/hooks/usePracticeSettings';
import { computeGating, audiencesFor, EMPTY_GATING } from '@/lib/checklist-gating';

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
  // Doctors don't carry assigned checklists unless the office opts them in.
  const clocksIn = useClocksIn();
  const today = getToday();

  return useQuery({
    queryKey: ['checklist-gating', ctx?.org_id, user?.id, today, clocksIn],
    enabled: !!user && !!ctx,
    staleTime: 30_000,
    queryFn: async (): Promise<ChecklistGating> => {
      const empty: ChecklistGating = { ...EMPTY_GATING };
      if (!ctx || !user || !clocksIn) return empty;

      const { data: lists } = await supabase
        .from('checklists')
        .select('id, audience')
        .eq('org_id', ctx.org_id)
        .in('audience', audiencesFor(isAdmin));

      const listIds = (lists ?? []).map(l => l.id);
      if (!listIds.length) return empty;

      const { data: items } = await supabase
        .from('checklist_items')
        .select('id, title, per_person, owner_user_id, due_date, checklist_id')
        .eq('org_id', ctx.org_id)
        .in('checklist_id', listIds)
        .eq('cadence', 'daily')
        .eq('is_active', true);

      const { data: completions } = await supabase
        .from('checklist_completions')
        .select('item_id, completed_by, period_key')
        .in('item_id', (items ?? []).map(i => i.id));

      // One rule, shared with the server: src/lib/checklist-gating.ts
      return computeGating({
        lists: (lists ?? []).map(l => ({ id: l.id, audience: l.audience as string })),
        items: (items ?? []).map(i => ({
          id: i.id,
          title: i.title,
          per_person: !!i.per_person,
          owner_user_id: i.owner_user_id,
          due_date: i.due_date,
          checklist_id: i.checklist_id,
        })),
        completions: completions ?? [],
        userId: user.id,
        today,
        isAdmin,
        clocksIn,
      });
    },
  });
}
