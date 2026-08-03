import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';

// Goals: one encouraging, self-chosen monthly goal per person.
// Not a scoreboard — progress is only "tasks done / total", never ranked.

export type GoalVisibility = 'team' | 'private';
export type GoalStatus = 'active' | 'completed' | 'archived';
export type UpdateStatus = 'on_track' | 'at_risk' | 'done';

export type Goal = {
  id: string;
  org_id: string;
  user_id: string;
  title: string;
  description: string | null;
  /** Short measurable target, e.g. "4 feedback asks". Optional — never a gate. */
  smart_target: string | null;
  month: string;
  visibility: GoalVisibility;
  status: GoalStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type GoalTask = {
  id: string;
  org_id: string;
  goal_id: string;
  title: string;
  due_date: string | null;
  done: boolean;
  done_at: string | null;
  sort_order: number;
  training_module_id: string | null;
};

export type GoalUpdate = {
  id: string;
  org_id: string;
  goal_id: string;
  author_id: string;
  status: UpdateStatus;
  content: string;
  auto_drafted: boolean;
  created_at: string;
};

export const UPDATE_STATUS_LABELS: Record<UpdateStatus, string> = {
  on_track: 'On track',
  at_risk: 'At risk',
  done: 'Done',
};

/** Current month key, Eastern ("YYYY-MM"). */
export function currentMonth(): string {
  return getToday().slice(0, 7);
}

export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** Every goal visible to me for a month, with its tasks and updates. */
export function useGoalsMonth(month: string) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['goals', ctx?.org_id, month],
    enabled: !!user && !!ctx,
    queryFn: async () => {
      const { data: goals, error } = await supabase
        .from('goals')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('month', month)
        .neq('status', 'archived')
        .order('created_at');
      if (error) throw error;
      const ids = (goals ?? []).map(g => g.id);
      if (ids.length === 0) {
        return { goals: [] as Goal[], tasks: [] as GoalTask[], updates: [] as GoalUpdate[] };
      }
      const [tasksRes, updatesRes] = await Promise.all([
        supabase.from('goal_tasks').select('*').in('goal_id', ids).order('sort_order'),
        supabase
          .from('goal_updates')
          .select('*')
          .in('goal_id', ids)
          .order('created_at', { ascending: false }),
      ]);
      if (tasksRes.error) throw tasksRes.error;
      if (updatesRes.error) throw updatesRes.error;
      return {
        goals: (goals ?? []) as Goal[],
        tasks: (tasksRes.data ?? []) as GoalTask[],
        updates: (updatesRes.data ?? []) as GoalUpdate[],
      };
    },
  });
}

/** Active team members — the card grid is one card per person. */
export function useActiveTeam() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['goals-team', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('employees')
        .select('id, user_id, display_name')
        .eq('org_id', ctx!.org_id)
        .eq('employment_status', 'active')
        .order('display_name');
      if (error) throw error;
      return (data ?? []).filter(e => !!e.user_id) as {
        id: string;
        user_id: string;
        display_name: string;
      }[];
    },
  });
}

export function useCreateGoal() {
  const { user } = useAuth();
  const { data: ctx, isLoading } = useOrgContext();
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: {
      title: string;
      description?: string;
      smartTarget?: string | null;
      month: string;
      visibility?: GoalVisibility;
      /** Managers can set a private goal WITH a member. */
      forUserId?: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      if (!ctx) throw new Error('No office found for your account');
      const { data, error } = await supabase
        .from('goals')
        .insert({
          org_id: ctx.org_id,
          user_id: input.forUserId ?? user.id,
          title: input.title,
          description: input.description ?? null,
          smart_target: input.smartTarget ?? null,
          month: input.month,
          visibility: input.visibility ?? 'team',
          created_by: user.id,
        })
        .select('*')
        .single();
      if (error) throw error;
      return data as Goal;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });

  return { ...mutation, isReady: !!user && !!ctx && !isLoading };
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Goal>) => {
      const { error } = await supabase.from('goals').update(patch).eq('id', id);
      if (error) throw error;
      return patch;
    },
    onSuccess: (patch) => {
      // Calm acknowledgement, not a celebration.
      if (patch?.status === 'completed') {
        toast('Goal marked complete', {
          description: patch.title ?? 'Nice work closing this one out.',
          duration: 5000,
        });
      }
      qc.invalidateQueries({ queryKey: ['goals'] });
    },
  });
}

