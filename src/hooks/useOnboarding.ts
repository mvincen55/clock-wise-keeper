import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { PRIVACY_TERMS_DOCUMENT } from '@/lib/privacy-terms';

// Onboarding: the four things a new member does before the app opens.
// Managers only ever see whether each step is done — never the answers.

export type OnboardingProgress = {
  id: string;
  org_id: string;
  user_id: string;
  terms_done_at: string | null;
  work_style_done_at: string | null;
  basics_done_at: string | null;
  goal_done_at: string | null;
  completed_at: string | null;
};

export type OnboardingStep = 'terms' | 'work_style' | 'basics' | 'goal';

const STEP_COLUMN: Record<OnboardingStep, keyof OnboardingProgress> = {
  terms: 'terms_done_at',
  work_style: 'work_style_done_at',
  basics: 'basics_done_at',
  goal: 'goal_done_at',
};

/** Where the current member is in onboarding, and whether they still need to sign. */
export function useOnboardingStatus() {
  const { user } = useAuth();
  const { data: ctx, isLoading: ctxLoading } = useOrgContext();

  const query = useQuery({
    queryKey: ['onboarding', ctx?.org_id, user?.id],
    enabled: !!ctx?.org_id && !!user?.id,
    staleTime: 60_000,
    queryFn: async () => {
      const [progressRes, ackRes] = await Promise.all([
        supabase
          .from('member_onboarding')
          .select('*')
          .eq('org_id', ctx!.org_id)
          .eq('user_id', user!.id)
          .maybeSingle(),
        supabase
          .from('policy_acknowledgments')
          .select('id, document, signed_name, signed_at')
          .eq('user_id', user!.id)
          .eq('document', PRIVACY_TERMS_DOCUMENT)
          .maybeSingle(),
      ]);

      const progress = (progressRes.data ?? null) as OnboardingProgress | null;
      const ack = ackRes.data ?? null;
      // A version bump invalidates the old signature — sign again, once.
      const termsSigned = !!ack;
      const complete =
        termsSigned &&
        !!progress?.work_style_done_at &&
        !!progress?.basics_done_at &&
        !!progress?.goal_done_at;

      return { progress, ack, termsSigned, complete };
    },
  });

  return {
    ...query,
    // Never gate on a loading state — a slow query must not lock anyone out.
    isReady: !ctxLoading && !query.isLoading,
    hasOrg: !!ctx,
  };
}

/** Marks one step done, creating the row on first use. */
export function useCompleteStep() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (step: OnboardingStep) => {
      if (!user || !ctx) throw new Error('No office found for your account');
      const now = new Date().toISOString();
      const { data: existing } = await supabase
        .from('member_onboarding')
        .select('*')
        .eq('org_id', ctx.org_id)
        .eq('user_id', user.id)
        .maybeSingle();

      const merged = {
        ...(existing ?? {}),
        org_id: ctx.org_id,
        user_id: user.id,
        [STEP_COLUMN[step]]: now,
      } as Record<string, unknown>;

      merged.completed_at =
        merged.terms_done_at && merged.work_style_done_at && merged.basics_done_at && merged.goal_done_at
          ? now
          : null;

      const { error } = existing
        ? await supabase.from('member_onboarding').update(merged).eq('id', existing.id)
        : await supabase.from('member_onboarding').insert(merged as never);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  });
}

/** The typed-name signature on the current terms version. */
export function useSignTerms() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const completeStep = useCompleteStep();

  const mutation = useMutation({
    mutationFn: async (signedName: string) => {
      if (!user || !ctx) throw new Error('No office found for your account');
      const { error } = await supabase.from('policy_acknowledgments').insert({
        org_id: ctx.org_id,
        user_id: user.id,
        document: PRIVACY_TERMS_DOCUMENT,
        signed_name: signedName.trim(),
      });
      if (error && error.code !== '23505') throw error; // Already signed is fine.
      await completeStep.mutateAsync('terms');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['onboarding'] }),
  });

  return { ...mutation, isReady: !!user && !!ctx };
}

/**
 * The stealth "get to know you" rankings (private to the member, always) plus
 * the fun favorites, which live on the employee record on purpose — a manager
 * can only say thank you well if they know what someone actually likes.
 */
