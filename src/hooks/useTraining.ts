import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { createNotification } from '@/hooks/useNotifications';

// Training Library — one central set of modules for the whole practice,
// plus who has been assigned what. Quiz answers stay private to the person
// who wrote them; managers only ever see score and pass/fail.

export type ModuleSource = 'pathfinder' | 'staff';
export type ModuleStatus = 'published' | 'draft' | 'archived';
export type LearningStyle = 'visual' | 'auditory' | 'reading' | 'kinesthetic' | 'mixed';

export type ModuleVisual = {
  kind: 'diagram' | 'board' | 'storyboard' | 'checklist';
  title: string;
  prompt: string;
  steps: string[];
};

export type AuditFinding = {
  severity: 'high' | 'medium' | 'low';
  where: string;
  issue: string;
  conflicts_with: string;
  fix: string;
};

export type ModuleAudit = {
  verdict: 'clear' | 'flagged' | 'unreviewed';
  summary: string;
  findings: AuditFinding[];
  audited_at?: string;
};
export type AssignmentStatus = 'assigned' | 'in_progress' | 'completed';

export type QuizQuestion = {
  q: string;
  options: string[];
  correct_index: number;
  why: string;
};

export type ModuleSection = {
  heading: string;
  body: string;
  try_it: string;
  visuals?: ModuleVisual[];
};

/** The one content shape every module follows. */
export type ModuleContent = {
  outcome: string;
  sections: ModuleSection[];
  recap: string;
  quiz: { questions: QuizQuestion[] } | null;
};

export type TrainingModule = {
  id: string;
  org_id: string;
  title: string;
  summary: string;
  audience_tags: string[];
  content: ModuleContent;
  source: ModuleSource;
  origin_goal_id: string | null;
  learning_style: LearningStyle | null;
  audit: ModuleAudit | null;
  status: ModuleStatus;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type TrainingAssignment = {
  id: string;
  org_id: string;
  module_id: string;
  assigned_to: string;
  assigned_by: string;
  due_date: string | null;
  status: AssignmentStatus;
  completed_at: string | null;
  created_at: string;
};

export type AttemptSummary = {
  id: string;
  org_id: string;
  module_id: string;
  user_id: string;
  score: number;
  passed: boolean;
  completed_at: string;
};

export const PASS_MARK = 80;

/** Defensive read — content is jsonb, so never assume the shape is intact. */
export function readContent(raw: unknown): ModuleContent {
  const c = (raw ?? {}) as Partial<ModuleContent>;
  return {
    outcome: typeof c.outcome === 'string' ? c.outcome : '',
    sections: Array.isArray(c.sections)
      ? c.sections.map(s => ({ ...s, visuals: Array.isArray(s?.visuals) ? s.visuals : [] }))
      : [],
    recap: typeof c.recap === 'string' ? c.recap : '',
    quiz:
      c.quiz && Array.isArray(c.quiz.questions) && c.quiz.questions.length > 0
        ? { questions: c.quiz.questions }
        : null,
  };
}

/** Every module the org can see, newest first. */
export function useTrainingModules() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['training-modules', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_modules')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('status', 'published')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(m => ({ ...m, content: readContent(m.content) })) as TrainingModule[];
    },
  });
}

/**
 * Assignments visible to me: my own always, plus the whole org when I'm an
 * owner or manager (RLS decides — we just ask for the org).
 */
export function useTrainingAssignments() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['training-assignments', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_assignments')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrainingAssignment[];
    },
  });
}

/** Score and pass/fail only — the answers themselves are never returned. */
export function useAttemptSummaries() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['training-attempts', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('training_attempt_summaries', {
        _org_id: ctx!.org_id,
      });
      if (error) throw error;
      return (data ?? []) as AttemptSummary[];
    },
  });
}

export function useCreateModule() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      summary: string;
      audience_tags: string[];
      content: ModuleContent;
    }) => {
      if (!ctx || !user) throw new Error('Not ready');
      const { data, error } = await supabase
        .from('training_modules')
        .insert({
          org_id: ctx.org_id,
          title: input.title,
          summary: input.summary,
          audience_tags: input.audience_tags,
          content: input.content as never,
          source: 'staff',
          created_by: user.id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-modules'] }),
  });
}

export function useArchiveModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (moduleId: string) => {
      const { error } = await supabase
        .from('training_modules')
        .update({ status: 'archived' })
        .eq('id', moduleId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-modules'] }),
  });
}

