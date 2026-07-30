import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  archived_at?: string | null;
  archived_reason?: string | null;
};

/** Accountability trail: every reasoned edit, archive, or replacement. */
export type GoalEventType = 'edited' | 'archived' | 'replaced';

export type GoalEvent = {
  id: string;
  org_id: string;
  goal_id: string;
  actor_id: string;
  type: GoalEventType;
  reason: string;
  old_title: string;
  new_title: string | null;
  created_at: string;
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
  training_module_id?: string | null;
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

/**
 * Goal changes for a month, including events on goals that were archived
 * (those goals are hidden from the cards but the change is still reported).
 */
export function useGoalEvents(month: string) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['goal-events', ctx?.org_id, month],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goal_events')
        .select('*, goals!inner(month, user_id, visibility)')
        .eq('org_id', ctx!.org_id)
        .eq('goals.month', month)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as (GoalEvent & {
        goals: { month: string; user_id: string; visibility: GoalVisibility };
      })[];
    },
  });
}

/**
 * Edit my own goal. A goal that has already been shared with the team needs a
 * short reason, and that reason is recorded for everyone to see.
 */
export function useEditGoal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      goal: Goal;
      title: string;
      description: string | null;
      reason?: string;
    }) => {
      if (!user) throw new Error('Not signed in');
      const { goal, title, description, reason } = input;
      const { error } = await supabase
        .from('goals')
        .update({ title, description })
        .eq('id', goal.id);
      if (error) throw error;
      if (reason && reason.trim()) {
        const { error: evError } = await supabase.from('goal_events').insert({
          org_id: goal.org_id,
          goal_id: goal.id,
          actor_id: user.id,
          type: 'edited',
          reason: reason.trim(),
          old_title: goal.title,
          new_title: title,
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

/** Never a hard delete — archive with a reason, always recorded. */
export function useArchiveGoal() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ goal, reason }: { goal: Goal; reason: string }) => {
      if (!user) throw new Error('Not signed in');
      const clean = reason.trim();
      if (!clean) throw new Error('A reason is required');
      const { error } = await supabase
        .from('goals')
        .update({
          status: 'archived',
          archived_at: new Date().toISOString(),
          archived_reason: clean,
        })
        .eq('id', goal.id);
      if (error) throw error;
      const { data, error: evError } = await supabase
        .from('goal_events')
        .insert({
          org_id: goal.org_id,
          goal_id: goal.id,
          actor_id: user.id,
          type: 'archived',
          reason: clean,
          old_title: goal.title,
        })
        .select('id')
        .single();
      if (evError) throw evError;
      return data.id as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] });
      qc.invalidateQueries({ queryKey: ['goal-events'] });
    },
  });
}

/** Once the replacement goal exists, the archive event becomes a replacement. */
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

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string } & Partial<Goal>) => {
      const { error } = await supabase.from('goals').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals'] }),
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
      tasks: { title: string; due_date: string | null }[];
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
      const { data, error } = await supabase
        .from('goal_tasks')
        .insert(
          tasks.map((t, i) => ({
            org_id: ctx.org_id,
            goal_id: goalId,
            title: t.title,
            due_date: t.due_date,
            sort_order: base + i,
          }))
        )
        .select('id, sort_order');
      if (error) throw error;
      // Same order the caller passed them in — lets the caller attach a
      // training module to a specific step.
      return (data ?? []).sort((a, b) => a.sort_order - b.sort_order) as {
        id: string;
        sort_order: number;
      }[];
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
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ title, dueDate }: { title: string; dueDate: string | null }) => {
      if (!ctx) throw new Error('No office found for your account');
      let listId: string | undefined;
      const { data: list } = await supabase
        .from('checklists')
        .select('id')
        .eq('org_id', ctx.org_id)
        .eq('name', 'My Goal Steps')
        .limit(1)
        .maybeSingle();
      if (list) listId = list.id;
      else {
        const { data: created, error } = await supabase
          .from('checklists')
          .insert({ org_id: ctx.org_id, name: 'My Goal Steps', audience: 'all', sort_order: 900 })
          .select('id')
          .single();
        if (error) throw error;
        listId = created.id;
      }
      const label = dueDate ? `${title} (due ${dueDate})` : title;
      const { error: itemError } = await supabase.from('checklist_items').insert({
        org_id: ctx.org_id,
        checklist_id: listId,
        title: label,
        cadence: 'daily',
        per_person: true,
        sort_order: 0,
      });
      if (itemError) throw itemError;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists'] }),
  });
}

/** Pathfinder calls. */
export async function callPathfinder(payload: {
  mode: 'breakdown' | 'draft_update' | 'polish_goal' | 'chat' | 'build_resource';
  goalId?: string;
  quickNotes?: string;
  title?: string;
  description?: string;
  month?: string;
  message?: string;
  topic?: string;
  taskId?: string;
}) {
  const { data, error } = await supabase.functions.invoke('goal-assistant', { body: payload });
  if (error) throw new Error('Pathfinder is unavailable right now');
  if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
  return data as {
    tasks?: { title: string; due_date: string | null }[];
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
    intro?: string;
    meeting_date?: string | null;
    resource?: { topic: string; attach_to_step: number } | null;
    module?: { id: string; title: string };
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
