import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Json } from '@/integrations/supabase/types';

// The assistant's standing knowledge and the auditor's findings.
// De-identified business configuration only — never patient data.

/** 'office' = practice facts; 'site' = facts about this app. */
export type MemoryKind = 'office' | 'site';
/** 'pending' = contradicts something already known, awaiting a decision. */
export type MemoryStatus = 'active' | 'pending' | 'superseded';

export interface AssistantMemory {
  id: string;
  kind: MemoryKind;
  content: string;
  status: MemoryStatus;
  /** The memory this one would replace if accepted. */
  supersedesId: string | null;
  conflictNote: string;
  createdAt: string;
}

export type FindingKind =
  | 'memory_contradiction'
  | 'note_misfiled'
  | 'code_fact_in_memory'
  | 'other';

export interface AuditFinding {
  id: string;
  kind: FindingKind;
  severity: 'high' | 'medium' | 'low';
  title: string;
  detail: string;
  suggestedAction: Json | null;
  memoryId: string | null;
  createdAt: string;
}

/** A note the office has written about a procedure code. */
export interface CodeNote {
  itemId: string;
  code: string;
  description: string;
  notes: string;
  scheduleId: string;
  scheduleName: string;
  scheduleKind: string;
  /** Office notes apply to every patient; carrier notes to that plan only. */
  isUniversal: boolean;
}

export function useAssistantMemories() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['assistant-memories', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<AssistantMemory[]> => {
      const { data, error } = await supabase
        .from('assistant_memories')
        .select('id, kind, content, status, supersedes_id, conflict_note, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(row => ({
        id: row.id,
        kind: (row.kind as MemoryKind) ?? 'office',
        content: row.content,
        status: (row.status as MemoryStatus) ?? 'active',
        supersedesId: row.supersedes_id,
        conflictNote: row.conflict_note ?? '',
        createdAt: row.created_at,
      }));
    },
  });
}

export function useAuditFindings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['assistant-audit-findings', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<AuditFinding[]> => {
      const { data, error } = await supabase
        .from('assistant_audit_findings')
        .select('id, kind, severity, title, detail, suggested_action, memory_id, created_at')
        .eq('status', 'open')
        .order('severity')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(row => ({
        id: row.id,
        kind: (row.kind as FindingKind) ?? 'other',
        severity: (row.severity as AuditFinding['severity']) ?? 'medium',
        title: row.title,
        detail: row.detail ?? '',
        suggestedAction: row.suggested_action,
        memoryId: row.memory_id,
        createdAt: row.created_at,
      }));
    },
  });
}

/**
 * Every note written about every code, both universal (office schedule)
 * and insurance-specific — what the manager sees while training.
 */
export function useCodeNotes() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['assistant-code-notes', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<CodeNote[]> => {
      const { data, error } = await supabase
        .from('fee_schedule_items')
        .select('id, code, description, notes, schedule_id, fee_schedules!inner(name, kind)')
        .neq('notes', '')
        .order('code');
      if (error) throw error;
      type Row = {
        id: string;
        code: string;
        description: string | null;
        notes: string | null;
        schedule_id: string;
        fee_schedules: { name: string; kind: string } | { name: string; kind: string }[] | null;
      };
      return ((data ?? []) as Row[])
        .map(row => {
          const schedule = Array.isArray(row.fee_schedules) ? row.fee_schedules[0] : row.fee_schedules;
          const kind = schedule?.kind ?? 'carrier';
          return {
            itemId: row.id,
            code: row.code,
            description: row.description ?? '',
            notes: row.notes ?? '',
            scheduleId: row.schedule_id,
            scheduleName: schedule?.name ?? 'Unnamed schedule',
            scheduleKind: kind,
            isUniversal: kind === 'office',
          };
        })
        .filter(n => n.notes.trim() !== '')
        // Universal guidance first, then per-carrier, each by code.
        .sort((a, b) =>
          a.isUniversal === b.isUniversal
            ? a.code.localeCompare(b.code) || a.scheduleName.localeCompare(b.scheduleName)
            : a.isUniversal
              ? -1
              : 1
        );
    },
  });
}

export interface CodeKnowledge {
  /** Standing FOF wording rules — global, they shape every code's wording. */
  wordingRules: string[];
  /** This same code's notes on OTHER schedules, so nothing is invisible. */
  elsewhere: { scheduleName: string; isUniversal: boolean; notes: string }[];
}

/**
 * What the assistant already follows for one code — surfaced while editing
 * it, so knowledge is never invisible at the place you'd look for it.
 *
 * Two sources, because a code's guidance can live in either: standing
 * wording rules (global, taught through FOF training) and notes on the
 * same code under a different schedule (e.g. the Delta Dental row while
 * you're editing the office row).
 */
