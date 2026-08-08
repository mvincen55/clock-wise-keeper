import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { SprintDepartment, SprintPeriod, SprintScope, SprintVerification } from '@/hooks/useTeamGoals';

// The sprint architect: on-demand, grounded sprint suggestions for managers.
// All the intelligence lives server-side (sprint-architect edge function);
// this hook just carries the audience, the manager's optional direction, and
// the shuffle-exclusion list across the wire.

export type SprintIdea = {
  title: string;
  goal: string;
  metric: string;
  target: number;
  period: SprintPeriod;
  verification: SprintVerification;
  reward: string;
  why: string;
  category: string;
};

export type SprintConcern = {
  headline: string;
  detail: string;
  receipts: string[];
};

export type SprintAudience = {
  scope: SprintScope;
  scope_role?: string | null;
  scope_department?: SprintDepartment | null;
};

export type SprintIdeasResult = {
  suggestions: SprintIdea[];
  concern: SprintConcern | null;
  audience: { label: string; size: number };
};

export function useSprintIdeas() {
  const { data: ctx } = useOrgContext();

  const mutation = useMutation({
    mutationFn: async (input: {
      audience: SprintAudience;
      direction?: string;
      exclude?: string[];
    }): Promise<SprintIdeasResult> => {
      const { data, error } = await supabase.functions.invoke('sprint-architect', {
        body: {
          action: 'ideas',
          scope: input.audience.scope,
          scope_role: input.audience.scope_role ?? undefined,
          scope_department: input.audience.scope_department ?? undefined,
          direction: input.direction?.trim() || undefined,
          exclude: input.exclude ?? [],
        },
      });
      if (error) throw new Error(data?.error ?? error.message);
      if (data?.error) throw new Error(data.error);
      return {
        suggestions: Array.isArray(data?.suggestions) ? data.suggestions : [],
        concern: data?.concern ?? null,
        audience: data?.audience ?? { label: '', size: 0 },
      };
    },
  });

  return { ...mutation, isReady: !!ctx?.org_id };
}

export function useRewardIdeas() {
  return useMutation({
    mutationFn: async (input: {
      audience: SprintAudience;
      sprintTitle?: string;
    }): Promise<string[]> => {
      const { data, error } = await supabase.functions.invoke('sprint-architect', {
        body: {
          action: 'rewards',
          scope: input.audience.scope,
          scope_role: input.audience.scope_role ?? undefined,
          scope_department: input.audience.scope_department ?? undefined,
          sprint_title: input.sprintTitle,
        },
      });
      if (error) throw new Error(data?.error ?? error.message);
      if (data?.error) throw new Error(data.error);
      return Array.isArray(data?.rewards) ? data.rewards : [];
    },
  });
}
