import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { consentDb, type ConsentBundleItemRow, type ConsentBundleRow } from '@/lib/consents/db';
import { logConsentAudit } from '@/hooks/useConsentAudit';
import type { BundleItemRequirement, ConsentBundle, ConsentBundleItem } from '@/lib/consents/types';

/** Treatment bundles: which forms travel together for a given treatment. */

function mapItem(row: ConsentBundleItemRow): ConsentBundleItem {
  return {
    id: row.id,
    bundleId: row.bundle_id,
    formId: row.form_id,
    requirement: row.requirement as BundleItemRequirement,
    conditionLabel: row.condition_label,
    sortOrder: row.sort_order,
  };
}

function mapBundle(row: ConsentBundleRow & { consent_bundle_items?: ConsentBundleItemRow[] }): ConsentBundle {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    procedureCodes: row.procedure_codes ?? [],
    status: row.status as ConsentBundle['status'],
    sortOrder: row.sort_order,
    isSample: row.is_sample,
    useCount: row.use_count,
    updatedAt: row.updated_at,
    items: (row.consent_bundle_items ?? [])
      .map(mapItem)
      .sort((a, b) => a.sortOrder - b.sortOrder),
  };
}

export function useConsentBundles() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['consent-bundles', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<ConsentBundle[]> => {
      if (!ctx) return [];
      const { data, error } = await consentDb
        .from('consent_bundles')
        .select('*, consent_bundle_items(*)')
        .eq('org_id', ctx.org_id)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return (data ?? []).map(mapBundle);
    },
  });
}

export interface BundleItemInput {
  formId: string;
  requirement: BundleItemRequirement;
  conditionLabel?: string;
}

/** Create or fully update a bundle (metadata + item list, in order). */
export function useSaveConsentBundle() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      description?: string;
      procedureCodes?: string[];
      items: BundleItemInput[];
    }): Promise<string> => {
      if (!ctx || !user) throw new Error('Not signed in');

      let bundleId = input.id;
      if (bundleId) {
        const { error } = await consentDb
          .from('consent_bundles')
          .update({
            name: input.name,
            description: input.description ?? '',
            procedure_codes: input.procedureCodes ?? [],
          })
          .eq('id', bundleId);
        if (error) throw error;
        // Replace the item list wholesale — simplest correct ordering story.
        const { error: clearError } = await consentDb
          .from('consent_bundle_items')
          .delete()
          .eq('bundle_id', bundleId);
        if (clearError) throw clearError;
      } else {
        const { data, error } = await consentDb
          .from('consent_bundles')
          .insert({
            org_id: ctx.org_id,
            name: input.name,
            description: input.description ?? '',
            procedure_codes: input.procedureCodes ?? [],
            sort_order: 99,
            created_by: user.id,
          })
          .select('id')
          .single();
        if (error) throw error;
        bundleId = data.id;
      }

      if (input.items.length > 0) {
        const { error } = await consentDb.from('consent_bundle_items').insert(
          input.items.map((item, i) => ({
            org_id: ctx.org_id,
            bundle_id: bundleId!,
            form_id: item.formId,
            requirement: item.requirement,
            condition_label: item.conditionLabel ?? '',
            sort_order: i,
          })),
        );
        if (error) throw error;
      }

      void logConsentAudit({
        orgId: ctx.org_id,
        action: input.id ? 'bundle_changed' : 'bundle_created',
        entityType: 'bundle',
        entityId: bundleId,
        entityName: input.name,
        actorId: user.id,
        actorName: user.email ?? '',
        detail: { forms: input.items.length },
      });
      return bundleId!;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent-bundles'] }),
  });
}

export function useDuplicateConsentBundle() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (bundle: ConsentBundle) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { data, error } = await consentDb
        .from('consent_bundles')
        .insert({
          org_id: ctx.org_id,
          name: `${bundle.name} (Copy)`,
          description: bundle.description,
          procedure_codes: bundle.procedureCodes,
          sort_order: bundle.sortOrder + 1,
          created_by: user.id,
        })
        .select('id')
        .single();
      if (error) throw error;
      if (bundle.items.length > 0) {
        const { error: itemsError } = await consentDb.from('consent_bundle_items').insert(
          bundle.items.map((item, i) => ({
            org_id: ctx.org_id,
            bundle_id: data.id,
            form_id: item.formId,
            requirement: item.requirement,
            condition_label: item.conditionLabel,
            sort_order: i,
          })),
        );
        if (itemsError) throw itemsError;
      }
      void logConsentAudit({
        orgId: ctx.org_id,
        action: 'bundle_created',
        entityType: 'bundle',
        entityId: data.id,
        entityName: `${bundle.name} (Copy)`,
        actorId: user.id,
        actorName: user.email ?? '',
        detail: { duplicatedFrom: bundle.name },
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent-bundles'] }),
  });
}

export function useArchiveConsentBundle() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { bundle: ConsentBundle; archive: boolean }) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { error } = await consentDb
        .from('consent_bundles')
        .update({ status: input.archive ? 'archived' : 'active' })
        .eq('id', input.bundle.id);
      if (error) throw error;
      void logConsentAudit({
        orgId: ctx.org_id,
        action: input.archive ? 'bundle_archived' : 'bundle_restored',
        entityType: 'bundle',
        entityId: input.bundle.id,
        entityName: input.bundle.name,
        actorId: user.id,
        actorName: user.email ?? '',
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent-bundles'] }),
  });
}

/** Persist a new display order after drag-reordering the bundle list. */
export function useReorderConsentBundles() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (!ctx) throw new Error('Not signed in');
      for (const [i, id] of orderedIds.entries()) {
        const { error } = await consentDb
          .from('consent_bundles')
          .update({ sort_order: i })
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['consent-bundles'] }),
  });
}

/** Count a bundle being used to start a packet (dashboard ranking only). */
export async function recordBundleUse(bundleId: string): Promise<void> {
  const { error } = await consentDb.rpc('consent_bundle_used', { p_bundle_id: bundleId });
  if (error) console.warn('bundle use count failed', error.message);
}
