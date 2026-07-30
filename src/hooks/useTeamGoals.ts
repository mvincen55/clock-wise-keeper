import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

// Team sprints: one collective, reward-based push the whole office runs together.
// Never ranked, never per-person — the tally belongs to the team.

export type SprintPeriod = 'week' | 'month';
export type SprintStatus = 'active' | 'won' | 'missed' | 'cancelled';

export type TeamGoal = {
  id: string;
  org_id: string;
  title: string;
  metric: string;
  target_count: number;
  period: SprintPeriod;
  starts_on: string;
  ends_on: string;
  reward: string;
  progress: number;
  status: SprintStatus;
  created_by: string | null;
  ai_suggested: boolean;
  created_at: string;
};

export type SprintSuggestion = {
  id: string;
  content: string;
  created_at: string;
};

/** The sprint currently running (at most one at a time), plus the last few results. */
export function useTeamGoals() {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['team-goals', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('team_goals')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      const all = (data ?? []) as TeamGoal[];
      return {
        active: all.find(s => s.status === 'active') ?? null,
        past: all.filter(s => s.status !== 'active').slice(0, 3),
      };
    },
  });
}

/** Honour tally — any member can add to the count. */
export function useBumpSprint() {
  const qc = useQueryClient();
  const { data: ctx } = useOrgContext();
  const mutation = useMutation({
    mutationFn: async ({ id, by = 1 }: { id: string; by?: number }) => {
      const { data, error } = await supabase.rpc('bump_team_goal', {
        _goal_id: id,
        _amount: by,
      });
      if (error) throw error;
      return data as unknown as TeamGoal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-goals'] }),
  });
  return { ...mutation, isReady: !!ctx?.org_id };
}

export function useCreateSprint() {
  const { user } = useAuth();
  const { data: ctx, isLoading } = useOrgContext();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: {
      title: string;
      metric: string;
      target_count: number;
      period: SprintPeriod;
      starts_on: string;
      ends_on: string;
      reward: string;
      ai_suggested?: boolean;
    }) => {
      if (!user) throw new Error('Not signed in');
      if (!ctx) throw new Error('No office found for your account');
      const { data, error } = await supabase
        .from('team_goals')
        .insert({ ...input, org_id: ctx.org_id, created_by: user.id })
        .select('*')
        .single();
      if (error) throw error;
      return data as TeamGoal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-goals'] }),
  });

  return { ...mutation, isReady: !!user && !!ctx && !isLoading };
}

export function useCancelSprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('team_goals')
        .update({ status: 'cancelled' })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-goals'] }),
  });
}

/** The office AI's weekly sprint idea, if it had one worth offering. */
export function useSprintSuggestion() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['sprint-suggestion', ctx?.org_id, user?.id],
    enabled: !!ctx?.org_id && !!user?.id,
    queryFn: async (): Promise<SprintSuggestion | null> => {
      const { data, error } = await supabase
        .from('office_nudges')
        .select('id, content, created_at')
        .eq('org_id', ctx!.org_id)
        .eq('user_id', user!.id)
        .eq('kind', 'sprint_suggestion')
        .eq('status', 'open')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) return null; // Fails open — a missing idea is never an error.
      return (data as SprintSuggestion) ?? null;
    },
  });
}

/** Dismissing teaches the system to offer fewer of these. */
export function useDismissSuggestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('office_nudges')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sprint-suggestion'] }),
  });
}
