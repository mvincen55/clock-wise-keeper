import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Json, Tables } from '@/integrations/supabase/types';
import type {
  ClassifiedBlock,
  LayoutProfile,
  LayoutSignature,
  PhraseRule,
  ProviderDayMetrics,
  StatusLegendEntry,
} from '@/lib/schedule-reader/types';
import { sanitizePhrase } from '@/lib/schedule-reader/note-classifier';

// Schedule Intelligence storage hooks. Everything saved through this file is
// sanitized, aggregate data: layout geometry, status colors, minute totals,
// counts, and classification codes. Screenshots and OCR text never reach
// these hooks — the schedule-reader pipeline destroys them in the browser.

// ---------------------------------------------------------------------------
// Layout profiles
// ---------------------------------------------------------------------------

export type LayoutProfileRow = Tables<'schedule_layout_profiles'>;

export function toLayoutProfile(row: LayoutProfileRow): LayoutProfile {
  return {
    id: row.id,
    name: row.name,
    pmsName: row.pms_name,
    signature: row.layout_signature as unknown as LayoutSignature,
    statusLegend: row.status_legend as unknown as StatusLegendEntry[],
  };
}

export function useLayoutProfiles() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['schedule-layout-profiles', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_layout_profiles')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('is_default', { ascending: false });
      if (error) throw error;
      return (data ?? []) as LayoutProfileRow[];
    },
  });
}

export function useSaveLayoutProfile() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id?: string;
      name: string;
      pmsName: string | null;
      isDefault: boolean;
      signature: LayoutSignature;
      statusLegend: StatusLegendEntry[];
    }) => {
      if (!ctx) throw new Error('Not authenticated');
      const row = {
        org_id: ctx.org_id,
        name: input.name,
        pms_name: input.pmsName,
        is_default: input.isDefault,
        layout_signature: input.signature as unknown as Json,
        status_legend: input.statusLegend as unknown as Json,
      };
      const { error } = input.id
        ? await supabase.from('schedule_layout_profiles').update(row).eq('id', input.id)
        : await supabase.from('schedule_layout_profiles').insert(row);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule-layout-profiles'] }),
  });
}

// ---------------------------------------------------------------------------
// Staffing rules
// ---------------------------------------------------------------------------

export type StaffingRuleRow = Tables<'schedule_staffing_rules'>;

/**
 * Sensible starting expectations — every office reviews and adjusts these
 * during Schedule Intelligence setup. Nothing here is treated as universal
 * truth; the office's saved rules are the only rules.
 */
export const DEFAULT_STAFFING_RULES: Array<
  Pick<
    StaffingRuleRow,
    'department' | 'provider_role' | 'support_role' | 'provider_count' | 'support_count' | 'max_simultaneous_columns'
  >
> = [
  {
    department: 'hygiene',
    provider_role: 'hygienist',
    support_role: null,
    provider_count: 1,
    support_count: null,
    max_simultaneous_columns: 1,
  },
  {
    department: 'doctor',
    provider_role: 'dentist',
    support_role: 'dental_assistant',
    provider_count: 1,
    support_count: 1,
    max_simultaneous_columns: 2,
  },
  {
    department: 'front_desk',
    provider_role: 'front_desk',
    support_role: null,
    provider_count: 1,
    support_count: null,
    max_simultaneous_columns: null,
  },
];

export function useStaffingRules() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['schedule-staffing-rules', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_staffing_rules')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('is_active', true)
        .order('department');
      if (error) throw error;
      return (data ?? []) as StaffingRuleRow[];
    },
  });
}

export function useSaveStaffingRule() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      id?: string;
      department: string;
      providerRole: string;
      supportRole: string | null;
      providerCount: number;
      supportCount: number | null;
      maxSimultaneousColumns: number | null;
    }) => {
      if (!ctx) throw new Error('Not authenticated');
      const row = {
        org_id: ctx.org_id,
        department: input.department,
        provider_role: input.providerRole,
        support_role: input.supportRole,
        provider_count: input.providerCount,
        support_count: input.supportCount,
        max_simultaneous_columns: input.maxSimultaneousColumns,
        is_active: true,
      };
      const { error } = input.id
        ? await supabase.from('schedule_staffing_rules').update(row).eq('id', input.id)
        : await supabase.from('schedule_staffing_rules').insert(row);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule-staffing-rules'] }),
  });
}

export function useDeleteStaffingRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('schedule_staffing_rules')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule-staffing-rules'] }),
  });
}

// ---------------------------------------------------------------------------
// Phrase rules
// ---------------------------------------------------------------------------

export function usePhraseRules() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['schedule-phrase-rules', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('schedule_phrase_rules')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('is_active', true)
        .order('phrase');
      if (error) throw error;
      return (data ?? []) as Tables<'schedule_phrase_rules'>[];
    },
  });
}

/** Phrase rules in the shape the local classifier consumes. */
export function toClassifierRules(rows: Tables<'schedule_phrase_rules'>[] | undefined): PhraseRule[] {
  return (rows ?? []).map(r => ({
    phrase: r.phrase,
    code: r.classification_code as PhraseRule['code'],
  }));
}

