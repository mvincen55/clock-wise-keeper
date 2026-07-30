import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import type { Tables } from '@/integrations/supabase/types';

export type ChecklistBypass = Tables<'checklist_bypasses'>;

/** The member's own bypasses that still need a reason. Never blocks anything. */
export function useUnresolvedBypasses() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['checklist-bypasses', 'unresolved', user?.id],
    enabled: !!user,
    queryFn: async (): Promise<ChecklistBypass[]> => {
      const { data, error } = await supabase
        .from('checklist_bypasses')
        .select('*')
        .eq('user_id', user!.id)
        .eq('resolved', false)
        .order('checklist_date', { ascending: true });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Reason submission is a direct RLS-guarded update — no edge function. */
export function useSubmitBypassReason() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) => {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('checklist_bypasses')
        .update({
          reason: reason.trim(),
          reason_submitted_at: now,
          resolved: true,
          resolved_at: now,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['checklist-bypasses'] });
    },
  });
}

/** Admin view: every bypass in the org, read-only. */
export function useOrgBypasses(orgId?: string) {
  return useQuery({
    queryKey: ['checklist-bypasses', 'org', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<(ChecklistBypass & { display_name: string })[]> => {
      const { data, error } = await supabase
        .from('checklist_bypasses')
        .select('*')
        .eq('org_id', orgId!)
        .order('checklist_date', { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = data ?? [];
      if (!rows.length) return [];

      const { data: emps } = await supabase
        .from('employees')
        .select('id, display_name')
        .in('id', Array.from(new Set(rows.map(r => r.employee_id))));
      const names = new Map((emps ?? []).map(e => [e.id, e.display_name]));

      return rows.map(r => ({ ...r, display_name: names.get(r.employee_id) || 'Team member' }));
    },
  });
}
