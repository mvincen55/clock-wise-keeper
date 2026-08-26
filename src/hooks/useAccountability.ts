import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useToast } from '@/hooks/use-toast';

export type PolicyKind =
  | 'tardy_threshold'
  | 'bypass_unresolved'
  | 'checklist_gap'
  | 'goal_stall'
  | 'onboarding_stale';

export const POLICY_LABELS: Record<PolicyKind, string> = {
  tardy_threshold: 'Late arrivals',
  bypass_unresolved: 'Unresolved clock-out bypasses',
  checklist_gap: 'Checklist gaps',
  goal_stall: 'Stalled goals',
  onboarding_stale: 'Stalled onboarding items',
};

/**
 * Record kinds cover every accountability_reports row: the policy-driven
 * ones plus records other machinery files (onboarding completion entries).
 */
export type ReportKind = PolicyKind | 'onboarding_complete';

export const REPORT_KIND_LABELS: Record<ReportKind, string> = {
  ...POLICY_LABELS,
  onboarding_complete: 'Onboarding completed',
};

export interface EscalationPolicy {
  id: string;
  org_id: string;
  kind: PolicyKind;
  threshold_count: number;
  threshold_window_days: number;
  reviewer_role: 'manager' | 'owner';
  review_due_days: number;
  escalate_to: 'owner' | null;
  escalate_after_days: number;
  is_active: boolean;
}

/** Plain-English rendering of the chain a policy plays by. */
export function chainLabel(p: EscalationPolicy): string {
  const review = `${p.reviewer_role} review (${p.review_due_days} day${p.review_due_days === 1 ? '' : 's'})`;
  const up = p.escalate_to
    ? ` → ${p.escalate_to} if idle (${p.escalate_after_days} day${p.escalate_after_days === 1 ? '' : 's'})`
    : '';
  return `member → ${review}${up}`;
}

export interface AccountabilityReport {
  id: string;
  org_id: string;
  kind: ReportKind;
  subject_user_id?: string;
  subject_employee_id?: string | null;
  period_start: string;
  period_end: string;
  summary: string;
  status: 'awaiting_member' | 'awaiting_manager' | 'awaiting_owner' | 'closed';
  member_reason: string | null;
  member_signed_name: string | null;
  member_signed_at: string | null;
  manager_note: string | null;
  manager_signed_name: string | null;
  manager_signed_at: string | null;
  review_due_at?: string | null;
  escalated_at?: string | null;
  closed_at: string | null;
  created_at: string;
}

const sel = (s: string): string => s;

/* ------------------------------ policies ------------------------------ */

export function useEscalationPolicies() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['escalation-policies', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async (): Promise<EscalationPolicy[]> => {
      const { data, error } = await supabase
        .from('escalation_policies')
        .select(sel('*'))
        .eq('org_id', ctx!.org_id)
        .order('kind')
        .returns<EscalationPolicy[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useSavePolicy() {
  const qc = useQueryClient();
  const { data: ctx } = useOrgContext();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (p: Partial<EscalationPolicy> & { kind: PolicyKind }) => {
      if (!ctx) throw new Error('Not ready');
      const row = {
        org_id: ctx.org_id,
        kind: p.kind,
        threshold_count: p.threshold_count ?? 3,
        threshold_window_days: p.threshold_window_days ?? 30,
        reviewer_role: p.reviewer_role ?? 'manager',
        review_due_days: p.review_due_days ?? 3,
        escalate_to: p.escalate_to ?? null,
        escalate_after_days: p.escalate_after_days ?? 2,
        is_active: p.is_active ?? true,
      };
      const { error } = await supabase
        .from('escalation_policies')
        .upsert(row, { onConflict: 'org_id,kind' });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['escalation-policies'] });
      toast({ title: 'Rule saved' });
    },
    onError: (e: Error) =>
      toast({ title: 'Could not save the rule', description: e.message, variant: 'destructive' }),
  });
}

/* ------------------------------- records ------------------------------- */

/**
 * The signed-in person's own records. Read through a security-definer function
 * that collapses the owner hop — a member never sees that a review moved up.
 */
export function useMyAccountabilityReports() {
  return useQuery({
    queryKey: ['my-accountability-reports'],
    queryFn: async (): Promise<AccountabilityReport[]> => {
      const { data, error } = await supabase.rpc('my_accountability_reports');
      if (error) throw error;
      return (data ?? []) as unknown as AccountabilityReport[];
    },
  });
}

/** Every record in the office — owners and managers only (RLS enforces it). */
export function useOrgAccountabilityReports(enabled = true) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['org-accountability-reports', ctx?.org_id],
    enabled: enabled && !!ctx?.org_id,
    queryFn: async (): Promise<AccountabilityReport[]> => {
      const { data, error } = await supabase
        .from('accountability_reports')
        .select(sel('*'))
        .eq('org_id', ctx!.org_id)
        .order('created_at', { ascending: false })
        .returns<AccountabilityReport[]>();
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useEmployeeAccountabilityReports(employeeId: string | undefined) {
  const { data: all = [], isLoading } = useOrgAccountabilityReports(!!employeeId);
  return {
    data: all.filter(r => r.subject_employee_id === employeeId),
    isLoading,
  };
}

export function useSignAccountabilityReport() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (v: { reportId: string; reason: string; typedName: string }) => {
      const { error } = await supabase.rpc('sign_accountability_report', {
        _report_id: v.reportId,
        _reason: v.reason,
        _typed_name: v.typedName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-accountability-reports'] });
      qc.invalidateQueries({ queryKey: ['org-accountability-reports'] });
      toast({ title: 'Signed', description: 'Your note is on the record and it goes to your manager.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Not signed', description: e.message, variant: 'destructive' }),
  });
}

export function useCountersignAccountabilityReport() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (v: { reportId: string; note: string; typedName: string }) => {
      const { error } = await supabase.rpc('countersign_accountability_report', {
        _report_id: v.reportId,
        _note: v.note,
        _typed_name: v.typedName,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-accountability-reports'] });
      toast({ title: 'Signed off', description: 'The record is closed and filed.' });
    },
    onError: (e: Error) =>
      toast({ title: 'Not signed off', description: e.message, variant: 'destructive' }),
  });
}

/** Runs the threshold scan / escalation sweep on demand. */
export function useRunAccountabilityEngine() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (action: 'scan' | 'sweep') => {
      const { data, error } = await supabase.functions.invoke('accountability-engine', {
        body: { action },
      });
      if (error) throw error;
      return data as { created?: number; escalated?: number; reminded?: number };
    },
    onSuccess: d => {
      qc.invalidateQueries({ queryKey: ['org-accountability-reports'] });
      qc.invalidateQueries({ queryKey: ['my-accountability-reports'] });
      toast({
        title: 'Checked',
        description:
          d?.created !== undefined
            ? `${d.created} new record${d.created === 1 ? '' : 's'} opened.`
            : `${d?.escalated ?? 0} moved up, ${d?.reminded ?? 0} reminded.`,
      });
    },
    onError: (e: Error) =>
      toast({ title: 'Check failed', description: e.message, variant: 'destructive' }),
  });
}