export function useCodeKnowledge(code: string, currentScheduleId: string | null) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const trimmed = code.trim().toUpperCase();

  return useQuery({
    queryKey: ['code-knowledge', ctx?.org_id, trimmed, currentScheduleId],
    enabled: !!user && !!ctx && trimmed !== '',
    queryFn: async (): Promise<CodeKnowledge> => {
      const [rulesRes, notesRes] = await Promise.all([
        supabase
          .from('fof_ai_guidance')
          .select('content')
          .eq('is_active', true)
          .order('created_at'),
        supabase
          .from('fee_schedule_items')
          .select('notes, schedule_id, fee_schedules!inner(name, kind)')
          .eq('code', trimmed)
          .neq('notes', ''),
      ]);
      if (rulesRes.error) throw rulesRes.error;
      if (notesRes.error) throw notesRes.error;

      type NoteRow = {
        notes: string | null;
        schedule_id: string;
        fee_schedules: { name: string; kind: string } | { name: string; kind: string }[] | null;
      };
      const elsewhere = ((notesRes.data ?? []) as NoteRow[])
        .filter(row => row.schedule_id !== currentScheduleId)
        .map(row => {
          const schedule = Array.isArray(row.fee_schedules) ? row.fee_schedules[0] : row.fee_schedules;
          return {
            scheduleName: schedule?.name ?? 'Unnamed schedule',
            isUniversal: (schedule?.kind ?? 'carrier') === 'office',
            notes: (row.notes ?? '').trim(),
          };
        })
        .filter(n => n.notes !== '');

      return {
        wordingRules: (rulesRes.data ?? []).map(r => r.content).filter(Boolean),
        elsewhere,
      };
    },
  });
}

/** Accept a pending fact (replacing what it contradicts) or reject it. */
export function useResolveMemoryConflict() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({
      memory,
      decision,
    }: {
      memory: AssistantMemory;
      decision: 'accept' | 'reject';
    }) => {
      if (decision === 'accept') {
        // The new fact becomes current; the one it contradicts is retired
        // so both can never be in play at once.
        const { error } = await supabase
          .from('assistant_memories')
          .update({ status: 'active', conflict_note: '' })
          .eq('id', memory.id);
        if (error) throw error;
        if (memory.supersedesId) {
          const { error: supersedeError } = await supabase
            .from('assistant_memories')
            .update({ status: 'superseded', is_active: false })
            .eq('id', memory.supersedesId);
          if (supersedeError) throw supersedeError;
        }
      } else {
        const { error } = await supabase
          .from('assistant_memories')
          .update({ is_active: false })
          .eq('id', memory.id);
        if (error) throw error;
      }
      // Clear any finding raised for this conflict.
      await supabase
        .from('assistant_audit_findings')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('memory_id', memory.id)
        .eq('status', 'open');
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assistant-memories'] });
      qc.invalidateQueries({ queryKey: ['assistant-audit-findings'] });
    },
  });
}

export function useForgetMemory() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('assistant_memories')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistant-memories'] }),
  });
}

export function useRunAudit() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('assistant-auditor', { body: {} });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as {
        checked: { memories: number; codeNotes: number };
        found: number;
        recorded: number;
        openTotal: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assistant-audit-findings'] });
      qc.invalidateQueries({ queryKey: ['assistant-memories'] });
    },
  });
}

export function useDismissFinding() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('assistant_audit_findings')
        .update({ status: 'dismissed', resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assistant-audit-findings'] }),
  });
}

/**
 * Apply a finding's suggested fix. Only 'move_note' is applied
 * automatically, and only because its destination is unambiguous: general
 * guidance stranded on a carrier belongs on the office schedule. Moving
 * the other way needs a human to say WHICH insurance, so that stays a
 * manual edit on the Fee Schedules page.
 */
export function useApplyFinding() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (finding: AuditFinding) => {
      const action = finding.suggestedAction as {
        type?: string;
        code?: string;
        note?: string;
        from_schedule_id?: string;
        to_schedule_id?: string;
      } | null;
      if (!action || action.type !== 'move_note') {
        throw new Error('That finding has no automatic fix — open the Fee Schedules page to sort it out.');
      }
      const { code, note, from_schedule_id: fromId, to_schedule_id: toId } = action;
      if (!code || !note || !fromId || !toId) throw new Error('This finding is missing details to apply.');

      const { data: target, error: targetError } = await supabase
        .from('fee_schedule_items')
        .select('id, notes')
        .eq('schedule_id', toId)
        .eq('code', code)
        .maybeSingle();
      if (targetError) throw targetError;
      if (!target) {
        throw new Error(
          `${code} isn't on the office fee schedule yet, so there's no row to move the note to. Add the code there first.`
        );
      }

      const existing = (target.notes ?? '').trim();
      const merged = existing ? `${existing}\n${note}` : note;
      const { error: writeError } = await supabase
        .from('fee_schedule_items')
        .update({ notes: merged })
        .eq('id', target.id);
      if (writeError) throw writeError;

      // Only clear the source once the destination write succeeded, so a
      // failure can never lose the note.
      const { data: source, error: sourceError } = await supabase
        .from('fee_schedule_items')
        .select('id, notes')
        .eq('schedule_id', fromId)
        .eq('code', code)
        .maybeSingle();
      if (sourceError) throw sourceError;
      if (source) {
        const remaining = (source.notes ?? '')
          .split('\n')
          .filter(line => line.trim() !== note.trim())
          .join('\n')
          .trim();
        const { error: clearError } = await supabase
          .from('fee_schedule_items')
          .update({ notes: remaining })
          .eq('id', source.id);
        if (clearError) throw clearError;
      }

      const { error: resolveError } = await supabase
        .from('assistant_audit_findings')
        .update({ status: 'resolved', resolved_at: new Date().toISOString() })
        .eq('id', finding.id);
      if (resolveError) throw resolveError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['assistant-audit-findings'] });
      qc.invalidateQueries({ queryKey: ['assistant-code-notes'] });
      qc.invalidateQueries({ queryKey: ['fee-schedule-items'] });
    },
  });
}
