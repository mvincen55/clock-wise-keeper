import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import { DEFAULT_BA_TEMPLATES, type BaTemplateSeed } from '@/lib/broken-appts/defaults';
import type { BaTemplate } from '@/lib/broken-appts/types';

// De-identified letter/reply templates only — bodies carry {{merge_field}}
// placeholders; patient values are merged in the browser and never reach
// this hook (see src/lib/broken-appts/types.ts for the HIPAA boundary).
// Follows the useFofTemplates pattern: admins seed the factory templates
// on first use; employees work from the same defaults in-memory until an
// admin's first visit persists them.

type TemplateRow = Tables<'broken_appt_templates'>;

function mapRow(row: TemplateRow): BaTemplate {
  return {
    id: row.id,
    kind: row.kind === 'reply' ? 'reply' : 'letter',
    code: row.code,
    title: row.title,
    body: row.body,
    sortOrder: row.sort_order,
  };
}

function seedToInsert(
  seed: BaTemplateSeed,
  orgId: string,
  userId?: string
): TablesInsert<'broken_appt_templates'> {
  return {
    org_id: orgId,
    kind: seed.kind,
    code: seed.code,
    title: seed.title,
    body: seed.body,
    sort_order: seed.sortOrder,
    created_by: userId ?? null,
  };
}

export function useBrokenApptTemplates() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: ['broken-appt-templates', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<BaTemplate[]> => {
      if (!ctx) return [];
      const { data, error } = await supabase
        .from('broken_appt_templates')
        .select('*')
        .eq('org_id', ctx.org_id)
        .order('kind')
        .order('sort_order');
      if (error) throw error;

      if (!data || data.length === 0) {
        if (!isAdmin) {
          return DEFAULT_BA_TEMPLATES.map((t, i) => ({ ...t, id: `default-${i}` }));
        }
        const inserts = DEFAULT_BA_TEMPLATES.map(t => seedToInsert(t, ctx.org_id, user?.id));
        const { data: seeded, error: seedError } = await supabase
          .from('broken_appt_templates')
          .insert(inserts)
          .select('*');
        if (seedError) throw seedError;
        return (seeded ?? []).map(mapRow);
      }
      return data.map(mapRow);
    },
  });
}

/** Deletes all templates for the org and re-inserts the factory defaults. */
export function useRestoreDefaultBrokenApptTemplates() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!ctx) throw new Error('Not authenticated');
      const { error: deleteError } = await supabase
        .from('broken_appt_templates')
        .delete()
        .eq('org_id', ctx.org_id);
      if (deleteError) throw deleteError;
      const inserts = DEFAULT_BA_TEMPLATES.map(t => seedToInsert(t, ctx.org_id, user?.id));
      const { error } = await supabase.from('broken_appt_templates').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broken-appt-templates'] }),
  });
}
