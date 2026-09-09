import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { TREATMENT_CLASSES, type TreatmentClass } from '@/lib/fof/payment-plan';

/**
 * The active office's stored PAYMENT classification per procedure code
 * (`procedure_meta.treatment_class`) — how a code is paid for, which is a
 * separate decision from its insurance category.
 *
 * Returns an empty map when the office has not classified anything yet, or
 * before the pending schema change is applied, so the builder simply falls
 * back to its code-range suggestion.
 */
export function useProcedureTreatmentClasses() {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['procedure-treatment-classes', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Record<string, TreatmentClass>> => {
      const { data, error } = await supabase
        .from('procedure_meta')
        .select('*')
        .eq('org_id', ctx!.org_id);
      if (error) throw error;
      const out: Record<string, TreatmentClass> = {};
      for (const row of (data ?? []) as Array<Record<string, unknown>>) {
        const code = String(row.code ?? '').trim().toUpperCase();
        const value = row.treatment_class;
        if (code && typeof value === 'string' && (TREATMENT_CLASSES as string[]).includes(value)) {
          out[code] = value as TreatmentClass;
        }
      }
      return out;
    },
  });
}
