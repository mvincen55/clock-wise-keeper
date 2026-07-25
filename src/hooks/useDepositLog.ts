import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';

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

/**
 * Printed wording captured onto the record at save time (Phase 2c), so
 * a later settings/branding edit never changes what a historical
 * printed document said. Null on records saved before this existed.
 */
export interface DepositPrintSnapshot {
  v: 1;
  branding: { displayName: string; legalName: string; logoUrl: string };
  settings: {
    accountLine: string;
    bankSplitCashLabel: string;
    bankSplitCardsLabel: string;
    bankTotalLabel: string;
    envelopeNote: string;
    officeCopyNote: string;
  };
  membershipLabel: string;
}

export function parseDepositPrintSnapshot(value: unknown): DepositPrintSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const snap = value as Partial<DepositPrintSnapshot>;
  if (snap.v !== 1 || !snap.branding || !snap.settings) return null;
  return snap as DepositPrintSnapshot;
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
  printSnapshot: DepositPrintSnapshot | null;
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
          prepared_by: user.id,
          prepared_by_name: employee?.display_name || user.email || '',
          // JSON-serializable by construction; cast for the generated type.
          print_snapshot: input.printSnapshot as unknown as Tables<'deposit_logs'>['print_snapshot'],
        },
        { onConflict: 'org_id,deposit_date' }
      );
      if (error) throw error;
    },
    onSuccess: (_, input) =>
      qc.invalidateQueries({ queryKey: ['deposit-log', ctx?.org_id, input.depositDate] }),
  });
}
