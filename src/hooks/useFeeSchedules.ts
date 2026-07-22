import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';
import type { Cents } from '@/lib/fof/types';
import type { FeeCategory, PlanRules } from '@/lib/fof/insurance';

// Fee schedules, items, and insurance plans — de-identified configuration
// only. No patient data flows through these hooks.

/** 'payment' = a plan payment table: the set amounts a plan pays per code. */
export type FeeScheduleKind = 'office' | 'carrier' | 'payment';

export interface FeeSchedule {
  id: string;
  name: string;
  kind: FeeScheduleKind;
  isActive: boolean;
  /** Contracted carrier: the FOF applies write-offs automatically. */
  isInNetwork: boolean;
  sortOrder: number;
  itemCount?: number;
}

export interface FeeScheduleItem {
  id: string;
  scheduleId: string;
  code: string;
  description: string;
  feeCents: Cents;
  category: FeeCategory;
}

export interface InsurancePlan extends PlanRules {
  id: string;
  name: string;
  feeScheduleId: string | null;
  deductibleCents: Cents;
  annualMaxCents: Cents;
  /** In-network plans apply write-offs and offer NO additional prepay discount. */
  isInNetwork: boolean;
  isActive: boolean;
}

function mapSchedule(row: Tables<'fee_schedules'> & { fee_schedule_items?: { count: number }[] }): FeeSchedule {
  return {
    id: row.id,
    name: row.name,
    kind: (row.kind as FeeScheduleKind) ?? 'carrier',
    isActive: row.is_active,
    isInNetwork: row.is_in_network,
    sortOrder: row.sort_order,
    itemCount: row.fee_schedule_items?.[0]?.count,
  };
}

function mapItem(row: Tables<'fee_schedule_items'>): FeeScheduleItem {
  return {
    id: row.id,
    scheduleId: row.schedule_id,
    code: row.code,
    description: row.description,
    feeCents: row.fee_cents,
    category: (row.category as FeeCategory) ?? 'other',
  };
}

function mapPlan(row: Tables<'insurance_plans'>): InsurancePlan {
  return {
    id: row.id,
    name: row.name,
    feeScheduleId: row.fee_schedule_id,
    preventivePct: row.preventive_pct,
    basicPct: row.basic_pct,
    majorPct: row.major_pct,
    deductibleCents: row.deductible_cents,
    deductibleWaivedPreventive: row.deductible_waived_preventive,
    annualMaxCents: row.annual_max_cents,
    writeoffApplies: row.writeoff_applies,
    officeFeesAfterMax: row.office_fees_after_max,
    isInNetwork: row.is_in_network,
    isActive: row.is_active,
  };
}

export function useFeeSchedules() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['fee-schedules', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<FeeSchedule[]> => {
      if (!ctx) return [];
      const { data, error } = await supabase
        .from('fee_schedules')
        .select('*, fee_schedule_items(count)')
        .eq('org_id', ctx.org_id)
        .order('sort_order')
        .order('name');
      if (error) throw error;

      if (!data || data.length === 0) {
        // First use: seed the office schedule plus Delta Dental MA with a
        // default plan; managers refine from there.
        const { data: seeded, error: seedError } = await supabase
          .from('fee_schedules')
          .insert([
            { org_id: ctx.org_id, name: 'Office Fee Schedule (UCR)', kind: 'office', sort_order: 0 },
            { org_id: ctx.org_id, name: 'Delta Dental MA', kind: 'carrier', sort_order: 1 },
          ])
          .select('*');
        if (seedError) throw seedError;
        const carrier = seeded?.find(s => s.kind === 'carrier');
        if (carrier) {
          await supabase.from('insurance_plans').insert({
            org_id: ctx.org_id,
            name: 'Delta Dental MA',
            fee_schedule_id: carrier.id,
          });
        }
        return (seeded ?? []).map(s => mapSchedule(s));
      }
      return data.map(mapSchedule);
    },
  });
}

export function useFeeScheduleItems(scheduleId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['fee-schedule-items', scheduleId],
    enabled: !!user && !!scheduleId,
    queryFn: async (): Promise<FeeScheduleItem[]> => {
      const { data, error } = await supabase
        .from('fee_schedule_items')
        .select('*')
        .eq('schedule_id', scheduleId!)
        .order('code');
      if (error) throw error;
      return (data ?? []).map(mapItem);
    },
  });
}

export function useUpsertFeeSchedule() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (schedule: Partial<FeeSchedule> & { name: string }) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('fee_schedules').upsert({
        ...(schedule.id ? { id: schedule.id } : {}),
        org_id: ctx.org_id,
        name: schedule.name,
        kind: schedule.kind ?? 'carrier',
        is_active: schedule.isActive ?? true,
        is_in_network: schedule.isInNetwork ?? false,
        sort_order: schedule.sortOrder ?? 99,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-schedules'] }),
  });
}

