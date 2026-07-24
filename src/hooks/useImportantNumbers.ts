import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';

// Office contact directory (the breakroom "Important Numbers" sheet).
// Business config only — member read, owner/manager write (RLS enforced).

export type ImportantNumber = Tables<'important_numbers'>;
export type ImportantNumberTab = Tables<'important_number_tabs'>;

/** Fallback when an org has no tab rows yet (pre-seed). */
export const DEFAULT_TABS = ['Office', 'Team', 'Referrals', 'Labs', 'Insurance Companies', 'Other'];

// Section names from the office's existing sheet; the section field stays
// free text, these just power the suggestions when adding entries.
export const SUGGESTED_SECTIONS = [
  'Practice IDs',
  'NPI Numbers',
  'DEA Numbers',
  'License Numbers',
  'Doctor Phones',
  'Team Members',
  'Vendors',
  'Labs',
  'Delivery',
  'Insurance Companies',
  'Oral Surgery',
  'Orthodontists',
  'Periodontists',
  'Endodontists',
  'Other',
];

export function useImportantNumbers() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['important-numbers', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<ImportantNumber[]> => {
      const { data, error } = await supabase
        .from('important_numbers')
        .select('*')
        .order('section')
        .order('sort_order')
        .order('label');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useImportantNumberTabs() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['important-number-tabs', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<ImportantNumberTab[]> => {
      const { data, error } = await supabase
        .from('important_number_tabs')
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Rename a tab (managers) — entries under the old name follow along. */
export function useRenameImportantNumberTab() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, oldName, newName }: { id: string; oldName: string; newName: string }) => {
      if (!ctx) throw new Error('Not authenticated');
      const name = newName.trim();
      if (!name) throw new Error('Tab name cannot be empty');
      const { error } = await supabase.from('important_number_tabs').update({ name }).eq('id', id);
      if (error) throw error;
      const { error: moveError } = await supabase
        .from('important_numbers')
        .update({ tab: name })
        .eq('org_id', ctx.org_id)
        .eq('tab', oldName);
      if (moveError) throw moveError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['important-number-tabs'] });
      qc.invalidateQueries({ queryKey: ['important-numbers'] });
    },
  });
}

export interface ImportantNumberUpsert {
  id?: string;
  tab: string;
  section: string;
  label: string;
  value: string;
  notes: string;
}

export function useUpsertImportantNumber() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (entry: ImportantNumberUpsert) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('important_numbers').upsert({
        ...(entry.id ? { id: entry.id } : {}),
        org_id: ctx.org_id,
        tab: entry.tab.trim() || 'Other',
        section: entry.section.trim(),
        label: entry.label.trim(),
        value: entry.value.trim(),
        notes: entry.notes.trim(),
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['important-numbers'] }),
  });
}

/** Team members: notes are the only thing they may change. */
export function useUpdateImportantNumberNotes() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { error } = await supabase
        .from('important_numbers')
        .update({ notes: notes.trim() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['important-numbers'] }),
  });
}

export function useDeleteImportantNumber() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('important_numbers').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['important-numbers'] }),
  });
}
