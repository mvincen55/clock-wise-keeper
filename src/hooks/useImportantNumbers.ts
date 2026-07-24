import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';

// Office contact directory (the breakroom "Important Numbers" sheet).
// Business config only — member read, owner/manager write (RLS enforced).

export type ImportantNumber = Tables<'important_numbers'>;

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

export interface ImportantNumberUpsert {
  id?: string;
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
