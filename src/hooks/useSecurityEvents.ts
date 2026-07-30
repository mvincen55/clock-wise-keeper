import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';

// Integrity & Safety review queue.
//
// RLS does the real work here: owners and managers read these rows, and a
// person can never see an event about themselves. This hook adds no filtering
// of its own beyond ordering.

export type SecurityEvent = Tables<'security_events'>;

export function useSecurityEvents(status: 'open' | 'all' = 'open') {
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: ['security-events', ctx?.org_id, status],
    enabled: !!ctx && isAdmin,
    queryFn: async (): Promise<SecurityEvent[]> => {
      let q = supabase
        .from('security_events')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);
      if (status === 'open') q = q.eq('status', 'open');
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useResolveSecurityEvent() {
  const qc = useQueryClient();
  const { data: ctx } = useOrgContext();

  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'reviewed' | 'dismissed' }) => {
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('security_events')
        .update({
          status,
          reviewed_by: auth.user?.id ?? null,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['security-events', ctx?.org_id] });
    },
  });
}
