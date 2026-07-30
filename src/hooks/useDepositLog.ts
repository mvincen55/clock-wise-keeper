import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';
import { reportIntegritySignal } from '@/lib/integrity';

// Daily deposit sheet: one record per office day. Check amounts only —
// no payer names, no account numbers.

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
      // Integrity: editing a day that is already closed out (any day before
      // today) is a discrepancy signal — amounts only, no payer detail.
      const todayEastern = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/New_York',
      }).format(new Date());
      if (input.depositDate < todayEastern) {
        const { data: prior } = await supabase
          .from('deposit_logs')
          .select('cash_cents, ins_cc_cents, pt_cc_cents, production_cents')
          .eq('deposit_date', input.depositDate)
          .maybeSingle();
        if (prior) {
          const priorTotal =
            (prior.cash_cents ?? 0) + (prior.ins_cc_cents ?? 0) + (prior.pt_cc_cents ?? 0);
          const newTotal = input.cashCents + input.insCcCents + input.ptCcCents;
          if (priorTotal !== newTotal || (prior.production_cents ?? 0) !== (input.productionCents ?? 0)) {
            reportIntegritySignal({
              kind: 'deposit_discrepancy',
              signal: 'deposit_edited_after_close',
              severity: Math.abs(newTotal - priorTotal) >= 50000 ? 'elevated' : 'watch',
              summary: `The deposit sheet for ${input.depositDate} was changed after that day closed (collections moved by ${((newTotal - priorTotal) / 100).toFixed(2)}).`,
              detail: {
                deposit_date: input.depositDate,
                delta_cents: newTotal - priorTotal,
                production_delta_cents: (input.productionCents ?? 0) - (prior.production_cents ?? 0),
              },
            });
          }
        }
      }

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
