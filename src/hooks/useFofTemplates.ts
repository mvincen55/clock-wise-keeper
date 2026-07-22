import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import type { FofPracticeInfo, FofTemplate } from '@/lib/fof/types';
import {
  DEFAULT_PRACTICE_INFO,
  DEFAULT_TEMPLATES,
  type FofTemplateSeed,
} from '@/lib/fof/defaults';

// De-identified template configuration only — no patient data ever flows
// through this hook (see src/lib/fof/types.ts for the HIPAA boundary).

type TemplateRow = Tables<'fof_templates'>;
type SettingsRow = Tables<'fof_settings'>;

function mapTemplateRow(row: TemplateRow): FofTemplate {
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    // numeric(5,2) can arrive as a string via supabase-js
    discountPercent: Number(row.discount_percent),
    discountLabel: row.discount_label,
    showInsuranceEstimate: row.show_insurance_estimate,
    showWriteOff: row.show_write_off,
    showPrepayOption: row.show_prepay_option,
    showInstallmentOption: row.show_installment_option,
    installmentCount: row.installment_count,
    installmentLabels: Array.isArray(row.installment_labels)
      ? (row.installment_labels as string[])
      : [],
    validityNote: row.footnote_validity,
    prepayNote: row.footnote_prepay,
    insuranceNote: row.footnote_insurance,
    contactNote: row.footnote_contact,
    footnotes: Array.isArray(row.footnotes) ? (row.footnotes as string[]) : [],
    signatureIntro: row.signature_intro,
  };
}

function mapSettingsRow(row: SettingsRow): FofPracticeInfo {
  return {
    practiceName: row.practice_name,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    phone: row.phone,
  };
}

function seedToInsert(seed: FofTemplateSeed, orgId: string, userId?: string): TablesInsert<'fof_templates'> {
  return {
    org_id: orgId,
    name: seed.name,
    sort_order: seed.sortOrder,
    is_active: seed.isActive,
    discount_percent: seed.discountPercent,
    discount_label: seed.discountLabel,
    show_insurance_estimate: seed.showInsuranceEstimate,
    show_write_off: seed.showWriteOff,
    show_prepay_option: seed.showPrepayOption,
    show_installment_option: seed.showInstallmentOption,
    installment_count: seed.installmentCount,
    installment_labels: seed.installmentLabels,
    footnote_validity: seed.validityNote,
    footnote_prepay: seed.prepayNote,
    footnote_insurance: seed.insuranceNote,
    footnote_contact: seed.contactNote,
    footnotes: seed.footnotes,
    signature_intro: seed.signatureIntro,
    created_by: userId ?? null,
  };
}

export function useFofTemplates() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['fof-templates', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<FofTemplate[]> => {
      if (!ctx) return [];
      const { data, error } = await supabase
        .from('fof_templates')
        .select('*')
        .eq('org_id', ctx.org_id)
        .order('sort_order')
        .order('name');
      if (error) throw error;

      // First use for this org: seed the factory templates.
      if (!data || data.length === 0) {
        const inserts = DEFAULT_TEMPLATES.map(t => seedToInsert(t, ctx.org_id, user?.id));
        const { data: seeded, error: seedError } = await supabase
          .from('fof_templates')
          .insert(inserts)
          .select('*');
        if (seedError) throw seedError;
        return (seeded ?? []).map(mapTemplateRow);
      }
      return data.map(mapTemplateRow);
    },
  });
}

export function useFofSettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['fof-settings', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<FofPracticeInfo> => {
      if (!ctx) return DEFAULT_PRACTICE_INFO;
      const { data, error } = await supabase
        .from('fof_settings')
        .select('*')
        .eq('org_id', ctx.org_id)
        .maybeSingle();
      if (error) throw error;
      if (data) return mapSettingsRow(data);

      const { data: created, error: createError } = await supabase
        .from('fof_settings')
        .insert({ org_id: ctx.org_id })
        .select('*')
        .single();
      if (createError) throw createError;
      return mapSettingsRow(created);
    },
  });
}

export function useUpsertFofSettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<FofPracticeInfo>) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('fof_settings').upsert(
        {
          org_id: ctx.org_id,
          ...(updates.practiceName !== undefined && { practice_name: updates.practiceName }),
          ...(updates.addressLine1 !== undefined && { address_line1: updates.addressLine1 }),
          ...(updates.addressLine2 !== undefined && { address_line2: updates.addressLine2 }),
          ...(updates.phone !== undefined && { phone: updates.phone }),
        },
        { onConflict: 'org_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-settings'] }),
  });
}

export type FofTemplateUpsert = Omit<FofTemplate, 'id'> & { id?: string };

export function useUpsertFofTemplate() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (template: FofTemplateUpsert) => {
      if (!ctx) throw new Error('Not authenticated');
      const payload = {
        ...seedToInsert(template, ctx.org_id, user?.id),
        ...(template.id ? { id: template.id } : {}),
      };
      const { error } = await supabase.from('fof_templates').upsert(payload);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-templates'] }),
  });
}

export function useDeleteFofTemplate() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fof_templates').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-templates'] }),
  });
}

/** Deletes all templates for the org and re-inserts the factory defaults. */
export function useRestoreDefaultFofTemplates() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!ctx) throw new Error('Not authenticated');
      const { error: deleteError } = await supabase
        .from('fof_templates')
        .delete()
        .eq('org_id', ctx.org_id);
      if (deleteError) throw deleteError;
      const inserts = DEFAULT_TEMPLATES.map(t => seedToInsert(t, ctx.org_id, user?.id));
      const { error } = await supabase.from('fof_templates').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-templates'] }),
  });
}