export function useSaveGoalTasks() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      goalId,
      tasks,
    }: {
      goalId: string;
      tasks: { title: string; due_date: string | null; training_module_id?: string | null }[];
    }) => {
      if (!ctx) throw new Error('No office found for your account');
      const { data: existing } = await supabase
        .from('goal_tasks')
        .select('sort_order')
        .eq('goal_id', goalId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      const base = (existing?.sort_order ?? -1) + 1;
      const { error } = await supabase.from('goal_tasks').insert(
        tasks.map((t, i) => ({
          org_id: ctx.org_id,
          goal_id: goalId,
          title: t.title,
          due_date: t.due_date,
          training_module_id: t.training_module_id ?? null,
          sort_order: base + i,
        }))
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useToggleGoalTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('goal_tasks')
        .update({ done, done_at: done ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

export function useAddGoalUpdate() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      goalId: string;
      status: UpdateStatus;
      content: string;
      autoDrafted: boolean;
    }) => {
      if (!user || !ctx) throw new Error('Not ready');
      const { error } = await supabase.from('goal_updates').insert({
        org_id: ctx.org_id,
        goal_id: input.goalId,
        author_id: user.id,
        status: input.status,
        content: input.content,
        auto_drafted: input.autoDrafted,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
  });
}

/**
 * "Add to my checklist" — mirrors an accepted goal task into the office
 * checklist system under a per-person "My Goal Steps" list.
 */
export function useAddTaskToChecklist() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, dueDate }: { title: string; dueDate: string | null }) => {
      if (!ctx || !user) throw new Error('No office found for your account');
      // These are personal items: the list and the item belong to this member,
      // which is also what the checklist policies require of a non-admin.
      let listId: string | undefined;
      const { data: list } = await supabase
        .from('checklists')
        .select('id')
        .eq('org_id', ctx.org_id)
        .eq('name', 'My Goal Steps')
        .eq('owner_user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (list) listId = list.id;
      else {
        const { data: created, error } = await supabase
          .from('checklists')
          .insert({
            org_id: ctx.org_id,
            name: 'My Goal Steps',
            audience: 'all',
            sort_order: 900,
            owner_user_id: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        listId = created.id;
      }
      const { error: itemError } = await supabase.from('checklist_items').insert({
        org_id: ctx.org_id,
        checklist_id: listId,
        title,
        cadence: 'daily',
        per_person: true,
        sort_order: 0,
        owner_user_id: user.id,
        due_date: dueDate,
      });
      if (itemError) throw itemError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklists'] });
      qc.invalidateQueries({ queryKey: ['checklist-gating'] });
    },
  });
}

// ---- Goal edit / archive with accountability (never silently) ----

export type GoalEvent = {
  id: string;
  org_id: string;
  goal_id: string;
  actor_id: string;
  type: 'edited' | 'archived' | 'replaced';
  reason: string;
  old_title: string;
  new_title: string | null;
  created_at: string;
};

/** Change history for the goals of a month — powers "Changes since last meeting". */
export function useGoalEvents(month: string) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['goal-events', ctx?.org_id, month],
    enabled: !!ctx,
    queryFn: async (): Promise<GoalEvent[]> => {
      const { data: monthGoals } = await supabase
        .from('goals')
        .select('id')
        .eq('org_id', ctx!.org_id)
        .eq('month', month);
      const ids = (monthGoals ?? []).map(g => g.id);
      if (!ids.length) return [];
      const { data, error } = await supabase
        .from('goal_events')
        .select('*')
        .in('goal_id', ids)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as GoalEvent[];
    },
  });
}

/**
 * Edit my own goal. Once the goal has been shared (it has updates), the change
 * needs a reason — and the reason is recorded, never silently applied.
 */
