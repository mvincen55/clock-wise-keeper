import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/pending-schema';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';
import type { Cents } from '@/lib/fof/types';
import type { FeeCategory, PlanRules } from '@/lib/fof/insurance';
import { OFFICE_FEE_LOOKUP_KEY } from '@/hooks/useOfficeFeeLookup';

// Fee schedules, items, and insurance plans — de-identified configuration
// only. No patient data flows through these hooks.
//
// Reads are reads: nothing in a query function writes. First-use seeding is
// an explicit owner/manager action (useSeedFeeSchedules) so an ordinary
// staff member's first visit never attempts an admin-only insert and never
// fails a page load on a 42501.

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
  /**
   * Carrier schedules only: this row is the office's own fee, not a rate
   * the carrier negotiated (Dentrix prints those with a trailing '*').
   * The FOF treats it as "no allowable" so the estimate follows the
   * current office fee instead of a copy that goes stale.
   */
  isOfficeFee: boolean;
  /** Wording & policy notes for the team and the AI (FOF + Ask AI). */
  notes: string;
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
  sortOrder: number;
  /** null = follow the office FOF setting; true/false = this plan's own downgrade rule. */
  alternateBenefitDowngrade: boolean | null;
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
    isOfficeFee: row.is_office_fee ?? false,
    notes: row.notes ?? '',
  };
}

type PlanRow = Tables<'insurance_plans'> & { alternate_benefit_downgrade?: boolean | null };

function mapPlan(row: PlanRow): InsurancePlan {
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
    sortOrder: row.sort_order,
    alternateBenefitDowngrade: row.alternate_benefit_downgrade ?? null,
  };
}

export const FEE_SCHEDULES_KEY = 'fee-schedules';
export const FEE_SCHEDULE_ITEMS_KEY = 'fee-schedule-items';
export const INSURANCE_PLANS_KEY = 'insurance-plans';

/** Every schedule in the office (active and inactive). Pure read. */
export function useFeeSchedules() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: [FEE_SCHEDULES_KEY, ctx?.org_id],
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
      return (data ?? []).map(mapSchedule);
    },
  });
}

/**
 * First use for an office with no schedules at all: create the office fee
 * schedule (and nothing else). Owners and managers only — it is a write.
 */
export function useSeedFeeSchedules() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!ctx) throw new Error('Not authenticated');
      if (!['owner', 'manager'].includes(ctx.role)) throw new Error('Owner or manager access required');
      const { data: existing, error: readError } = await supabase
        .from('fee_schedules')
        .select('id')
        .eq('org_id', ctx.org_id)
        .eq('kind', 'office')
        .limit(1);
      if (readError) throw readError;
      if (existing && existing.length > 0) return { created: false };
      const { error } = await supabase
        .from('fee_schedules')
        .insert({ org_id: ctx.org_id, name: 'Office Fee Schedule', kind: 'office', sort_order: 0 });
      if (error) throw error;
      return { created: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FEE_SCHEDULES_KEY] });
      qc.invalidateQueries({ queryKey: [OFFICE_FEE_LOOKUP_KEY] });
    },
  });
}

/** Rows of one schedule, paged past PostgREST's 1,000-row response cap. */
export async function fetchFeeScheduleItems(scheduleId: string): Promise<FeeScheduleItem[]> {
  // A full office schedule runs past the 1,000-row response cap, which
  // silently dropped every code after the cap in code order (D9xxx never
  // reached the FOF builder). Page until a short page comes back.
  const PAGE = 1000;
  const rows: FeeScheduleItem[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('fee_schedule_items')
      .select('*')
      .eq('schedule_id', scheduleId)
      .order('code')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const row of data ?? []) rows.push(mapItem(row));
    if (!data || data.length < PAGE) break;
  }
  return rows;
}

export function useFeeScheduleItems(scheduleId: string | null) {
  const { user } = useAuth();

  return useQuery({
    queryKey: [FEE_SCHEDULE_ITEMS_KEY, scheduleId],
    enabled: !!user && !!scheduleId,
    queryFn: () => fetchFeeScheduleItems(scheduleId!),
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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FEE_SCHEDULES_KEY] });
      qc.invalidateQueries({ queryKey: [OFFICE_FEE_LOOKUP_KEY] });
    },
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
      qc.invalidateQueries({ queryKey: [FEE_SCHEDULES_KEY] });
      qc.invalidateQueries({ queryKey: [INSURANCE_PLANS_KEY] });
      qc.invalidateQueries({ queryKey: [OFFICE_FEE_LOOKUP_KEY] });
    },
  });
}

export interface ImportRow {
  code: string;
  description: string;
  feeCents: Cents;
  category?: FeeCategory;
  /** Fee carried a trailing '*': the office fee, not a contracted rate. */
  isOfficeFee?: boolean;
}

