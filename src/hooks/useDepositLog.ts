import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';
import { scrubFreeText } from '../../supabase/functions/_shared/phi-scrub';

// Daily deposit sheet: one record per office day. Check amounts only —
// no payer names, no account numbers.
//
// The same row is the Close the Day record: staffing reality (the front
// desk's human assessment — never overwritten by automated results) and the
// seal. The staffing note is business-operations text only and runs through
// the PHI scrubber before it is persisted.

export type StaffingAssessment =
  | 'extra_coverage'
  | 'about_right'
  | 'stretched'
  | 'understaffed'
  | 'unsafe';

export type DepositLog = Tables<'deposit_logs'>;

export function depositChecks(log: DepositLog | null | undefined): number[] {
  if (!log || !Array.isArray(log.checks)) return [];
  return (log.checks as unknown[]).filter((v): v is number => typeof v === 'number');
}

export function useDepositLog(date: string) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['deposit-log', ctx?.org_id, date],
    enabled: !!user && !!ctx && !!date,
    queryFn: async (): Promise<DepositLog | null> => {
      const { data, error } = await supabase
        .from('deposit_logs')
        .select('*')
        .eq('deposit_date', date)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

export interface DepositLogSave {
  depositDate: string;
  cashCents: number;
  checksCents: number[];
  insCcCents: number;
  ptCcCents: number;
  illumitracCents: number;
  outsideFinancingCents: number;
  notes: string;
  productionCents: number | null;
  hygieneCancellations: number;
  hygieneNoShows: number;
  doctorCancellations: number;
  doctorNoShows: number;
  staffingAssessment?: StaffingAssessment | null;
  staffingPressure?: string[];
  staffingFactors?: string[];
  staffingNote?: string;
}

export function useSaveDepositLog() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: DepositLogSave) => {
      if (!ctx || !user) throw new Error('Not authenticated');
      const { data: employee } = await supabase
        .from('employees')
        .select('display_name')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      const { error } = await supabase.from('deposit_logs').upsert(
        {
          org_id: ctx.org_id,
          deposit_date: input.depositDate,
          cash_cents: input.cashCents,
          checks: input.checksCents,
          ins_cc_cents: input.insCcCents,
          pt_cc_cents: input.ptCcCents,
          illumitrac_cents: input.illumitracCents,
          outside_financing_cents: input.outsideFinancingCents,
          notes: input.notes.trim(),
          production_cents: input.productionCents,
          hygiene_cancellations: input.hygieneCancellations,
          hygiene_no_shows: input.hygieneNoShows,
          doctor_cancellations: input.doctorCancellations,
          doctor_no_shows: input.doctorNoShows,
          ...(input.staffingAssessment !== undefined && {
            staffing_assessment: input.staffingAssessment,
          }),
          ...(input.staffingPressure !== undefined && { staffing_pressure: input.staffingPressure }),
          ...(input.staffingFactors !== undefined && { staffing_factors: input.staffingFactors }),
          ...(input.staffingNote !== undefined && {
            staffing_note: scrubFreeText(input.staffingNote, 1000).text,
          }),
          prepared_by: user.id,
          prepared_by_name: employee?.display_name || user.email || '',
        },
        { onConflict: 'org_id,deposit_date' }
      );
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['deposit-log', ctx?.org_id, input.depositDate] });
      qc.invalidateQueries({ queryKey: ['practice-vitals'] });
    },
  });
}

/**
 * Seal the day. Same-day sealing by whoever closes; unsealing or later edits
 * are owner/manager territory (RLS + the audit trigger enforce it).
 */
export function useSealDay() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { closeoutId: string; depositDate: string; seal: boolean }) => {
      if (!ctx || !user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('deposit_logs')
        .update(
          input.seal
            ? { sealed_at: new Date().toISOString(), sealed_by: user.id }
            : { sealed_at: null, sealed_by: null }
        )
        .eq('id', input.closeoutId);
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['deposit-log', ctx?.org_id, input.depositDate] });
    },
  });
}
