import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useMemo } from 'react';
import {
  computePtoLedger,
  DEFAULT_PTO_TIERS,
  getTierForDate as getTierForDateLib,
  type PtoTier as PtoTierType,
} from '@/lib/pto';

/* ───────── Office PTO Policy ─────────
   Accrual tiers are org rows (pto_accrual_tiers), read through
   usePtoAccrualTiers; the pure math lives in src/lib/pto.ts under the
   ledger snapshot invariant. Shipped defaults cover an unseeded org. */

export { DEFAULT_PTO_TIERS as PTO_TIERS, getTierForDate, type PtoTier } from '@/lib/pto';

export function usePtoAccrualTiers() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['pto-accrual-tiers', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<PtoTierType[]> => {
      if (!ctx) return DEFAULT_PTO_TIERS;
      const { data, error } = await supabase
        .from('pto_accrual_tiers')
        .select('min_years, max_years, rate, weekly_cap, label, sort_order')
        .eq('org_id', ctx.org_id)
        .order('sort_order');
      if (error) throw error;
      if (!data || data.length === 0) return DEFAULT_PTO_TIERS;
      return data.map(row => ({
        minYears: Number(row.min_years),
        maxYears: Number(row.max_years),
        rate: Number(row.rate),
        weeklyCap: Number(row.weekly_cap),
        label: row.label,
      }));
    },
  });
}

/** Replace the org's tier table wholesale (admin RLS enforces who). */
export function useSavePtoAccrualTiers() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (tiers: PtoTierType[]) => {
      if (!ctx) throw new Error('Not authenticated');
      if (tiers.length === 0) throw new Error('At least one tier is required');
      for (const t of tiers) {
        if (!(t.minYears >= 0) || !(t.maxYears > t.minYears)) {
          throw new Error('Tier year ranges must be increasing');
        }
        if (!(t.rate >= 0 && t.rate <= 1)) throw new Error('Rates must be between 0 and 1');
        if (!(t.weeklyCap >= 0 && t.weeklyCap <= 40)) {
          throw new Error('Weekly caps must be between 0 and 40 hours');
        }
      }
      const { error: deleteError } = await supabase
        .from('pto_accrual_tiers')
        .delete()
        .eq('org_id', ctx.org_id);
      if (deleteError) throw deleteError;
      const { error } = await supabase.from('pto_accrual_tiers').insert(
        tiers.map((t, i) => ({
          org_id: ctx.org_id,
          min_years: t.minYears,
          max_years: t.maxYears,
          rate: t.rate,
          weekly_cap: t.weeklyCap,
          label: t.label,
          sort_order: i,
        }))
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pto-accrual-tiers'] }),
  });
}

/* ───────── Types ───────── */

export type PtoSettings = {
  id: string;
  user_id: string;
  hire_date: string;
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
};

/* ───────── Hooks: Settings ───────── */

export function usePtoSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['pto-settings'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('pto_settings')
        .select('*')
        .maybeSingle();
      return data as PtoSettings | null;
    },
  });
}

export function useUpsertPtoSettings() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: Partial<Omit<PtoSettings, 'id' | 'user_id'>>) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('pto_settings')
        .upsert({ user_id: user.id, ...input } as any, { onConflict: 'user_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pto-settings'] }),
  });
}

/* ───────── Hooks: Snapshots ───────── */

export function usePtoSnapshots() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['pto-snapshots'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('pto_snapshots')
        .select('*')
        .order('snapshot_date', { ascending: false });
      return (data || []) as PtoSnapshot[];
    },
  });
}

export function useUpsertPtoSnapshot() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { snapshot_date: string; snapshot_balance_hours: number }) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('pto_snapshots')
        .upsert(
          { user_id: user.id, ...input } as any,
          { onConflict: 'user_id,snapshot_date' }
        );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pto-snapshots'] }),
  });
}

/* ───────── Hooks: Ledger ───────── */

export function usePtoLedger() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['pto-ledger'],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from('pto_ledger_weeks')
        .select('*')
        .order('period_start', { ascending: true });
      return (data || []) as PtoLedgerWeek[];
    },
  });
}

/* ───────── Recalculate Engine ───────── */

