import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

export type WorkedHourAdjustmentRow = {
  id: string;
  org_id: string;
  employee_id: string;
  entry_date: string;
  /** Signed hours, two decimals: +7.28 adds, -7.28 deducts. */
  hours_delta: number;
  reason: string;
  entered_by: string;
  created_at: string;
};

/**
 * Worked-hour offsets ("Offset hours" on a team member's card) dated inside
 * the range. They count toward the hours paid in the week they are dated,
 * so every payroll surface that totals time reads them alongside the
 * entries. RLS returns the whole office to owners and managers and only
 * their own rows to everyone else.
 */
export function useWorkedHourAdjustments(startDate?: string, endDate?: string) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['worked-adjustments', 'range', ctx?.org_id, startDate ?? null, endDate ?? null],
    enabled: !!ctx?.org_id && !!startDate && !!endDate,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('worked_hour_adjustments')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .gte('entry_date', startDate!)
        .lte('entry_date', endDate!)
        .order('entry_date', { ascending: true });
      if (error) throw error;
      // numeric(10,2) arrives as a string from PostgREST.
      return (data || []).map(r => ({ ...r, hours_delta: Number(r.hours_delta) })) as WorkedHourAdjustmentRow[];
    },
  });
}