export interface ImportResult {
  /** Rows the database now holds exactly as sent (verified by reading back). */
  imported: number;
  /** Codes that were on the schedule before and were updated. */
  updated: number;
  /** Codes that were new to the schedule. */
  added: number;
}

/** Thrown when a batch failed: says what happened to the schedule. */
export class FeeImportError extends Error {
  constructor(message: string, readonly rolledBack: boolean, readonly appliedRows: number) {
    super(message);
    this.name = 'FeeImportError';
  }
}

const CHUNK = 500;

/**
 * Bulk upsert of imported/edited rows into a schedule (matched on code).
 *
 * The write runs in chunks, so a late chunk can fail after earlier ones
 * landed. To keep the schedule as it was, the rows the import touches are
 * snapshotted first; on any failure the touched codes are put back (updated
 * rows restored, newly added codes removed) before the error is reported.
 * After a successful write every row is read back and compared, so
 * "imported" is only ever said about rows the database actually holds.
 */
export function useImportFeeScheduleItems() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ scheduleId, rows }: { scheduleId: string; rows: ImportRow[] }): Promise<ImportResult> => {
      if (!ctx) throw new Error('Not authenticated');
      if (!['owner', 'manager'].includes(ctx.role)) throw new Error('Owner or manager access required');
      if (rows.length === 0) throw new Error('No rows to import');
      // The last occurrence of a duplicated code wins, matching the upsert.
      const byCode = new Map<string, ImportRow>();
      for (const row of rows) byCode.set(row.code.trim().toUpperCase(), { ...row, code: row.code.trim().toUpperCase() });
      const unique = [...byCode.values()];

      const before = await fetchFeeScheduleItems(scheduleId);
      const beforeByCode = new Map(before.map(item => [item.code.toUpperCase(), item]));
      const payload = unique.map(row => ({
        schedule_id: scheduleId,
        org_id: ctx.org_id,
        code: row.code,
        description: row.description,
        fee_cents: row.feeCents,
        category: row.category ?? 'other',
        is_office_fee: row.isOfficeFee ?? false,
      }));

      let applied = 0;
      try {
        for (let i = 0; i < payload.length; i += CHUNK) {
          const chunk = payload.slice(i, i + CHUNK);
          const { error } = await supabase
            .from('fee_schedule_items')
            .upsert(chunk, { onConflict: 'schedule_id,code' });
          if (error) throw error;
          applied += chunk.length;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'The import failed.';
        if (applied === 0) throw new FeeImportError(`Import failed before any row was written: ${message}. The schedule is unchanged.`, true, 0);
        // Put the touched codes back the way they were.
        const touched = payload.slice(0, applied);
        const restore = touched
          .filter(row => beforeByCode.has(row.code))
          .map(row => {
            const prev = beforeByCode.get(row.code)!;
            return {
              schedule_id: scheduleId, org_id: ctx.org_id, code: prev.code, description: prev.description,
              fee_cents: prev.feeCents, category: prev.category, is_office_fee: prev.isOfficeFee, notes: prev.notes,
            };
          });
        const remove = touched.filter(row => !beforeByCode.has(row.code)).map(row => row.code);
        let rolledBack = true;
        for (let i = 0; i < restore.length; i += CHUNK) {
          const { error: restoreError } = await supabase.from('fee_schedule_items').upsert(restore.slice(i, i + CHUNK), { onConflict: 'schedule_id,code' });
          if (restoreError) rolledBack = false;
        }
        for (let i = 0; i < remove.length; i += CHUNK) {
          const { error: removeError } = await supabase.from('fee_schedule_items').delete().eq('schedule_id', scheduleId).in('code', remove.slice(i, i + CHUNK));
          if (removeError) rolledBack = false;
        }
        throw new FeeImportError(
          rolledBack
            ? `Import failed part-way (${message}). The ${applied} rows already written were put back to their previous values, so the schedule is unchanged.`
            : `Import failed part-way (${message}) and ${applied} rows could not all be restored. Re-import the full file to bring the schedule back in line.`,
          rolledBack,
          applied,
        );
      }

      // Verify: every sent row must now be on the schedule with the sent values.
      const after = await fetchFeeScheduleItems(scheduleId);
      const afterByCode = new Map(after.map(item => [item.code.toUpperCase(), item]));
      const missing = payload.filter(row => {
        const saved = afterByCode.get(row.code);
        return !saved || saved.feeCents !== row.fee_cents || saved.isOfficeFee !== row.is_office_fee || saved.category !== row.category;
      });
      if (missing.length > 0) {
        throw new FeeImportError(`${missing.length} of ${payload.length} rows did not verify after the write (first: ${missing[0].code}). Re-import the file.`, false, applied);
      }
      const added = payload.filter(row => !beforeByCode.has(row.code)).length;
      return { imported: payload.length, updated: payload.length - added, added };
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: [FEE_SCHEDULE_ITEMS_KEY] });
      qc.invalidateQueries({ queryKey: [FEE_SCHEDULES_KEY] });
      qc.invalidateQueries({ queryKey: [OFFICE_FEE_LOOKUP_KEY] });
    },
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
          // Conditional like notes: editing a fee by hand must not clear
          // the office-fee marker that came in from the import.
          ...(item.isOfficeFee !== undefined ? { is_office_fee: item.isOfficeFee } : {}),
          ...(item.notes !== undefined ? { notes: item.notes } : {}),
        },
        { onConflict: 'schedule_id,code' }
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FEE_SCHEDULE_ITEMS_KEY] });
      qc.invalidateQueries({ queryKey: [FEE_SCHEDULES_KEY] });
      qc.invalidateQueries({ queryKey: [OFFICE_FEE_LOOKUP_KEY] });
    },
  });
}

export function useDeleteFeeScheduleItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('fee_schedule_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [FEE_SCHEDULE_ITEMS_KEY] });
      qc.invalidateQueries({ queryKey: [FEE_SCHEDULES_KEY] });
      qc.invalidateQueries({ queryKey: [OFFICE_FEE_LOOKUP_KEY] });
    },
  });
}

export function useInsurancePlans() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: [INSURANCE_PLANS_KEY, ctx?.org_id],
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
      return (data ?? []).map(row => mapPlan(row as PlanRow));
    },
  });
}

export type InsurancePlanInput = Omit<InsurancePlan, 'id' | 'sortOrder'> & { id?: string; sortOrder?: number };

export function useUpsertInsurancePlan() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (plan: InsurancePlanInput) => {
      if (!ctx) throw new Error('Not authenticated');
      if (!['owner', 'manager'].includes(ctx.role)) throw new Error('Owner or manager access required');
      const name = plan.name.trim();
      if (!name) throw new Error('Give the plan a name');
      const pct = (value: number, label: string) => {
        if (!Number.isInteger(value) || value < 0 || value > 100) throw new Error(`${label} coverage must be a whole number from 0 to 100`);
        return value;
      };
      const cents = (value: number, label: string) => {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a dollar amount of $0.00 or more`);
        return value;
      };
      const { error } = await supabase.from('insurance_plans').upsert({
        ...(plan.id ? { id: plan.id } : {}),
        org_id: ctx.org_id,
        name,
        fee_schedule_id: plan.feeScheduleId ?? null,
        preventive_pct: pct(plan.preventivePct, 'Preventive'),
        basic_pct: pct(plan.basicPct, 'Basic'),
        major_pct: pct(plan.majorPct, 'Major'),
        deductible_cents: cents(plan.deductibleCents, 'Deductible'),
        deductible_waived_preventive: plan.deductibleWaivedPreventive,
        annual_max_cents: cents(plan.annualMaxCents, 'Annual maximum'),
        writeoff_applies: plan.writeoffApplies,
        office_fees_after_max: plan.officeFeesAfterMax ?? false,
        is_in_network: plan.isInNetwork,
        is_active: plan.isActive,
        sort_order: plan.sortOrder ?? 0,
        alternate_benefit_downgrade: plan.alternateBenefitDowngrade ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [INSURANCE_PLANS_KEY] }),
  });
}

export function useDeleteInsurancePlan() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('insurance_plans').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [INSURANCE_PLANS_KEY] }),
  });
}

// Office overrides for the patient-facing name of a code — what prints on
// the form. Owners/managers edit them; everyone can read them (RLS).

/**
 * Overrides keyed by uppercase code, ready for resolvePatientName.
 * Absent overrides simply fall back to the built-in CDT names.
 */
export function useCodeNames() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['fof-code-names', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<Record<string, string>> => {
      const { data, error } = await supabase.from('fof_code_names').select('code, patient_name');
      if (error) throw error;
      const map: Record<string, string> = {};
      for (const row of data ?? []) {
        const name = (row.patient_name ?? '').trim();
        if (name) map[row.code.trim().toUpperCase()] = name;
      }
      return map;
    },
  });
}

// Patient-friendly names now live on the canonical procedure_meta row (the
// single editable source). This writes there; a DB trigger mirrors the name
// into fof_code_names so all existing readers (FOF + consents) are unchanged.
// Clearing the field empties the patient name (built-in name is used again).
export function useUpsertCodeName() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ code, patientName }: { code: string; patientName: string }) => {
      if (!ctx) throw new Error('Not authenticated');
      const key = code.trim().toUpperCase();
      if (!key) throw new Error('Missing code');
      const { error } = await supabase.from('procedure_meta').upsert(
        { org_id: ctx.org_id, code: key, patient_name: patientName.trim() },
        { onConflict: 'org_id,code' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['fof-code-names'] });
      qc.invalidateQueries({ queryKey: ['procedure-meta'] });
    },
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