export function useRecalculatePto() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!user) throw new Error('Not authenticated');

      // Resolve org context
      const { data: membership } = await supabase
        .from('org_members')
        .select('org_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
      if (!membership) throw new Error('No org membership found');
      const orgId = membership.org_id;

      const { data: empRecord } = await supabase
        .from('employees')
        .select('id')
        .eq('org_id', orgId)
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      if (!empRecord) throw new Error('No employee record found');
      const employeeId = empRecord.id;

      // 1. Load or auto-create settings
      let { data: settings } = await supabase
        .from('pto_settings')
        .select('*')
        .maybeSingle();

      if (!settings) {
        const defaults = {
          user_id: user.id,
          org_id: orgId,
          employee_id: employeeId,
          hire_date: '2022-02-07',
          worked_hours_cap_weekly: 40,
          max_balance: 100,
          allow_negative: false,
          timezone: 'America/New_York',
        };
        const { error } = await supabase.from('pto_settings').upsert(defaults as any, { onConflict: 'user_id' });
        if (error) throw error;
        const { data: reloaded } = await supabase.from('pto_settings').select('*').maybeSingle();
        settings = reloaded;
      }
      if (!settings) throw new Error('Failed to create PTO settings');
      const s = settings as PtoSettings;

      // 2. Load or auto-create snapshot
      let { data: snapshots } = await supabase
        .from('pto_snapshots')
        .select('*')
        .order('snapshot_date', { ascending: false })
        .limit(1);

      if (!snapshots?.length) {
        const defaultSnap = {
          user_id: user.id,
          org_id: orgId,
          employee_id: employeeId,
          snapshot_date: '2026-02-14',
          snapshot_balance_hours: -1.63,
        };
        const { error } = await supabase.from('pto_snapshots').upsert(defaultSnap as any, { onConflict: 'user_id,snapshot_date' });
        if (error) throw error;
        const { data: reloaded } = await supabase.from('pto_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(1);
        snapshots = reloaded;
      }
      if (!snapshots?.length) throw new Error('Failed to create PTO snapshot');
      const snap = snapshots[0] as PtoSnapshot;

      // 3. Load time entries from snapshot_date forward
      const { data: entries } = await supabase
        .from('time_entries')
        .select('entry_date, total_minutes')
        .gte('entry_date', snap.snapshot_date)
        .order('entry_date');

      // 4. Load days_off from snapshot_date forward
      const { data: daysOff } = await supabase
        .from('days_off')
        .select('date_start, date_end, hours, type')
        .gte('date_start', snap.snapshot_date)
        .order('date_start');

      // 5. Load the org's accrual tiers (shipped defaults if unseeded)
      const { data: tierRows } = await supabase
        .from('pto_accrual_tiers')
        .select('min_years, max_years, rate, weekly_cap, label, sort_order')
        .eq('org_id', orgId)
        .order('sort_order');
      const tiers: PtoTierType[] =
        tierRows && tierRows.length > 0
          ? tierRows.map(row => ({
              minYears: Number(row.min_years),
              maxYears: Number(row.max_years),
              rate: Number(row.rate),
              weeklyCap: Number(row.weekly_cap),
              label: row.label,
            }))
          : DEFAULT_PTO_TIERS;

      // 6. Pure accrual math (src/lib/pto.ts — ledger snapshot invariant)
      // Local calendar date (matching the original engine's local "today").
      const now = new Date();
      const today = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      const computed = computePtoLedger({
        snapshotDate: snap.snapshot_date,
        snapshotBalanceHours: Number(snap.snapshot_balance_hours),
        hireDate: s.hire_date,
        workedHoursCapWeekly: Number(s.worked_hours_cap_weekly),
        maxBalanceHours: Number(s.max_balance),
        entries: (entries || []).map(e => ({
          entryDate: e.entry_date,
          totalMinutes: e.total_minutes || 0,
        })),
        daysOff: (daysOff || []).map(d => ({
          dateStart: d.date_start,
          hours: d.hours != null ? Number(d.hours) : null,
          type: d.type,
        })),
        todayISO: today.toISOString().split('T')[0],
        tiers,
      });
      const runningBalance =
        computed.length > 0
          ? computed[computed.length - 1].runningBalance
          : Number(snap.snapshot_balance_hours);
      const ledgerRows = computed.map(row => ({
        user_id: user.id,
        org_id: orgId,
        employee_id: employeeId,
        period_start: row.periodStart,
        period_end: row.periodEnd,
        worked_hours_raw: row.workedHoursRaw,
        worked_hours_capped: row.workedHoursCapped,
        pto_taken_hours: row.ptoTakenHours,
        tier_rate: row.tierRate,
        calculated_accrual: row.calculatedAccrual,
        weekly_cap: row.weeklyCap,
        accrual_credited: row.accrualCredited,
        running_balance: row.runningBalance,
      }));

      // 7. Clear old ledger and insert new
      await supabase
        .from('pto_ledger_weeks')
        .delete()
        .eq('user_id', user.id);

      if (ledgerRows.length > 0) {
        // Insert in batches of 50
        for (let i = 0; i < ledgerRows.length; i += 50) {
          const batch = ledgerRows.slice(i, i + 50);
          const { error } = await supabase.from('pto_ledger_weeks').insert(batch);
          if (error) throw error;
        }
      }

      return { balance: runningBalance, weeks: ledgerRows.length };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pto-ledger'] });
    },
  });
}

/* ───────── Derived: Current Balance ───────── */

export function useCurrentPtoBalance() {
  const { data: ledger } = usePtoLedger();
  const { data: snapshots } = usePtoSnapshots();
  const { data: settings } = usePtoSettings();
  const { data: orgTiers } = usePtoAccrualTiers();
  const tiers = orgTiers ?? DEFAULT_PTO_TIERS;

  return useMemo(() => {
    if (!ledger?.length && snapshots?.length) {
      return {
        balance: Number(snapshots[0].snapshot_balance_hours),
        tier: settings
          ? getTierForDateLib(settings.hire_date, new Date().toISOString().split('T')[0], tiers)
          : tiers[0],
        lastWeek: null,
        currentWeek: null,
      };
    }
    if (!ledger?.length) {
      return { balance: 0, tier: tiers[0], lastWeek: null, currentWeek: null };
    }
    const last = ledger[ledger.length - 1];
    const prev = ledger.length > 1 ? ledger[ledger.length - 2] : null;
    const tier = settings
      ? getTierForDateLib(settings.hire_date, new Date().toISOString().split('T')[0], tiers)
      : tiers[0];
    return {
      balance: last.running_balance,
      tier,
      currentWeek: last,
      lastWeek: prev,
    };
  }, [ledger, snapshots, settings, tiers]);
}
