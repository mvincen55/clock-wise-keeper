import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

// Team sprints: a scoped, reward-based push the office AI runs end to end.
// Never ranked, never per-person leaderboards — the tally belongs to the scope.

export type SprintPeriod = 'week' | 'month';
export type SprintStatus = 'active' | 'pending_verification' | 'won' | 'missed' | 'cancelled';
export type SprintScope = 'team' | 'department' | 'individual' | 'role';
export type SprintDepartment = 'clinical' | 'clerical';
export type SprintVerification = 'honor' | 'manager_approval' | 'document';

export type SprintVerdict = {
  supported: boolean;
  found_count: number | null;
  where: string;
  reasoning: string;
};

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
  scope: SprintScope;
  scope_department: SprintDepartment | null;
  scope_user_id: string | null;
  scope_role: string | null;
  category: string | null;
  verification: SprintVerification;
  verified_by: string | null;
  verified_at: string | null;
  verification_note: string | null;
  verification_doc_path: string | null;
  ai_verdict: SprintVerdict | null;
  override_reason: string | null;
  created_by: string | null;
  ai_suggested: boolean;
  created_at: string;
};

export type SprintSuggestion = {
  id: string;
  content: string;
  created_at: string;
};

/** Sprints this member is allowed to see (RLS handles the scoping). */
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
        .limit(20);
      if (error) throw error;
      const all = (data ?? []) as unknown as TeamGoal[];
      const live = all.filter(s => s.status === 'active' || s.status === 'pending_verification');
      return {
        active: live[0] ?? null,
        live,
        past: all.filter(s => !live.includes(s)).slice(0, 3),
      };
    },
  });
}

/** Honour tally — members can only add to honour-verified sprints in their scope. */
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
      scope: SprintScope;
      scope_department?: SprintDepartment | null;
      scope_user_id?: string | null;
      scope_role?: string | null;
      category?: string | null;
      verification: SprintVerification;
      ai_suggested?: boolean;
    }) => {
      if (!user) throw new Error('Not signed in');
      if (!ctx) throw new Error('No office found for your account');
      const { data, error } = await supabase
        .from('team_goals')
        .insert({
          ...input,
          scope_department: input.scope === 'department' ? input.scope_department ?? null : null,
          scope_user_id: input.scope === 'individual' ? input.scope_user_id ?? null : null,
          scope_role: input.scope === 'role' ? input.scope_role ?? null : null,
          category: input.category ?? null,
          org_id: ctx.org_id,
          created_by: user.id,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as unknown as TeamGoal;
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

/** Upload the outside report the document verdict will be read from. */
export function useUploadSprintDoc() {
  const { data: ctx } = useOrgContext();
  return useMutation({
    mutationFn: async ({ goalId, file }: { goalId: string; file: File }) => {
      if (!ctx) throw new Error('No office found for your account');
      const ext = file.name.split('.').pop() ?? 'bin';
      const path = `${ctx.org_id}/${goalId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('sprint-verification')
        .upload(path, file, { contentType: file.type || undefined, upsert: false });
      if (error) throw error;
      return path;
    },
  });
}

/**
 * The recorded decision: approve, decline, an AI document read, or a human
 * override of that read. Humans outrank the document reader.
 */
export function useVerifySprint() {
  const qc = useQueryClient();
  const { data: ctx } = useOrgContext();

  const mutation = useMutation({
    mutationFn: async (input: {
      goalId: string;
      action: 'approve' | 'decline' | 'document' | 'override';
      note?: string;
      doc_path?: string;
      result?: 'won' | 'missed';
    }) => {
      const { data, error } = await supabase.functions.invoke('sprint-verify', {
        body: {
          goal_id: input.goalId,
          action: input.action,
          note: input.note,
          doc_path: input.doc_path,
          result: input.result,
        },
      });
      if (error) throw new Error(data?.error ?? error.message);
      if (data?.error) throw new Error(data.error);
      return data as { sprint: TeamGoal; verdict?: SprintVerdict; overridden?: boolean };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team-goals'] }),
  });

  return { ...mutation, isReady: !!ctx?.org_id };
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
        .in('status', ['new', 'shown'])
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
