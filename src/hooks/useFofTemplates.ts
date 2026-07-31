import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables, TablesInsert } from '@/integrations/supabase/types';
import type { FofPracticeInfo, FofTemplate } from '@/lib/fof/types';
import {
  buildDefaultContactNote,
  DEFAULT_PRACTICE_INFO,
  DEFAULT_TEMPLATES,
  type FofTemplateSeed,
} from '@/lib/fof/defaults';

// De-identified template configuration only — no patient data ever flows
// through this hook (see src/lib/fof/types.ts for the HIPAA boundary).
//
// Practice identity (name, address, phone, website, logo) lives on
// org_branding; fof_settings keeps only FOF-specific fields (doctor_name).
// The identity columns still on fof_settings are deprecated and unread.

type TemplateRow = Tables<'fof_templates'>;
type BrandingRow = Tables<'org_branding'>;

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
    membershipDiscountPercent: row.membership_discount_percent,
    seniorDiscountApplies: row.senior_discount_applies,
  };
}

function toDoctorNames(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
  return [];
}

function composePracticeInfo(
  branding: BrandingRow | null,
  doctorName: string,
  membershipPlanName: string,
  doctorNames: string[]
): FofPracticeInfo {
  if (!branding) return { ...DEFAULT_PRACTICE_INFO, doctorName, membershipPlanName, doctorNames };
  return {
    practiceName: branding.legal_name,
    addressLine1: branding.address_line1,
    addressLine2: branding.address_line2,
    phone: branding.phone,
    website: branding.website,
    doctorName,
    logoUrl: branding.logo_url,
    membershipPlanName,
    doctorNames,
  };
}

/** The org's branding row (null when none exists yet). */
async function fetchBrandingRow(orgId: string): Promise<BrandingRow | null> {
  const { data, error } = await supabase
    .from('org_branding')
    .select('*')
    .eq('org_id', orgId)
    .maybeSingle();
  if (error) throw error;
  return data;
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
    membership_discount_percent: seed.membershipDiscountPercent,
    senior_discount_applies: seed.seniorDiscountApplies,
    created_by: userId ?? null,
  };
}

export function useFofTemplates() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

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

      // First use for this org: admins seed the factory templates.
      // fof_templates is admin-write, so an employee who gets here first
      // works from the same defaults in-memory until an admin's first
      // visit persists them.
      if (!data || data.length === 0) {
        if (!isAdmin) {
          return DEFAULT_TEMPLATES.map((t, i) => ({ ...t, id: `default-${i}` }));
        }
        // Contact wording carries the org's own identity, interpolated
        // from org_branding at seed time.
        const branding = await fetchBrandingRow(ctx.org_id);
        const contactNote = buildDefaultContactNote({
          practiceName: branding?.legal_name ?? '',
          addressLine1: branding?.address_line1 ?? '',
          addressLine2: branding?.address_line2 ?? '',
          phone: branding?.phone ?? '',
        });
        const inserts = DEFAULT_TEMPLATES.map(t =>
          seedToInsert({ ...t, contactNote }, ctx.org_id, user?.id)
        );
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
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: ['fof-settings', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<FofPracticeInfo> => {
      if (!ctx) return DEFAULT_PRACTICE_INFO;
      const [branding, settingsResult] = await Promise.all([
        fetchBrandingRow(ctx.org_id),
        supabase
          .from('fof_settings')
          .select('doctor_name, membership_plan_name, doctor_names')
          .eq('org_id', ctx.org_id)
          .maybeSingle(),
      ]);
      if (settingsResult.error) throw settingsResult.error;
      if (settingsResult.data) {
        return composePracticeInfo(
          branding,
          settingsResult.data.doctor_name,
          settingsResult.data.membership_plan_name ?? 'Membership',
          toDoctorNames(settingsResult.data.doctor_names)
        );
      }

      // fof_settings is admin-write; employees print with the defaults
      // until an admin's first visit creates the row.
      if (!isAdmin) return composePracticeInfo(branding, '', 'Membership', []);
      const { data: created, error: createError } = await supabase
        .from('fof_settings')
        .insert({ org_id: ctx.org_id })
        .select('doctor_name, membership_plan_name')
        .single();
      if (createError) throw createError;
      return composePracticeInfo(
        branding,
        created.doctor_name,
        created.membership_plan_name ?? 'Membership',
        []
      );
    },
  });
}

export function useUpsertFofSettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<FofPracticeInfo>) => {
      if (!ctx) throw new Error('Not authenticated');
      // Identity fields live on org_branding; fof_settings keeps only
      // the FOF-specific doctor name.
      const brandingPatch = {
        ...(updates.practiceName !== undefined && { legal_name: updates.practiceName }),
        ...(updates.addressLine1 !== undefined && { address_line1: updates.addressLine1 }),
        ...(updates.addressLine2 !== undefined && { address_line2: updates.addressLine2 }),
        ...(updates.phone !== undefined && { phone: updates.phone }),
        ...(updates.website !== undefined && { website: updates.website }),
        ...(updates.logoUrl !== undefined && { logo_url: updates.logoUrl }),
      };
      if (Object.keys(brandingPatch).length > 0) {
        const { error } = await supabase
          .from('org_branding')
          .upsert({ org_id: ctx.org_id, ...brandingPatch }, { onConflict: 'org_id' });
        if (error) throw error;
      }
      if (updates.doctorName !== undefined) {
        const { error } = await supabase
          .from('fof_settings')
          .upsert({ org_id: ctx.org_id, doctor_name: updates.doctorName }, { onConflict: 'org_id' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fof-settings'] });
      qc.invalidateQueries({ queryKey: ['org-branding'] });
    },
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
      const branding = await fetchBrandingRow(ctx.org_id);
      const contactNote = buildDefaultContactNote({
        practiceName: branding?.legal_name ?? '',
        addressLine1: branding?.address_line1 ?? '',
        addressLine2: branding?.address_line2 ?? '',
        phone: branding?.phone ?? '',
      });
      const inserts = DEFAULT_TEMPLATES.map(t =>
        seedToInsert({ ...t, contactNote }, ctx.org_id, user?.id)
      );
      const { error } = await supabase.from('fof_templates').insert(inserts);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-templates'] }),
  });
}