export function useAddPhraseRule() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: { phrase: string; code: PhraseRule['code'] }) => {
      if (!ctx || !user) throw new Error('Not authenticated');
      // Same sanitizer the classifier applies: short generic office phrases
      // only — no names, no narratives, no numbers that look like phones.
      const phrase = sanitizePhrase(input.phrase);
      if (!phrase) {
        throw new Error('Keep phrases short and generic — a few plain words, no names or numbers.');
      }
      const { error } = await supabase.from('schedule_phrase_rules').insert({
        org_id: ctx.org_id,
        phrase,
        classification_code: input.code,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule-phrase-rules'] }),
  });
}

export function useRemovePhraseRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('schedule_phrase_rules')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['schedule-phrase-rules'] }),
  });
}

// ---------------------------------------------------------------------------
// Provider metrics + block entries (per closeout)
// ---------------------------------------------------------------------------

export function useProviderDayMetrics(closeoutId: string | null) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['provider-day-metrics', ctx?.org_id, closeoutId],
    enabled: !!ctx?.org_id && !!closeoutId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('provider_day_metrics')
        .select('*')
        .eq('closeout_id', closeoutId!)
        .order('provider_label');
      if (error) throw error;
      return (data ?? []) as Tables<'provider_day_metrics'>[];
    },
  });
}

/** Recent history for coaching/goal baselines (aggregates only). */
export function useProviderMetricsHistory(days = 30) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['provider-metrics-history', ctx?.org_id, days],
    enabled: !!ctx?.org_id,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const { data, error } = await supabase
        .from('provider_day_metrics')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .gte('business_date', since.toISOString().slice(0, 10))
        .order('business_date', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Tables<'provider_day_metrics'>[];
    },
  });
}

function metricsToRow(
  m: ProviderDayMetrics,
  orgId: string,
  closeoutId: string,
  userId: string
) {
  return {
    org_id: orgId,
    closeout_id: closeoutId,
    employee_id: m.employeeId,
    provider_label: m.providerLabel,
    provider_role: m.providerRole,
    department: m.department,
    business_date: m.businessDate,
    gross_available_minutes: m.grossAvailableMinutes,
    intentional_unavailable_minutes: m.intentionalUnavailableMinutes,
    net_bookable_minutes: m.netBookableMinutes,
    scheduled_minutes: m.scheduledMinutes,
    true_open_minutes: m.trueOpenMinutes,
    cancellation_count: m.cancellationCount,
    cancellation_open_minutes: m.cancellationOpenMinutes,
    no_show_count: m.noShowCount,
    no_show_open_minutes: m.noShowOpenMinutes,
    other_open_minutes: m.otherOpenMinutes,
    unclassified_minutes: m.unclassifiedMinutes,
    recovered_minutes: m.recoveredMinutes,
    recovered_open_pct: m.recoveredOpenPct,
    same_day_additions: m.sameDayAdditions,
    overlap_minutes: m.overlapMinutes,
    longest_booked_stretch_minutes: m.longestBookedStretchMinutes,
    continuous_without_buffer_minutes: m.continuousWithoutBufferMinutes,
    active_columns: m.activeColumns,
    simultaneous_column_minutes: m.simultaneousColumnMinutes,
    schedule_density: m.scheduleDensity,
    schedule_volatility: m.scheduleVolatility,
    support_staff_assigned: m.supportStaffAssigned,
    staffing_to_column_ratio: m.staffingToColumnRatio,
    automated_workload_class: m.automatedWorkloadClass,
    confidence: m.confidence,
    review_status: m.reviewStatus,
    created_by: userId,
  };
}

/**
 * Persist confirmed schedule metrics for a closeout. Replaces any prior
 * metrics for the same closeout (re-capture overwrites, no stacking).
 * Only referee-validated, user-reviewed aggregates belong here.
 */
export function useSaveScheduleMetrics() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      closeoutId: string;
      businessDate: string;
      providers: ProviderDayMetrics[];
      blocks: ClassifiedBlock[];
      captureConfidence: number;
      needsReview: boolean;
    }) => {
      if (!ctx || !user) throw new Error('Not authenticated');

      await supabase.from('provider_day_metrics').delete().eq('closeout_id', input.closeoutId);
      await supabase.from('schedule_block_entries').delete().eq('closeout_id', input.closeoutId);

      if (input.providers.length > 0) {
        const { error } = await supabase
          .from('provider_day_metrics')
          .insert(input.providers.map(m => metricsToRow(m, ctx.org_id, input.closeoutId, user.id)));
        if (error) throw error;
      }

      if (input.blocks.length > 0) {
        const { error } = await supabase.from('schedule_block_entries').insert(
          input.blocks.map(b => ({
            org_id: ctx.org_id,
            closeout_id: input.closeoutId,
            business_date: input.businessDate,
            provider_label: b.providerLabel,
            department: b.department,
            classification_code: b.code,
            excluded_minutes: b.minutes,
            confidence: b.confidence,
            user_confirmed: b.userConfirmed,
            created_by: user.id,
          }))
        );
        if (error) throw error;
      }

      const { error } = await supabase
        .from('deposit_logs')
        .update({
          schedule_capture_status: 'confirmed',
          capture_confidence: input.captureConfidence,
          needs_manager_review: input.needsReview,
        })
        .eq('id', input.closeoutId);
      if (error) throw error;
    },
    onSuccess: (_, input) => {
      qc.invalidateQueries({ queryKey: ['provider-day-metrics'] });
      qc.invalidateQueries({ queryKey: ['provider-metrics-history'] });
      qc.invalidateQueries({ queryKey: ['deposit-log', ctx?.org_id, input.businessDate] });
    },
  });
}
