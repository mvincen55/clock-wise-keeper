import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { type ProcedureMeta, type UnitType } from '@/lib/procedures';

function mapRow(r: {
  id: string;
  org_id: string;
  code: string;
  patient_name: string;
  internal_description: string;
  unit_type: string;
  needs_teeth: boolean;
  needs_surfaces: boolean;
  quantity_strategy: string;
  active: boolean;
  keywords: string[];
}): ProcedureMeta {
  return {
    id: r.id,
    orgId: r.org_id,
    code: r.code,
    patientName: r.patient_name,
    internalDescription: r.internal_description,
    unitType: r.unit_type as UnitType,
    needsTeeth: r.needs_teeth,
    needsSurfaces: r.needs_surfaces,
    quantityStrategy: r.quantity_strategy as UnitType,
    active: r.active,
    keywords: r.keywords ?? [],
  };
}

/** All canonical procedure metadata for the org, keyed lookups included. */
export function useProcedureMeta() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['procedure-meta', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<ProcedureMeta[]> => {
      const { data, error } = await supabase
        .from('procedure_meta')
        .select('id, org_id, code, patient_name, internal_description, unit_type, needs_teeth, needs_surfaces, quantity_strategy, active, keywords')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      return (data ?? []).map(mapRow);
    },
  });
}

/** Map of uppercase CDT code → canonical metadata. */
export function useProcedureMetaMap(): ReadonlyMap<string, ProcedureMeta> {
  const { data: rows } = useProcedureMeta();
  return useMemo(() => {
    const map = new Map<string, ProcedureMeta>();
    for (const r of rows ?? []) map.set(r.code.trim().toUpperCase(), r);
    return map;
  }, [rows]);
}

/**
 * Upserts the patient-friendly name on the canonical procedure_meta row (the
 * single editable source). The DB trigger mirrors it into fof_code_names, so
 * existing FOF/consent reads are unchanged. Clearing the name keeps the
 * metadata row but empties the patient name (the cache row is removed).
 */
export function useUpsertProcedurePatientName() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ code, patientName }: { code: string; patientName: string }) => {
      if (!ctx) throw new Error('Not authenticated');
      const key = code.trim().toUpperCase();
      if (!key) throw new Error('Missing code');
      const { error } = await supabase
        .from('procedure_meta')
        .upsert(
          { org_id: ctx.org_id, code: key, patient_name: patientName.trim() },
          { onConflict: 'org_id,code' },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['procedure-meta'] });
      // fof_code_names is kept in sync by a DB trigger; refresh its readers.
      qc.invalidateQueries({ queryKey: ['fof-code-names'] });
    },
  });
}
