import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useMemo } from 'react';

/* ───────── Harelick Dental PTO Policy ───────── */

export const PTO_TIERS = [
  { minYears: 0, maxYears: 1, rate: 0.0576, weeklyCap: 2.30, label: 'Year 1' },
  { minYears: 1, maxYears: 5, rate: 0.0769, weeklyCap: 3.08, label: 'Years 2–5' },
  { minYears: 5, maxYears: 11, rate: 0.0962, weeklyCap: 3.85, label: 'Year 6–11' },
  { minYears: 11, maxYears: 999, rate: 0.1009, weeklyCap: 4.00, label: 'Year 12+' },
];

export function getTierForDate(hireDate: string, checkDate: string) {
  const hire = new Date(hireDate + 'T00:00:00');
  const check = new Date(checkDate + 'T00:00:00');
  const years = (check.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return PTO_TIERS.find(t => years >= t.minYears && years < t.maxYears) || PTO_TIERS[0];
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

      // 5. Build weekly periods from snapshot date (Sun-Sat)
      const snapDate = new Date(snap.snapshot_date + 'T00:00:00');
      // Align to next Sunday (week start = 0 for Sunday)
      const firstSunday = new Date(snapDate);
      while (firstSunday.getDay() !== 0) firstSunday.setDate(firstSunday.getDate() + 1);

      const today = new Date();
      today.setHours(23, 59, 59, 999);

      const weeks: { start: string; end: string }[] = [];
      const cur = new Date(firstSunday);
      while (cur <= today) {
        const end = new Date(cur);
        end.setDate(end.getDate() + 6);
        weeks.push({
          start: cur.toISOString().split('T')[0],
          end: end.toISOString().split('T')[0],
        });
        cur.setDate(cur.getDate() + 7);
      }

      // 6. For each week, compute worked hours and PTO taken
      let runningBalance = Number(snap.snapshot_balance_hours);
      const ledgerRows: any[] = [];

      for (const week of weeks) {
        // Worked hours from time_entries in this week
        const workedMinutes = (entries || [])
          .filter(e => e.entry_date >= week.start && e.entry_date <= week.end)
          .reduce((sum, e) => sum + (e.total_minutes || 0), 0);
        const workedHoursRaw = workedMinutes / 60;
        const workedHoursCapped = Math.min(workedHoursRaw, Number(s.worked_hours_cap_weekly));

        // PTO taken from days_off in this week
        const ptoTaken = (daysOff || [])
          .filter(d => d.date_start >= week.start && d.date_start <= week.end && d.type !== 'office_closed')
          .reduce((sum, d) => sum + (Number(d.hours) || 8), 0);

        // Determine tier for this week
        const tier = getTierForDate(s.hire_date, week.start);

        // Calculate accrual: rate * (capped worked + PTO taken)
        const basisHours = workedHoursCapped + ptoTaken;
        const calculatedAccrual = parseFloat((tier.rate * basisHours).toFixed(4));
        const cappedAccrual = Math.min(calculatedAccrual, tier.weeklyCap);

        // Check max balance cap
        let accrualCredited = cappedAccrual;
        if (runningBalance + accrualCredited > Number(s.max_balance)) {
          accrualCredited = Math.max(0, Number(s.max_balance) - runningBalance);
        }
        accrualCredited = parseFloat(accrualCredited.toFixed(2));

        runningBalance = parseFloat((runningBalance + accrualCredited - ptoTaken).toFixed(2));

        ledgerRows.push({
          user_id: user.id,
          org_id: orgId,
          employee_id: employeeId,
          period_start: week.start,
          period_end: week.end,
          worked_hours_raw: parseFloat(workedHoursRaw.toFixed(2)),
          worked_hours_capped: parseFloat(workedHoursCapped.toFixed(2)),
          pto_taken_hours: parseFloat(ptoTaken.toFixed(2)),
          tier_rate: tier.rate,
          calculated_accrual: parseFloat(calculatedAccrual.toFixed(2)),
          weekly_cap: tier.weeklyCap,
          accrual_credited: accrualCredited,
          running_balance: runningBalance,
        });
      }

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

  return useMemo(() => {
    if (!ledger?.length && snapshots?.length) {
      return {
        balance: Number(snapshots[0].snapshot_balance_hours),
        tier: settings ? getTierForDate(settings.hire_date, new Date().toISOString().split('T')[0]) : PTO_TIERS[0],
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
      ? getTierForDate(settings.hire_date, new Date().toISOString().split('T')[0])
      : PTO_TIERS[0];
    return {
      balance: last.running_balance,
      tier,
      currentWeek: last,
      lastWeek: prev,
    };
  }, [ledger, snapshots, settings]);
}
