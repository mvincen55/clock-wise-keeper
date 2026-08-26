import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useMyPermissionGrants } from '@/hooks/useEmployeePermissions';
import { hasGrant } from '@/lib/permissions';
import type { Tables } from '@/integrations/supabase/types';
import {
  GENERIC_FRONT_DESK_TEMPLATE,
  shouldSeedTemplates,
} from '@/lib/onboarding-template-defaults';
import { moveInList } from '@/lib/onboarding-order';

/**
 * Onboarding templates — the builder's data layer. Templates are org
 * content (RLS: members read; admins + 'manage_onboarding' grantees write).
 * Instances snapshot a template at start, so nothing here can rewrite an
 * onboarding already underway.
 */

export type OnboardingTemplate = Tables<'onboarding_templates'>;
export type OnboardingSection = Tables<'onboarding_template_sections'>;
export type OnboardingItem = Tables<'onboarding_template_items'>;

export interface TemplateDetail {
  template: OnboardingTemplate;
  sections: OnboardingSection[];
  items: OnboardingItem[];
}

/** UI gate mirroring can_manage_onboarding() — RLS is the enforcement. */
export function useCanManageOnboarding(): boolean {
  const { data: ctx } = useOrgContext();
  const grants = useMyPermissionGrants();
  return ctx?.role === 'owner' || ctx?.role === 'manager' || hasGrant(grants, 'manage_onboarding');
}

export function useOnboardingTemplates() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['onboarding-templates', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async (): Promise<OnboardingTemplate[]> => {
      const { data, error } = await supabase
        .from('onboarding_templates')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useOnboardingTemplate(templateId: string | undefined) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['onboarding-template', templateId],
    enabled: !!ctx && !!templateId,
    queryFn: async (): Promise<TemplateDetail | null> => {
      const [tpl, sections, items] = await Promise.all([
        supabase.from('onboarding_templates').select('*').eq('id', templateId!).maybeSingle(),
        supabase
          .from('onboarding_template_sections')
          .select('*')
          .eq('template_id', templateId!)
          .order('sort_order'),
        supabase
          .from('onboarding_template_items')
          .select('*')
          .eq('template_id', templateId!)
          .order('sort_order'),
      ]);
      if (tpl.error) throw tpl.error;
      if (sections.error) throw sections.error;
      if (items.error) throw items.error;
      if (!tpl.data) return null;
      return { template: tpl.data, sections: sections.data ?? [], items: items.data ?? [] };
    },
  });
}

function useInvalidateTemplates() {
  const qc = useQueryClient();
  return (templateId?: string) => {
    qc.invalidateQueries({ queryKey: ['onboarding-templates'] });
    if (templateId) qc.invalidateQueries({ queryKey: ['onboarding-template', templateId] });
  };
}

export function useCreateTemplate() {
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({ name, roleLabel }: { name: string; roleLabel: string }) => {
      const { data, error } = await supabase
        .from('onboarding_templates')
        .insert({
          org_id: ctx!.org_id,
          name: name.trim(),
          role_label: roleLabel.trim(),
          created_by: ctx!.user_id,
        })
        .select('id')
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => invalidate(),
  });
}

export function useUpdateTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({
      templateId,
      patch,
    }: {
      templateId: string;
      patch: Partial<Pick<OnboardingTemplate, 'name' | 'role_label' | 'is_active'>>;
    }) => {
      const { error } = await supabase
        .from('onboarding_templates')
        .update(patch)
        .eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: (_d, { templateId }) => invalidate(templateId),
  });
}

export function useDeleteTemplate() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({ templateId }: { templateId: string }) => {
      const { error } = await supabase.from('onboarding_templates').delete().eq('id', templateId);
      if (error) throw error;
    },
    onSuccess: () => invalidate(),
  });
}

/**
 * Duplicate a template as the starting point for another role — full copy of
 * sections and items with fresh ids.
 */
export function useDuplicateTemplate() {
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({ templateId }: { templateId: string }) => {
      const [tpl, sections, items] = await Promise.all([
        supabase.from('onboarding_templates').select('*').eq('id', templateId).single(),
        supabase
          .from('onboarding_template_sections')
          .select('*')
          .eq('template_id', templateId)
          .order('sort_order'),
        supabase
          .from('onboarding_template_items')
          .select('*')
          .eq('template_id', templateId)
          .order('sort_order'),
      ]);
      if (tpl.error) throw tpl.error;
      if (sections.error) throw sections.error;
      if (items.error) throw items.error;

      const { data: created, error: createError } = await supabase
        .from('onboarding_templates')
        .insert({
          org_id: ctx!.org_id,
          name: `${tpl.data.name} (copy)`,
          role_label: tpl.data.role_label,
          created_by: ctx!.user_id,
        })
        .select('id')
        .single();
      if (createError) throw createError;

      const sectionIdMap = new Map<string, string>();
      for (const s of sections.data ?? []) {
        const { data: ns, error } = await supabase
          .from('onboarding_template_sections')
          .insert({
            org_id: ctx!.org_id,
            template_id: created.id,
            title: s.title,
            sort_order: s.sort_order,
          })
          .select('id')
          .single();
        if (error) throw error;
        sectionIdMap.set(s.id, ns.id as string);
      }

      const itemRows = (items.data ?? [])
        .filter(i => sectionIdMap.has(i.section_id))
        .map(i => ({
          org_id: ctx!.org_id,
          template_id: created.id,
          section_id: sectionIdMap.get(i.section_id)!,
          title: i.title,
          detail: i.detail,
          sort_order: i.sort_order,
        }));
      if (itemRows.length) {
        const { error } = await supabase.from('onboarding_template_items').insert(itemRows);
        if (error) throw error;
      }
      return created.id as string;
    },
    onSuccess: () => invalidate(),
  });
}

