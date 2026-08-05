import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useToast } from '@/hooks/use-toast';
import type { Tables } from '@/integrations/supabase/types';

export type PendingInvite = Tables<'org_invites'>;

/**
 * Outstanding (not-yet-accepted) invites for the current org, newest first.
 * Readable by owners/managers via the "Org admins manage invites" RLS policy.
 */
export function usePendingInvites() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['pending-invites', ctx?.org_id],
    enabled: !!ctx?.org_id,
    queryFn: async (): Promise<PendingInvite[]> => {
      const { data, error } = await supabase
        .from('org_invites')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .is('accepted_at', null)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Revokes an outstanding invite (deletes the row). */
export function useRevokeInvite() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (inviteId: string) => {
      const { error } = await supabase.from('org_invites').delete().eq('id', inviteId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pending-invites', ctx?.org_id] });
      toast({ title: 'Invite revoked' });
    },
    onError: (e: unknown) =>
      toast({
        title: 'Could not revoke invite',
        description: e instanceof Error ? e.message : 'Unexpected error',
        variant: 'destructive',
      }),
  });
}
