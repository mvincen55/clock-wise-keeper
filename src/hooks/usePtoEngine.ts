import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/pending-schema';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useEffect, useMemo } from 'react';
import { getToday } from '@/lib/time-utils';

/* ───────── Office PTO Policy ─────────
   Accrual tiers are still hardcoded office policy; they move to
   org-scoped rows in the genericization pass (own PR at the end of
   Phase 2, with a PTO ledger snapshot guarding the math). */

export const PTO_TIERS = [
  { minYears: 0, maxYears: 1, rate: 0.0576, weeklyCap: 2.30, label: 'Year 1' },
  { minYears: 1, maxYears: 5, rate: 0.0769, weeklyCap: 3.08, label: 'Years 2–5' },
  { minYears: 5, maxYears: 11, rate: 0.0962, weeklyCap: 3.85, label: 'Year 6–11' },
  { minYears: 11, maxYears: 999, rate: 0.1009, weeklyCap: 4.00, label: 'Year 12+' },
];

export function getTierForDate(hireDate: string, checkDate: string) {
  const years = Number(checkDate.slice(0, 4)) - Number(hireDate.slice(0, 4))
    - (checkDate.slice(5) < hireDate.slice(5) ? 1 : 0);
  return [...PTO_TIERS].reverse().find(t => years >= t.minYears) || PTO_TIERS[0];
}

/* ───────── Types ───────── */

export type PtoSettings = {
  id: string;
  user_id: string;
  hire_date: string;
  join_date?: string | null;
  worked_hours_cap_weekly: number;
  max_balance: number;
  allow_negative: boolean;
  timezone: string;
};

export type PtoSnapshot = {
  id: string;
  user_id: string;
  snapshot_date: string;
  snapshot_balance_hours: number;
};

export type PtoLedgerWeek = {
  id: string;
  user_id: string;
  period_start: string;
  period_end: string;
  worked_hours_raw: number;
  worked_hours_capped: number;
  pto_taken_hours: number;
  tier_rate: number;
  calculated_accrual: number;
  weekly_cap: number;
  accrual_credited: number;
  running_balance: number;
  reconciliation_hours?: number | null;
  reconciliation_note?: string | null;
  confirmed_balance?: number | null;
};

/* ───────── Hooks: Settings ───────── */

export function usePtoSettings() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['pto-settings', ctx?.org_id, ctx?.employee_id],
    enabled: !!ctx,
    refetchInterval: 30_000,
    queryFn: async () => {
      const [policy, employee] = await Promise.all([
        supabase.from('pto_settings').select('*').eq('employee_id', ctx!.employee_id).eq('org_id', ctx!.org_id).maybeSingle(),
        supabase.from('employees').select('real_hire_date, hire_date').eq('id', ctx!.employee_id).eq('org_id', ctx!.org_id).single(),
      ]);
      if (policy.error) throw policy.error;
      if (employee.error) throw employee.error;
      const hireDate = employee.data.real_hire_date ?? employee.data.hire_date ?? policy.data?.hire_date;
      if (!hireDate) return null;
      return { worked_hours_cap_weekly: 40, max_balance: 100, allow_negative: false,
        timezone: 'America/New_York', ...policy.data, hire_date: hireDate, join_date: employee.data.hire_date } as PtoSettings;
    },
  });
}

export function useUpsertPtoSettings() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Omit<PtoSettings, 'id' | 'user_id'>>) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('pto_settings')
        .upsert({ user_id: user.id, org_id: ctx.org_id, employee_id: ctx.employee_id, ...input } as any, { onConflict: 'employee_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pto-settings'] }),
  });
}

/* ───────── Hooks: Office policy ───────── */

export type OrgPtoPolicy = {
  org_id: string;
  worked_hours_cap_weekly: number;
  max_balance: number;
  allow_negative: boolean;
  updated_by: string | null;
  updated_at: string;
};

/** The office's PTO accrual defaults. Every member may read them. */
export function useOrgPtoPolicy() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-pto-policy', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async (): Promise<OrgPtoPolicy | null> => {
      const { data, error } = await supabase.from('org_pto_policy').select('*').eq('org_id', ctx!.org_id).maybeSingle();
      if (error) throw error;
      return data ? { ...data, worked_hours_cap_weekly: Number(data.worked_hours_cap_weekly), max_balance: Number(data.max_balance) } : null;
    },
  });
}

/**
 * Owners set the office policy through `set_org_pto_policy`; the new
 * default reaches everyone without an exception in the same transaction.
 */
