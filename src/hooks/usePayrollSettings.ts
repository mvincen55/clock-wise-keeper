import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type PayrollSettingsRow = {
  id: string;
  user_id: string;
  pay_period_type: string;
  week_start_day: number;
  missing_shift_buffer_minutes: number;
  timezone: string;
  /** Days after a pay period ends that payroll is due; null = no deadline is derived anywhere. */
  payroll_due_days_after_period: number | null;
  /** A known first day of a pay period; bi-weekly periods are counted from it. */
  pay_period_anchor: string | null;
  created_at: string;
  updated_at: string;
};

export function usePayrollSettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['payroll-settings', ctx?.org_id, user?.id],
    enabled: !!user && !!ctx,
    queryFn: async () => {
      // One row per office (unique on org_id); readable by every member.
      const { data } = await supabase
        .from('payroll_settings')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      return data as PayrollSettingsRow | null;
    },
  });
}

export function useUpsertPayrollSettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Pick<PayrollSettingsRow, 'pay_period_type' | 'week_start_day' | 'missing_shift_buffer_minutes' | 'timezone' | 'payroll_due_days_after_period' | 'pay_period_anchor'>>) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('payroll_settings').upsert(
        { user_id: user.id, org_id: ctx.org_id, ...updates },
        { onConflict: 'org_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-settings'] }),
  });
}
