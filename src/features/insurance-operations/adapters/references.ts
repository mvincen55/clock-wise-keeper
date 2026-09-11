import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json, Tables } from '@/integrations/supabase/types';
import {
  defaultSettings,
  planDraftSchema,
  settingsSchema,
  type OfficeSettings,
  type PlanDraft,
  type PlanVersion,
} from '../domain/schema';

export function mapPlanVersion(
  row: Tables<'insurance_plan_versions'>,
): PlanVersion {
  const reference = planDraftSchema.parse(row.reference);
  return {
    ...reference,
    id: row.id,
    orgId: row.org_id,
    catalogId: row.catalog_id,
    version: row.version,
    groupNormalized: row.group_normalized,
    reviewedAt: row.reviewed_at,
    reviewerId: row.reviewer_id,
    status: row.status === 'reviewed' ? 'reviewed' : 'superseded',
  };
}
export function useInsuranceReferences(orgId?: string) {
  return useQuery({
    queryKey: ['insurance-operations-references', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const [
        settings,
        versions,
        directory,
        providers,
        plans,
        schedules,
        manuals,
      ] = await Promise.all([
        supabase
          .from('insurance_operation_settings')
          .select('*')
          .eq('org_id', orgId!)
          .maybeSingle(),
        supabase
          .from('insurance_plan_versions')
          .select('*')
          .eq('org_id', orgId!)
          .order('reviewed_at', { ascending: false }),
        supabase
          .from('important_numbers')
          .select('id,label,value,org_id')
          .eq('org_id', orgId!),
        supabase
          .from('org_providers')
          .select('id,display_name,active')
          .eq('org_id', orgId!),
        supabase.from('insurance_plans').select('id,name').eq('org_id', orgId!),
        supabase.from('fee_schedules').select('id,name').eq('org_id', orgId!),
        supabase
          .from('office_docs')
          .select('id,title')
          .eq('org_id', orgId!)
          .eq('collection', 'insurance'),
      ]);
      if (
        [
          settings,
          versions,
          directory,
          providers,
          plans,
          schedules,
          manuals,
        ].some((r) => r.error)
      )
        throw new Error(
          'Insurance reference setup is unavailable. Apply the reviewed database release before enabling operations.',
        );
      return {
        settings: settings.data
          ? settingsSchema.parse(settings.data.configuration)
          : structuredClone(defaultSettings),
        settingsVersion: settings.data?.version ?? 0,
        versions: (versions.data ?? []).map(mapPlanVersion),
        directory: directory.data ?? [],
        providers: providers.data ?? [],
        plans: plans.data ?? [],
        schedules: schedules.data ?? [],
        manuals: manuals.data ?? [],
      };
    },
  });
}
export type ReferenceData = NonNullable<
  ReturnType<typeof useInsuranceReferences>['data']
>;
// Only allowlisted non-patient data may cross this adapter. No task argument.
export async function saveSettings(
  orgId: string,
  expected: number,
  settings: OfficeSettings,
) {
  const clean = settingsSchema.parse(settings);
  const { error } = await supabase.rpc('insurance_save_settings', {
    p_org_id: orgId,
    p_expected_version: expected,
    p_configuration: clean as Json,
  });
  if (error)
    throw new Error(
      'Settings were not saved. Check permissions and reload if another manager changed them.',
    );
}
export async function publishPlan(
  orgId: string,
  draft: PlanDraft,
  reviewed: boolean,
  previous?: PlanVersion,
) {
  if (!reviewed)
    throw new Error('Review source and confirm generic fields first.');
  const clean = planDraftSchema.parse(draft);
  const { error } = await supabase.rpc('insurance_publish_plan', {
    p_org_id: orgId,
    p_catalog_id: previous?.catalogId ?? null,
    p_expected_version: previous?.version ?? 0,
    p_reference: clean as Json,
    p_reviewed: true,
  });
  if (error)
    throw new Error(
      'Plan was not published. Check references, permissions and version, then review again.',
    );
}