export function useSetOrgPtoPolicy() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { worked_hours_cap_weekly: number; max_balance: number; allow_negative: boolean }) => {
      if (!ctx) throw new Error('Not authenticated');
      const { data, error } = await supabase.rpc('set_org_pto_policy', {
        p_org_id: ctx.org_id, p_cap: input.worked_hours_cap_weekly, p_max: input.max_balance, p_allow_negative: input.allow_negative,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-pto-policy'] });
      qc.invalidateQueries({ queryKey: ['pto-settings'] });
      qc.invalidateQueries({ queryKey: ['pto-ledger'] });
      qc.invalidateQueries({ queryKey: ['employee-setup'] });
    },
  });
}

/* ───────── Hooks: Snapshots ───────── */

export function usePtoSnapshots() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['pto-snapshots', ctx?.org_id, ctx?.employee_id],
    enabled: !!ctx,
    refetchInterval: 30_000,
    queryFn: async () => {
      const employee = await supabase.from('employees').select('hire_date').eq('id', ctx!.employee_id).eq('org_id', ctx!.org_id).single();
      if (employee.error) throw employee.error;
      const { data, error } = await supabase
        .from('pto_snapshots')
        .select('*')
        .lte('snapshot_date', getToday())
        .eq('employee_id', ctx!.employee_id)
        .eq('org_id', ctx!.org_id)
        .order('snapshot_date', { ascending: false });
      if (error) throw error;
      return [...(data || [])].sort((a, b) =>
        Number(b.snapshot_date === employee.data.hire_date) - Number(a.snapshot_date === employee.data.hire_date)
        || b.snapshot_date.localeCompare(a.snapshot_date)) as PtoSnapshot[];
    },
  });
}

export function useUpsertPtoSnapshot() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { snapshot_balance_hours: number }) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const employee = await supabase.from('employees').select('hire_date').eq('id', ctx.employee_id).eq('org_id', ctx.org_id).single();
      if (employee.error) throw employee.error;
      if (!employee.data.hire_date) throw new Error('Save a Purple Envelope join date in Team before entering the starting balance.');
      const { error } = await supabase
        .from('pto_snapshots')
        .upsert(
          { user_id: user.id, org_id: ctx.org_id, employee_id: ctx.employee_id, ...input, snapshot_date: employee.data.hire_date } as any,
          { onConflict: 'employee_id,snapshot_date' }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pto-snapshots'] }),
  });
}

/* ───────── Hooks: Ledger ───────── */

export function usePtoLedger() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  // Every successful in-app save can affect PTO. Refresh immediately after it;
  // polling/focus also catches other users' edits and new calendar days.
  useEffect(() => qc.getMutationCache().subscribe(event => {
    if (event.type === 'updated' && event.action.type === 'success') {
      void qc.invalidateQueries({ queryKey: ['pto-ledger'] });
      void qc.invalidateQueries({ queryKey: ['pto-settings'] });
      void qc.invalidateQueries({ queryKey: ['pto-snapshots'] });
    }
  }), [qc]);
  return useQuery({
    queryKey: ['pto-ledger', ctx?.org_id, ctx?.employee_id],
    enabled: !!ctx,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_live_pto_ledger', { p_employee_id: ctx!.employee_id });
      if (error) throw error;
      return (data || []) as PtoLedgerWeek[];
    },
  });
}

/* ───────── Derived: Current Balance ───────── */

export function useCurrentPtoBalance() {
  const { data: ledger } = usePtoLedger();
  const { data: snapshots } = usePtoSnapshots();
  const { data: settings } = usePtoSettings();

  return useMemo(() => {
    if (!ledger?.length && snapshots?.length) {
      return {
        balance: Number(snapshots[0].snapshot_balance_hours),
        tier: settings ? getTierForDate(settings.hire_date, getToday()) : PTO_TIERS[0],
        lastWeek: null,
        currentWeek: null,
      };
    }
    if (!ledger?.length) {
      return { balance: 0, tier: PTO_TIERS[0], lastWeek: null, currentWeek: null };
    }
    const last = ledger[ledger.length - 1];
    const prev = ledger.length > 1 ? ledger[ledger.length - 2] : null;
    const tier = settings
      ? getTierForDate(settings.hire_date, getToday())
      : PTO_TIERS[0];
    return {
      balance: last.running_balance,
      tier,
      currentWeek: last,
      lastWeek: prev,
    };
  }, [ledger, snapshots, settings]);
}

