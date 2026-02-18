import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type PayrollSettingsRow = {
  id: string;
  user_id: string;
  pay_period_type: string;
  week_start_day: number;
  missing_shift_buffer_minutes: number;
  created_at: string;
  updated_at: string;
};

export function usePayrollSettings() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['payroll-settings'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('payroll_settings')
        .select('*')
        .maybeSingle();
      return data as PayrollSettingsRow | null;
    },
  });
}

export function useUpsertPayrollSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (updates: Partial<Pick<PayrollSettingsRow, 'pay_period_type' | 'week_start_day' | 'missing_shift_buffer_minutes'>>) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase.from('payroll_settings').upsert(
        { user_id: user.id, ...updates },
        { onConflict: 'user_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payroll-settings'] }),
  });
}
