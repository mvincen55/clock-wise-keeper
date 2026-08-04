import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import {
  DEFAULT_BA_TEMPLATES,
  RETIRED_LETTER_CODES,
  type BaTemplateSeed,
} from '@/lib/broken-appts/defaults';
import type { BaTemplate } from '@/lib/broken-appts/types';

// De-identified letter/reply/snippet templates only — bodies carry
// {{merge_field}} placeholders; patient values are merged in the browser
// and never reach this hook (see src/lib/broken-appts/types.ts for the
// HIPAA boundary). Follows the useFofTemplates pattern: admins seed the
// factory templates on first use; employees work from the same defaults
// in-memory until an admin's first visit persists them. Orgs seeded under
// the draft letter codes are topped up the same way — the draft rows are
// retired (no letters were ever issued under them) and the current factory
// set fills in.

type TemplateRow = Tables<'broken_appt_templates'>;

function mapRow(row: TemplateRow): BaTemplate {
  return {
    id: row.id,
    kind: row.kind === 'reply' || row.kind === 'snippet' ? row.kind : 'letter',
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

      const rows = (data ?? [])
        .map(mapRow)
        .filter(r => !(r.kind === 'letter' && RETIRED_LETTER_CODES.includes(r.code)));
      const missing = DEFAULT_BA_TEMPLATES.filter(
        d => !rows.some(r => r.kind === d.kind && r.code === d.code)
      );
      if (missing.length === 0) return rows;

      if (!isAdmin) {
        // Employees work from the factory content in-memory until an
        // admin's visit persists it.
        return [...rows, ...missing.map((t, i) => ({ ...t, id: `default-${i}` }))];
      }

      // Retire draft-code rows (0001–0005 replaced them 1:1; none were
      // ever issued), then persist whatever factory content is missing.
      if ((data ?? []).some(r => RETIRED_LETTER_CODES.includes(r.code))) {
        const { error: retireError } = await supabase
          .from('broken_appt_templates')
          .delete()
          .eq('org_id', ctx.org_id)
          .in('code', RETIRED_LETTER_CODES);
        if (retireError) throw retireError;
      }
      const inserts = missing.map(t => seedToInsert(t, ctx.org_id, user?.id));
      const { data: seeded, error: seedError } = await supabase
        .from('broken_appt_templates')
        .insert(inserts)
        .select('*');
      if (seedError) throw seedError;
      return [...rows, ...(seeded ?? []).map(mapRow)];
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
