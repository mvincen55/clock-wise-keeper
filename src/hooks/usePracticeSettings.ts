import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { roleClocksIn } from '@/lib/roles';
import { normalizePmsSystem, type PmsSystem } from '@/lib/pms';
import { DEFAULT_CONFIRMATION_LEAD_DAYS } from '@/components/goals/goal-examples';

/** Dashboard-display control for one office metric — never a secrecy claim. */
export type MetricVisibility = 'admin_only' | 'everyone' | string;

export type PracticeSettings = {
  /** Office decides whether regular members see collections on Home. */
  collections_visibility: MetricVisibility;
  /** Monthly collections target in cents. 0 = no goal configured. */
  monthly_collections_target_cents: number;
  /** Office decides whether regular members see production on Home. */
  production_visibility: MetricVisibility;
  /** Monthly production target in cents. 0 = no goal configured. */
  monthly_production_target_cents: number;
  /** Office decides whether regular members see new-patient numbers on Home. */
  new_patients_visibility: MetricVisibility;
  /** Monthly "new patients seen" goal (completed first visits). 0 = no goal. */
  monthly_new_patients_seen_target_count: number;
  /** Opt-in: allow the phone-photo fallback for Privacy View Capture. */
  mobile_capture_enabled: boolean;
  /** How many days ahead the front desk confirms appointments (goal starters use this). */
  confirmation_lead_days: number;
  /** The office's practice management system (canonical list in src/lib/pms.ts). */
  pms_system: PmsSystem;
  /** Sign-offs require a server-verified PIN; off = editable-initials fallback. */
  require_pin_on_signoff: boolean;
  /** Wrong-PIN attempts before a temporary lock. */
  pin_lockout_attempts: number;
  /** How long a locked PIN stays locked, in minutes. */
  pin_lockout_minutes: number;
};

export type PracticeSettingsPatch = Partial<PracticeSettings>;

/**
 * Rows written before the 20260803 visibility-token migration stored
 * 'team'/'admins'; every consumer (dropdown, vitals gating) expects
 * 'everyone'/'admin_only', so map the legacy tokens on read.
 */
export function normalizeCollectionsVisibility(value: string | null | undefined): string {
  if (value === 'team') return 'everyone';
  if (value === 'admins') return 'admin_only';
  return value || 'everyone';
}

/** Office-wide practice settings, readable by every member of the office. */
export function usePracticeSettings() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['practice-settings', ctx?.org_id],
    enabled: !!ctx,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<PracticeSettings> => {
      const { data } = await supabase
        .from('org_practice_settings')
        .select(
          'collections_visibility, monthly_collections_target_cents, production_visibility, monthly_production_target_cents, new_patients_visibility, monthly_new_patients_seen_target_count, mobile_capture_enabled, confirmation_lead_days, pms_system, require_pin_on_signoff, pin_lockout_attempts, pin_lockout_minutes'
        )
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      return {
        collections_visibility: normalizeCollectionsVisibility(data?.collections_visibility),
        monthly_collections_target_cents: data?.monthly_collections_target_cents ?? 0,
        production_visibility: normalizeCollectionsVisibility(data?.production_visibility),
        monthly_production_target_cents: data?.monthly_production_target_cents ?? 0,
        new_patients_visibility: normalizeCollectionsVisibility(data?.new_patients_visibility),
        monthly_new_patients_seen_target_count: data?.monthly_new_patients_seen_target_count ?? 0,
        mobile_capture_enabled: data?.mobile_capture_enabled ?? false,
        confirmation_lead_days: data?.confirmation_lead_days ?? DEFAULT_CONFIRMATION_LEAD_DAYS,
        pms_system: normalizePmsSystem(data?.pms_system),
        require_pin_on_signoff: data?.require_pin_on_signoff ?? true,
        pin_lockout_attempts: data?.pin_lockout_attempts ?? 5,
        pin_lockout_minutes: data?.pin_lockout_minutes ?? 15,
      };
    },
  });
}

export function useUpsertPracticeSettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (patch: PracticeSettingsPatch) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('org_practice_settings')
        .upsert({ org_id: ctx.org_id, ...patch }, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['practice-settings'] });
    },
  });
}

/**
 * True when this member should see the clock and be held to closeout rules.
 * Of the three membership types — Owner, Manager, Team — owners are the only
 * ones who never punch; Managers and Team always do.
 */
export function useClocksIn() {
  const { data: ctx } = useOrgContext();
  return roleClocksIn(ctx?.role);
}
