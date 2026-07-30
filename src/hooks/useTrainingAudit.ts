import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';

// The training auditor: a quiet second read of every AI-written module against
// the office's own rules. It never blocks publishing — findings just surface a
// "needs review" flag for owners and managers.

export type AuditFinding = {
  id: string;
  org_id: string;
  module_id: string;
  severity: 'critical' | 'warning' | 'info';
  category: string;
  quote: string;
  note: string;
  suggested_fix: string;
  status: 'open' | 'dismissed' | 'fixed';
  created_at: string;
};

/** Open findings across the library — owners and managers only (RLS). */
export function useAuditFindings() {
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  return useQuery({
    queryKey: ['training-audit', ctx?.org_id],
    enabled: !!ctx && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_audit_findings')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('status', 'open')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as AuditFinding[];
    },
  });
}

/** Run the review. Fail-open: a review that cannot run is not an error. */
export function useRunAudit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (moduleId: string) => {
      const { data, error } = await supabase.functions.invoke('training-auditor', {
        body: { moduleId },
      });
      if (error) return { ok: false, findings: [] };
      return (data ?? { ok: true, findings: [] }) as { ok: boolean; findings: unknown[] };
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-audit'] }),
  });
}

export function useResolveFinding() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'dismissed' | 'fixed' }) => {
      const { error } = await supabase
        .from('training_audit_findings')
        .update({ status })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['training-audit'] }),
  });
}