/** Assign a module to one or more people and tell each of them in-app. */
export function useAssignModule() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      module: Pick<TrainingModule, 'id' | 'title'>;
      userIds: string[];
      dueDate: string | null;
    }) => {
      if (!ctx || !user) throw new Error('Not ready');
      const rows = input.userIds.map(uid => ({
        org_id: ctx.org_id,
        module_id: input.module.id,
        assigned_to: uid,
        assigned_by: user.id,
        due_date: input.dueDate,
      }));
      // Re-assigning someone who already has it just refreshes the due date.
      const { error } = await supabase
        .from('training_assignments')
        .upsert(rows, { onConflict: 'module_id,assigned_to' });
      if (error) throw error;

      await Promise.all(
        input.userIds.map(uid =>
          createNotification({
            org_id: ctx.org_id,
            recipient_user_id: uid,
            actor_user_id: user.id,
            notification_type: 'training_assigned',
            title: 'New training assigned',
            message: input.dueDate
              ? `"${input.module.title}" — due ${input.dueDate}`
              : `"${input.module.title}" is ready for you`,
            related_table: 'training_modules',
            related_id: input.module.id,
          })
        )
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-assignments'] }),
  });
}

export function useUpdateAssignmentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: AssignmentStatus }) => {
      const { error } = await supabase
        .from('training_assignments')
        .update({
          status: input.status,
          completed_at: input.status === 'completed' ? new Date().toISOString() : null,
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-assignments'] }),
  });
}

export function useRecordAttempt() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      moduleId: string;
      score: number;
      passed: boolean;
      answers: number[];
    }) => {
      if (!ctx || !user) throw new Error('Not ready');
      const { error } = await supabase.from('training_attempts').insert({
        org_id: ctx.org_id,
        module_id: input.moduleId,
        user_id: user.id,
        score: input.score,
        passed: input.passed,
        answers: input.answers as never,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-attempts'] }),
  });
}

/** Ask Pathfinder to write a module grounded in how this office runs. */
export function useBuildModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      topic: string;
      audience: string[];
      learningStyle: LearningStyle;
    }) => {
      const { data, error } = await supabase.functions.invoke('training-builder', {
        body: {
          topic: input.topic,
          audience: input.audience,
          learning_style: input.learningStyle,
        },
      });
      if (error) throw new Error(data?.error || error.message);
      if (data?.error) throw new Error(data.error);
      return {
        module: { ...data.module, content: readContent(data.module.content) } as TrainingModule,
        audit: (data.audit ?? null) as ModuleAudit | null,
      };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-modules'] }),
  });
}

/** Modules the auditor held back — visible to owners/managers for review. */
export function useDraftModules() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['training-modules-draft', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_modules')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('status', 'draft')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(m => ({ ...m, content: readContent(m.content) })) as TrainingModule[];
    },
  });
}

/** Publish a module the auditor flagged, after a human has read the findings. */
export function usePublishModule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (moduleId: string) => {
      const { error } = await supabase
        .from('training_modules')
        .update({ status: 'published' })
        .eq('id', moduleId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-modules'] });
      qc.invalidateQueries({ queryKey: ['training-modules-draft'] });
    },
  });
}

/** Discard a flagged draft entirely. */
export function useDiscardDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (moduleId: string) => {
      const { error } = await supabase.from('training_modules').delete().eq('id', moduleId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-modules-draft'] }),
  });
}

/* ---------- Review queue (owners/managers) ---------- */

export type ModuleFinding = {
  id: string;
  module_id: string;
  fingerprint: string;
  severity: string;
  category: string;
  note: string;
  quote: string;
  suggested_fix: string;
  status: string;
};

/** Auditor findings for the drafts in the queue, keyed by module. */
export function useModuleFindings(moduleIds: string[]) {
  const { data: ctx } = useOrgContext();
  const key = [...moduleIds].sort().join(',');
  return useQuery({
    queryKey: ['training-findings', ctx?.org_id, key],
    enabled: !!ctx && moduleIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_audit_findings')
        .select('id, module_id, fingerprint, severity, category, note, quote, suggested_fix, status')
        .eq('org_id', ctx!.org_id)
        .in('module_id', moduleIds)
        .order('created_at', { ascending: false });
      if (error) throw error;
      const byModule = new Map<string, ModuleFinding[]>();
      for (const f of (data ?? []) as ModuleFinding[]) {
        byModule.set(f.module_id, [...(byModule.get(f.module_id) ?? []), f]);
      }
      return byModule;
    },
  });
}

/**
 * Approve (publish) or reject (archive) many drafts at once.
 * Reject archives rather than deletes so the audit trail survives.
 */
export function useBulkReviewModules() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, action }: { ids: string[]; action: 'approve' | 'reject' }) => {
      if (ids.length === 0) return 0;
      const { error } = await supabase
        .from('training_modules')
        .update({ status: action === 'approve' ? 'published' : 'archived' })
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['training-modules'] });
      qc.invalidateQueries({ queryKey: ['training-modules-draft'] });
      qc.invalidateQueries({ queryKey: ['training-findings'] });
    },
  });
}
