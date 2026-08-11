import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { SprintDepartment, SprintPeriod, SprintScope, SprintVerification } from '@/hooks/useTeamGoals';

// The sprint architect: on-demand, grounded sprint suggestions for managers.
// All the intelligence lives server-side (sprint-architect edge function);
// this hook just carries the audience, the manager's optional direction, and
// the shuffle-exclusion list across the wire.

/** How a sprint audience reads on cards and badges — plural, team-flavoured. */
export const SPRINT_ROLE_LABELS: Record<string, string> = {
  dentist: 'Doctors',
  hygienist: 'Hygienists',
  dental_assistant: 'Dental assistants',
  front_desk: 'Front desk',
  treatment_coordinator: 'Treatment coordinators',
  office_manager: 'Managers',
  assistant_office_manager: 'Assistant office managers',
  sterilization: 'Sterilization',
  floater: 'Floaters',
  other: 'Other roles',
};

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

/**
 * Invoke the architect and surface ITS error message. On a non-2xx response
 * supabase-js hands back a generic FunctionsHttpError with the real JSON body
 * hidden on `context` — without this unwrap every failure reads as
 * "Edge Function returned a non-2xx status code".
 */
async function invokeArchitect(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('sprint-architect', { body });
  if (error) {
    let message = error.message;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const parsed = await ctx.json();
        if (parsed?.error) message = parsed.error;
      } catch {
        // keep the generic message
      }
    }
    throw new Error(message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function useSprintIdeas() {
  const { data: ctx } = useOrgContext();

  const mutation = useMutation({
    mutationFn: async (input: {
      audience: SprintAudience;
      direction?: string;
      exclude?: string[];
    }): Promise<SprintIdeasResult> => {
      const data = await invokeArchitect({
        action: 'ideas',
        scope: input.audience.scope,
        scope_role: input.audience.scope_role ?? undefined,
        scope_department: input.audience.scope_department ?? undefined,
        direction: input.direction?.trim() || undefined,
        exclude: input.exclude ?? [],
      });
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
      const data = await invokeArchitect({
        action: 'rewards',
        scope: input.audience.scope,
        scope_role: input.audience.scope_role ?? undefined,
        scope_department: input.audience.scope_department ?? undefined,
        sprint_title: input.sprintTitle,
      });
      return Array.isArray(data?.rewards) ? data.rewards : [];
    },
  });
}