export function useAddSection() {
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({
      templateId,
      title,
      sortOrder,
    }: {
      templateId: string;
      title: string;
      sortOrder: number;
    }) => {
      const { error } = await supabase.from('onboarding_template_sections').insert({
        org_id: ctx!.org_id,
        template_id: templateId,
        title: title.trim(),
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { templateId }) => invalidate(templateId),
  });
}

export function useUpdateSection() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({
      sectionId,
      patch,
    }: {
      sectionId: string;
      templateId: string;
      patch: Partial<Pick<OnboardingSection, 'title' | 'sort_order'>>;
    }) => {
      const { error } = await supabase
        .from('onboarding_template_sections')
        .update(patch)
        .eq('id', sectionId);
      if (error) throw error;
    },
    onSuccess: (_d, { templateId }) => invalidate(templateId),
  });
}

export function useDeleteSection() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({ sectionId }: { sectionId: string; templateId: string }) => {
      const { error } = await supabase
        .from('onboarding_template_sections')
        .delete()
        .eq('id', sectionId);
      if (error) throw error;
    },
    onSuccess: (_d, { templateId }) => invalidate(templateId),
  });
}

export function useAddItem() {
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({
      templateId,
      sectionId,
      title,
      detail,
      sortOrder,
    }: {
      templateId: string;
      sectionId: string;
      title: string;
      detail: string;
      sortOrder: number;
    }) => {
      const { error } = await supabase.from('onboarding_template_items').insert({
        org_id: ctx!.org_id,
        template_id: templateId,
        section_id: sectionId,
        title: title.trim(),
        detail: detail.trim(),
        sort_order: sortOrder,
      });
      if (error) throw error;
    },
    onSuccess: (_d, { templateId }) => invalidate(templateId),
  });
}

export function useUpdateItem() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({
      itemId,
      patch,
    }: {
      itemId: string;
      templateId: string;
      patch: Partial<Pick<OnboardingItem, 'title' | 'detail' | 'sort_order'>>;
    }) => {
      const { error } = await supabase
        .from('onboarding_template_items')
        .update(patch)
        .eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: (_d, { templateId }) => invalidate(templateId),
  });
}

export function useDeleteItem() {
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async ({ itemId }: { itemId: string; templateId: string }) => {
      const { error } = await supabase.from('onboarding_template_items').delete().eq('id', itemId);
      if (error) throw error;
    },
    onSuccess: (_d, { templateId }) => invalidate(templateId),
  });
}

/** Apply a computed up/down move (see src/lib/onboarding-order.ts). */
export function useReorder(kind: 'section' | 'item') {
  const invalidate = useInvalidateTemplates();
  const table =
    kind === 'section' ? 'onboarding_template_sections' : 'onboarding_template_items';
  return useMutation({
    mutationFn: async ({
      rows,
      id,
      direction,
    }: {
      templateId: string;
      rows: Array<{ id: string; sort_order: number }>;
      id: string;
      direction: 'up' | 'down';
    }) => {
      const writes = moveInList(rows, id, direction);
      for (const w of writes) {
        const { error } = await supabase
          .from(table)
          .update({ sort_order: w.sort_order })
          .eq('id', w.id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, { templateId }) => invalidate(templateId),
  });
}

/**
 * First-visit seeding: exactly one generic dental front-desk template, only
 * into an EMPTY library, and re-checked server-side right before inserting
 * so two racing admins cannot double-seed.
 */
export function useSeedStarterTemplate() {
  const { data: ctx } = useOrgContext();
  const invalidate = useInvalidateTemplates();
  return useMutation({
    mutationFn: async () => {
      const { count, error: countError } = await supabase
        .from('onboarding_templates')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', ctx!.org_id);
      if (countError) throw countError;
      if (!shouldSeedTemplates(count ?? 0)) return false;

      const seed = GENERIC_FRONT_DESK_TEMPLATE;
      const { data: tpl, error: tplError } = await supabase
        .from('onboarding_templates')
        .insert({
          org_id: ctx!.org_id,
          name: seed.name,
          role_label: seed.roleLabel,
          created_by: ctx!.user_id,
        })
        .select('id')
        .single();
      if (tplError) throw tplError;

      for (const [sIndex, section] of seed.sections.entries()) {
        const { data: sec, error: secError } = await supabase
          .from('onboarding_template_sections')
          .insert({
            org_id: ctx!.org_id,
            template_id: tpl.id,
            title: section.title,
            sort_order: sIndex,
          })
          .select('id')
          .single();
        if (secError) throw secError;
        const { error: itemsError } = await supabase.from('onboarding_template_items').insert(
          section.items.map((item, iIndex) => ({
            org_id: ctx!.org_id,
            template_id: tpl.id,
            section_id: sec.id,
            title: item.title,
            detail: item.detail ?? '',
            sort_order: iIndex,
          })),
        );
        if (itemsError) throw itemsError;
      }
      return true;
    },
    onSuccess: () => invalidate(),
  });
}
