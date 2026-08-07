import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { letterDb, type LetterTemplateRow } from '@/lib/letters/db';
import type { LetterCategory, LetterTemplate, LetterTemplateContent } from '@/lib/letters/types';

/**
 * The saved office letter library — REUSABLE WORDING ONLY, never a
 * completed letter. The save path takes LetterTemplateContent, which has no
 * recipient/patient fields by construction, and callers must run the
 * patient-identifier scan + confirmation dialog before ever reaching these
 * mutations (see SaveTemplateDialog). RLS additionally gates team-tier
 * writes behind the office's team_can_manage_templates setting.
 */

function mapRow(row: LetterTemplateRow): LetterTemplate {
  return {
    id: row.id,
    title: row.title,
    category: row.category as LetterCategory,
    subject: row.subject,
    body: row.body,
    closing: row.closing,
    status: row.status as LetterTemplate['status'],
    version: row.version,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function useLetterTemplates() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['letter-templates', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<LetterTemplate[]> => {
      const { data, error } = await letterDb
        .from('letter_templates')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

function useInvalidateTemplates() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['letter-templates'] });
}

export function useCreateLetterTemplate() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateTemplates();

  return useMutation({
    mutationFn: async (content: LetterTemplateContent): Promise<string> => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { data, error } = await letterDb
        .from('letter_templates')
        .insert({
          org_id: ctx.org_id,
          title: content.title.trim(),
          category: content.category,
          subject: content.subject.trim(),
          body: content.body,
          closing: content.closing.trim(),
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data!.id;
    },
    onSuccess: invalidate,
  });
}

export function useUpdateLetterTemplate() {
  const { user } = useAuth();
  const invalidate = useInvalidateTemplates();

  return useMutation({
    mutationFn: async (input: { id: string; content: LetterTemplateContent; version: number }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await letterDb
        .from('letter_templates')
        .update({
          title: input.content.title.trim(),
          category: input.content.category,
          subject: input.content.subject.trim(),
          body: input.content.body,
          closing: input.content.closing.trim(),
          version: input.version + 1,
          updated_by: user.id,
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useSetLetterTemplateStatus() {
  const { user } = useAuth();
  const invalidate = useInvalidateTemplates();

  return useMutation({
    mutationFn: async (input: { id: string; status: 'active' | 'archived' }) => {
      if (!user) throw new Error('Not signed in');
      const { error } = await letterDb
        .from('letter_templates')
        .update({ status: input.status, updated_by: user.id })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });
}

export function useDuplicateLetterTemplate() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateTemplates();

  return useMutation({
    mutationFn: async (template: LetterTemplate): Promise<string> => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { data, error } = await letterDb
        .from('letter_templates')
        .insert({
          org_id: ctx.org_id,
          title: `${template.title} (copy)`,
          category: template.category,
          subject: template.subject,
          body: template.body,
          closing: template.closing,
          created_by: user.id,
          updated_by: user.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data!.id;
    },
    onSuccess: invalidate,
  });
}