export function useSaveWorkStyle() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const completeStep = useCompleteStep();

  const mutation = useMutation({
    mutationFn: async (input: {
      answers: Record<string, string>;
      favorites?: Record<string, string>;
    }) => {
      const { answers, favorites } = input;
      if (!user || !ctx) throw new Error('No office found for your account');
      const { data: existing } = await supabase
        .from('work_style_profiles')
        .select('id')
        .eq('org_id', ctx.org_id)
        .eq('user_id', user.id)
        .maybeSingle();

      const { error } = existing
        ? await supabase.from('work_style_profiles').update({ answers }).eq('id', existing.id)
        : await supabase
            .from('work_style_profiles')
            .insert({ org_id: ctx.org_id, user_id: user.id, answers });
      if (error) throw error;

      // Learning style quietly informs how training is written — never surfaced.
      // With rankings, the top choice is the one that counts.
      const employeePatch: Record<string, unknown> = {};
      const topLearning = (answers.learning ?? '').split(',').filter(Boolean)[0];
      if (topLearning) employeePatch.learning_style = topLearning;
      if (favorites) {
        const cleaned = Object.fromEntries(
          Object.entries(favorites)
            .map(([k, v]) => [k, v.trim()])
            .filter(([, v]) => v),
        );
        employeePatch.favorites = cleaned;
      }
      if (Object.keys(employeePatch).length) {
        await supabase.from('employees').update(employeePatch).eq('id', ctx.employee_id);
      }
      await completeStep.mutateAsync('work_style');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      qc.invalidateQueries({ queryKey: ['org-employees'] });
    },
  });

  return { ...mutation, isReady: !!user && !!ctx };
}


/** Every tag ever issued in this office — current and archived, forever. */
export function useTagRegistry() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['employee-tags', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employee_tags')
        .select('tag, employee_id, display_name')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** "Megan Vincent" -> "MV". Falls back to the first letters of one name. */
export function suggestTag(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  const letters =
    parts.length === 1
      ? parts[0].slice(0, 2)
      : `${parts[0][0]}${parts[parts.length - 1][0]}`;
  return letters.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** First free variant of a suggestion (MV, MV2, MV3…). */
export function freeTag(base: string, taken: Set<string>): string {
  const clean = base.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'XX';
  if (!taken.has(clean)) return clean;
  for (let i = 2; i < 100; i++) {
    const candidate = `${clean.slice(0, 4 - String(i).length)}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return clean;
}

export const TAG_PATTERN = /^[A-Z0-9]{2,4}$/;

/** Preferred name, team, and the report tag. */
export function useSaveBasics() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const completeStep = useCompleteStep();

  const mutation = useMutation({
    mutationFn: async (input: {
      employeeId?: string;
      preferred_name?: string;
      team?: string;
      tag?: string;
      /** Onboarding marks the step; manager edits from Team do not. */
      markStep?: boolean;
    }) => {
      const id = input.employeeId ?? ctx?.employee_id;
      if (!id) throw new Error('No employee record found');
      const patch: Record<string, unknown> = {};
      if (input.preferred_name !== undefined) patch.preferred_name = input.preferred_name.trim() || null;
      if (input.team !== undefined) patch.team = input.team;
      if (input.tag !== undefined) patch.tag = input.tag.toUpperCase().trim() || null;

      const { error } = await supabase.from('employees').update(patch).eq('id', id);
      if (error) {
        if (error.code === '23505' || /already retired/i.test(error.message)) {
          throw new Error('That tag is already taken by someone in this office — pick another.');
        }
        throw error;
      }
      if (input.markStep) await completeStep.mutateAsync('basics');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['onboarding'] });
      qc.invalidateQueries({ queryKey: ['org-employees'] });
      qc.invalidateQueries({ queryKey: ['employee-tags'] });
    },
  });

  return { ...mutation, isReady: !!ctx };
}

/** Manager view: who has finished onboarding and who has signed the terms. */
export function useTeamOnboardingStatus() {
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: ['team-onboarding', ctx?.org_id],
    enabled: !!ctx?.org_id && isAdmin,
    queryFn: async () => {
      const [progress, acks] = await Promise.all([
        supabase
          .from('member_onboarding')
          .select('user_id, terms_done_at, work_style_done_at, basics_done_at, goal_done_at, completed_at')
          .eq('org_id', ctx!.org_id),
        supabase
          .from('policy_acknowledgments')
          .select('user_id, document, signed_at')
          .eq('org_id', ctx!.org_id)
          .eq('document', PRIVACY_TERMS_DOCUMENT),
      ]);
      const signed = new Map((acks.data ?? []).map(a => [a.user_id, a.signed_at]));
      return (progress.data ?? []).map(p => ({
        user_id: p.user_id,
        complete: !!p.completed_at,
        steps: {
          terms: !!signed.get(p.user_id),
          work_style: !!p.work_style_done_at,
          basics: !!p.basics_done_at,
          goal: !!p.goal_done_at,
        },
        signed_at: signed.get(p.user_id) ?? null,
      }));
    },
  });
}
