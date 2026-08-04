import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';
import { DEFAULT_BA_SETTINGS } from '@/lib/broken-appts/defaults';
import type { BaSettings } from '@/lib/broken-appts/types';

// De-identified module configuration only — no patient data ever flows
// through this hook (see src/lib/broken-appts/types.ts for the HIPAA
// boundary). Follows the useFofPolicySettings pattern: read with in-code
// defaults until an admin saves the org row.

type SettingsRow = Tables<'broken_appt_settings'>;

function toClosedDates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v));
}

function mapRow(row: SettingsRow): BaSettings {
  return {
    // numeric(8,2) can arrive as a string via supabase-js
    feeAmount: Number(row.fee_amount),
    noticeBusinessHours: row.notice_business_hours,
    historyWindowYears: row.history_window_years,
    vipPrepayFloor: Number(row.vip_prepay_floor),
    officePhone: row.office_phone,
    officeClosedDates: toClosedDates(row.office_closed_dates),
    policyEffectiveDate: row.policy_effective_date ?? '',
    moduleNavLabel: row.module_nav_label,
    signatureName: row.signature_name,
    signatureTitle: row.signature_title,
  };
}

export function useBrokenApptSettings() {
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['broken-appt-settings', ctx?.org_id],
    enabled: !!ctx,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<BaSettings> => {
      const { data, error } = await supabase
        .from('broken_appt_settings')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (error) throw error;
      return data ? mapRow(data) : DEFAULT_BA_SETTINGS;
    },
  });
}

export function useUpsertBrokenApptSettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: Partial<BaSettings>) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('broken_appt_settings').upsert(
        {
          org_id: ctx.org_id,
          ...(patch.feeAmount !== undefined && { fee_amount: patch.feeAmount }),
          ...(patch.noticeBusinessHours !== undefined && {
            notice_business_hours: patch.noticeBusinessHours,
          }),
          ...(patch.historyWindowYears !== undefined && {
            history_window_years: patch.historyWindowYears,
          }),
          ...(patch.vipPrepayFloor !== undefined && { vip_prepay_floor: patch.vipPrepayFloor }),
          ...(patch.officePhone !== undefined && { office_phone: patch.officePhone }),
          ...(patch.officeClosedDates !== undefined && {
            office_closed_dates: patch.officeClosedDates,
          }),
          ...(patch.policyEffectiveDate !== undefined && {
            policy_effective_date: patch.policyEffectiveDate || null,
          }),
          ...(patch.moduleNavLabel !== undefined && { module_nav_label: patch.moduleNavLabel }),
          ...(patch.signatureName !== undefined && { signature_name: patch.signatureName }),
          ...(patch.signatureTitle !== undefined && { signature_title: patch.signatureTitle }),
        },
        { onConflict: 'org_id' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['broken-appt-settings'] }),
  });
}
