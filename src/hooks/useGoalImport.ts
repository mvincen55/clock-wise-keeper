import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { PlannedGoal } from '@/lib/goal-csv';

export type ImportOutcome = {
  created: number;
  steps: number;
  failed: { title: string; owner: string; message: string }[];
};

/** Creates goals + their steps from a parsed CSV plan, one goal at a time. */
export function useImportGoalsCsv() {
  const { user } = useAuth();
  const { data: ctx, isLoading } = useOrgContext();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (plan: PlannedGoal[]): Promise<ImportOutcome> => {
      if (!user || !ctx) throw new Error('Not ready');
      const out: ImportOutcome = { created: 0, steps: 0, failed: [] };

      for (const g of plan) {
        if (!g.ownerUserId || !g.target.trim()) {
          out.failed.push({
            title: g.title,
            owner: g.owner,
            message: g.problems.join(' ') || 'Missing details.',
          });
          continue;
        }
        const { data: goal, error } = await supabase
          .from('goals')
          .insert({
            org_id: ctx.org_id,
            user_id: g.ownerUserId,
            title: g.title,
            smart_target: g.target,
            month: g.month,
            visibility: g.visibility,
            created_by: user.id,
          })
          .select('id')
          .single();

        if (error || !goal) {
          out.failed.push({ title: g.title, owner: g.owner, message: error?.message ?? 'Failed.' });
          continue;
        }
        out.created++;

        if (g.steps.length > 0) {
          const { error: stepErr } = await supabase.from('goal_tasks').insert(
            g.steps.map((s, i) => ({
              org_id: ctx.org_id,
              goal_id: goal.id,
              title: s.title,
              due_date: s.due_date,
              sort_order: i,
            }))
          );
          if (stepErr) {
            out.failed.push({
              title: g.title,
              owner: g.owner,
              message: `Goal created, steps failed: ${stepErr.message}`,
            });
          } else {
            out.steps += g.steps.length;
          }
        }
      }
      return out;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });

  return { ...mutation, isReady: !!user && !!ctx && !isLoading };
}
