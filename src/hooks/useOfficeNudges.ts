import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

/**
 * Office nudges: the quiet notes the office AI leaves for a person, each one
 * carrying the recorded data it was based on. Members decide what happens to
 * them — "On it" or "Not for me" — and dismissals teach the system to stay
 * quieter about that kind of thing.
 */

export type NudgeStatus = 'new' | 'shown' | 'acted_on' | 'dismissed';

export type OfficeNudge = {
  id: string;
  kind: string;
  surface: string;
  content: string;
  data_refs: Record<string, unknown>;
  status: NudgeStatus;
  created_at: string;
  resolved_at: string | null;
  user_id: string | null;
};

const OPEN: NudgeStatus[] = ['new', 'shown'];

export function useOfficeNudges(includeResolved = false) {
  const { data: ctx } = useOrgContext();
  const { user } = useAuth();

  return useQuery({
    queryKey: ['office-nudges', ctx?.org_id, user?.id, includeResolved],
    enabled: !!ctx?.org_id && !!user?.id,
    queryFn: async (): Promise<OfficeNudge[]> => {
      let q = supabase
        .from('office_nudges')
        .select('id, kind, surface, content, data_refs, status, created_at, resolved_at, user_id')
        .eq('org_id', ctx!.org_id)
        .order('created_at', { ascending: false })
        .limit(100);
      if (!includeResolved) q = q.in('status', OPEN);

      const { data, error } = await q;
      // Fails open: an empty inbox is never an error state for the member.
      if (error) return [];
      return (data ?? []).map(n => ({
        ...n,
        data_refs: (n.data_refs ?? {}) as Record<string, unknown>,
      })) as OfficeNudge[];
    },
  });
}

/** Count of open nudges, for the sidebar badge. */
export function useOpenNudgeCount() {
  const { data } = useOfficeNudges(false);
  return data?.length ?? 0;
}

export function useResolveNudge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: string; status: 'acted_on' | 'dismissed' }) => {
      const { error } = await supabase
        .from('office_nudges')
        .update({ status, resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
      return status;
    },
    onSuccess: status => {
      qc.invalidateQueries({ queryKey: ['office-nudges'] });
      qc.invalidateQueries({ queryKey: ['sprint-suggestion'] });
      toast(
        status === 'acted_on'
          ? 'Marked as on it.'
          : "Noted — you'll see fewer of these.",
        { duration: 4000 }
      );
    },
    onError: () => toast.error('Could not update that just now.'),
  });
}
