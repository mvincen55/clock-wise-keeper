import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { FeeByCode } from '@/lib/handbook-fees';

export const OFFICE_FEE_LOOKUP_KEY = 'office-fee-lookup';

export interface OfficeFeeLookup {
  scheduleName: string;
  byCode: FeeByCode;
}

const PAGE = 1000;

/**
 * Read-only view of the active office fee schedule, keyed by code, for
 * surfaces that quote fees (the handbook's code tables). Never seeds a
 * schedule; an office without one simply shows the document as written.
 * Fee mutations invalidate OFFICE_FEE_LOOKUP_KEY so quoted fees follow edits.
 */
export function useOfficeFeeLookup(enabled = true) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: [OFFICE_FEE_LOOKUP_KEY, ctx?.org_id],
    enabled: enabled && !!user && !!ctx,
    staleTime: 60_000,
    queryFn: async (): Promise<OfficeFeeLookup | null> => {
      if (!ctx) return null;
      const { data: schedules, error } = await supabase
        .from('fee_schedules')
        .select('id, name')
        .eq('org_id', ctx.org_id)
        .eq('kind', 'office')
        .eq('is_active', true)
        .order('sort_order')
        .order('name')
        .limit(1);
      if (error) throw error;
      const schedule = schedules?.[0];
      if (!schedule) return null;

      const byCode: FeeByCode = new Map();
      // Office schedules run to hundreds of codes: page past the default row cap.
      for (let from = 0; ; from += PAGE) {
        const { data: items, error: itemError } = await supabase
          .from('fee_schedule_items')
          .select('code, fee_cents')
          .eq('schedule_id', schedule.id)
          .order('code')
          .range(from, from + PAGE - 1);
        if (itemError) throw itemError;
        for (const item of items ?? []) byCode.set(item.code.trim().toUpperCase(), item.fee_cents);
        if (!items || items.length < PAGE) break;
      }
      return { scheduleName: schedule.name, byCode };
    },
  });
}