export function useEditGoal() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      goal: Goal;
      title: string;
      description: string | null;
      smartTarget: string | null;
      reason: string | null;
      requiresReason: boolean;
    }) => {
      if (!user || !ctx) throw new Error('Not ready');
      const reason = input.reason?.trim() || '';
      if (input.requiresReason && !reason) {
        throw new Error('Please say what changed and why — this goal has already been shared.');
      }
      const { error } = await supabase
        .from('goals')
        .update({
          title: input.title.trim(),
          description: input.description?.trim() || null,
          smart_target: input.smartTarget?.trim() || null,
        })
        .eq('id', input.goal.id);
      if (error) throw error;

      if (input.title.trim() !== input.goal.title || reason) {
        const { error: evError } = await supabase.from('goal_events').insert({
          org_id: ctx.org_id,
          goal_id: input.goal.id,
          actor_id: user.id,
          type: 'edited',
          reason: reason || 'no reason needed — not shared yet',
          old_title: input.goal.title,
          new_title: input.title.trim(),
        });
        if (evError) throw evError;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goal-events'] });
    },
  });
}

/** Archive (never delete) my own goal, with a reason on the record. */
export function useArchiveGoal() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal, reason }: { goal: Goal; reason: string }) => {
      if (!user || !ctx) throw new Error('Not ready');
      const clean = reason.trim();
      if (!clean) throw new Error('A reason is required before archiving a goal.');
      const { error } = await supabase
        .from('goals')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          archived_reason: clean,
        })
        .eq('id', goal.id);
      if (error) throw error;
      const { data: event, error: evError } = await supabase
        .from('goal_events')
        .insert({
          org_id: ctx.org_id,
          goal_id: goal.id,
          actor_id: user.id,
          type: 'archived',
          reason: clean,
          old_title: goal.title,
        })
        .select('id')
        .single();
      if (evError) throw evError;
      return event.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goal-events'] });
    },
  });
}

/** Once the successor goal exists, close the loop: archived → replaced by …. */
export function useLinkReplacement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ eventId, newTitle }: { eventId: string; newTitle: string }) => {
      const { error } = await supabase
        .from('goal_events')
        .update({ type: 'replaced', new_title: newTitle })
        .eq('id', eventId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goal-events'] }),
  });
}


/** Pathfinder calls. */
export async function callPathfinder(payload: {
  mode: 'breakdown' | 'draft_update' | 'polish_goal' | 'chat';
  goalId?: string;
  quickNotes?: string;
  title?: string;
  description?: string;
  month?: string;
  message?: string;
}) {
  const { data, error } = await supabase.functions.invoke('goal-assistant', { body: payload });
  if (error) throw new Error('Pathfinder is unavailable right now');
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as {
    tasks?: { title: string; due_date: string | null; training_module_id?: string | null }[];
    intro?: string;
    module?: { id: string; title: string } | null;
    content?: string;
    status?: UpdateStatus;
    title?: string;
    original?: string;
    target?: string | null;
    smart?: {
      specific: string;
      measurable: string;
      achievable: string;
      relevant: string;
      time_bound: string;
    };
    reply?: string;
  };
}

/* ---------- Pathfinder conversation (per goal, owner only) ---------- */

export type GoalMessage = {
  id: string;
  goal_id: string;
  author: 'member' | 'pathfinder';
  content: string;
  created_at: string;
};

export function useGoalMessages(goalId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['goal-messages', goalId],
    enabled: enabled && !!goalId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goal_messages')
        .select('id, goal_id, author, content, created_at')
        .eq('goal_id', goalId)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as GoalMessage[];
    },
  });
}

export function useSendPathfinderMessage(goalId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (message: string) => {
      const result = await callPathfinder({ mode: 'chat', goalId, message });
      return result.reply ?? '';
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goal-messages', goalId] }),
  });
}

/* ---------- Progress helpers ---------- */

/** Fraction (0-1) of the month that has elapsed, Eastern. */
export function monthElapsedFraction(month: string): number {
  const today = getToday();
  const [y, m] = month.split('-').map(Number);
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const monthOfToday = today.slice(0, 7);
  if (monthOfToday > month) return 1;
  if (monthOfToday < month) return 0;
  return Math.min(1, Number(today.slice(8, 10)) / days);
}