export function useDeleteFeeSchedule() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fee_schedules').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fee-schedules'] });
      qc.invalidateQueries({ queryKey: ['insurance-plans'] });
    },
  });
}

export interface ImportRow {
  code: string;
  description: string;
  feeCents: Cents;
  category?: FeeCategory;
}

/** Bulk upsert of imported/edited rows into a schedule (matched on code). */
export function useImportFeeScheduleItems() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ scheduleId, rows }: { scheduleId: string; rows: ImportRow[] }) => {
      if (!ctx) throw new Error('Not authenticated');
      if (rows.length === 0) throw new Error('No rows to import');
      const payload = rows.map(row => ({
        schedule_id: scheduleId,
        org_id: ctx.org_id,
        code: row.code,
        description: row.description,
        fee_cents: row.feeCents,
        category: row.category ?? 'other',
      }));
      // Chunk inserts to stay under request limits on big schedules.
      for (let i = 0; i < payload.length; i += 500) {
        const { error } = await supabase
          .from('fee_schedule_items')
          .upsert(payload.slice(i, i + 500), { onConflict: 'schedule_id,code' });
        if (error) throw error;
      }
      return { imported: rows.length };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-schedule-items'] }),
  });
}

export function useUpsertFeeScheduleItem() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (item: Partial<FeeScheduleItem> & { scheduleId: string; code: string }) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('fee_schedule_items').upsert(
        {
          ...(item.id ? { id: item.id } : {}),
          schedule_id: item.scheduleId,
          org_id: ctx.org_id,
          code: item.code,
          description: item.description ?? '',
          fee_cents: item.feeCents ?? 0,
          category: item.category ?? 'other',
        },
        { onConflict: 'schedule_id,code' }
      );
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-schedule-items'] }),
  });
}

export function useDeleteFeeScheduleItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fee_schedule_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fee-schedule-items'] }),
  });
}

export function useInsurancePlans() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['insurance-plans', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<InsurancePlan[]> => {
      if (!ctx) return [];
      const { data, error } = await supabase
        .from('insurance_plans')
        .select('*')
        .eq('org_id', ctx.org_id)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return (data ?? []).map(mapPlan);
    },
  });
}

export function useUpsertInsurancePlan() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (plan: Partial<InsurancePlan> & { name: string }) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('insurance_plans').upsert({
        ...(plan.id ? { id: plan.id } : {}),
        org_id: ctx.org_id,
        name: plan.name,
        fee_schedule_id: plan.feeScheduleId ?? null,
        preventive_pct: plan.preventivePct ?? 100,
        basic_pct: plan.basicPct ?? 80,
        major_pct: plan.majorPct ?? 50,
        deductible_cents: plan.deductibleCents ?? 5000,
        deductible_waived_preventive: plan.deductibleWaivedPreventive ?? true,
        annual_max_cents: plan.annualMaxCents ?? 150000,
        writeoff_applies: plan.writeoffApplies ?? true,
        office_fees_after_max: plan.officeFeesAfterMax ?? false,
        is_in_network: plan.isInNetwork ?? true,
        is_active: plan.isActive ?? true,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insurance-plans'] }),
  });
}

export function useDeleteInsurancePlan() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('insurance_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['insurance-plans'] }),
  });
}

// Named procedure bundles ("Implant", "Denture"...) — reusable groups of
// codes that expand into builder lines with current fees.

export interface ProcedureBundle {
  id: string;
  name: string;
  codes: string[];
}

export function useProcedureBundles() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['fof-bundles', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<ProcedureBundle[]> => {
      const { data, error } = await supabase
        .from('fof_procedure_bundles')
        .select('*')
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return (data ?? []).map(row => ({
        id: row.id,
        name: row.name,
        codes: Array.isArray(row.codes) ? (row.codes as string[]) : [],
      }));
    },
  });
}

export function useSaveProcedureBundle() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (bundle: { id?: string; name: string; codes: string[] }) => {
      if (!ctx) throw new Error('Not authenticated');
      if (bundle.codes.length === 0) throw new Error('Add procedures before saving a bundle');
      const { error } = await supabase.from('fof_procedure_bundles').upsert({
        ...(bundle.id ? { id: bundle.id } : {}),
        org_id: ctx.org_id,
        name: bundle.name,
        codes: bundle.codes,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-bundles'] }),
  });
}

export function useDeleteProcedureBundle() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fof_procedure_bundles').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['fof-bundles'] }),
  });
}
