import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/pending-schema';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { ManagerFollowup, WorkState } from '@/lib/attention/types';

/**
 * Manager follow-ups: the work state and presentation state a manager
 * attaches to an attention item, keyed by the item key.
 *
 * Nothing here changes a record. Asking someone, parking, snoozing, or
 * leaving a note moves the item between the Now / Waiting / Later lists
 * and nothing else; the item leaves Attention only when its record is
 * corrected in its own editor. Rows are read by owners and managers only.
 */
export type ManagerFollowupRow = ManagerFollowup & {
  id: string;
  org_id: string;
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
};

const followupsKey = (orgId?: string) => ['manager-followups', orgId] as const;

export function useManagerFollowups(enabled = true) {
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';
  return useQuery({
    queryKey: followupsKey(ctx?.org_id),
    enabled: enabled && !!ctx?.org_id && isAdmin,
    queryFn: async (): Promise<ManagerFollowupRow[]> => {
      const { data, error } = await supabase
        .from('manager_followups')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ManagerFollowupRow[];
    },
  });
}

export type ManagerFollowupInput = {
  item_key: string;
  work_state?: WorkState;
  owner_user_id?: string | null;
  requested_at?: string | null;
  /** YYYY-MM-DD. */
  due_at?: string | null;
  /** YYYY-MM-DD. */
  parked_until?: string | null;
  /** ISO timestamp. */
  snoozed_until?: string | null;
  note?: string | null;
};

/**
 * Upsert one item's follow-up. Only the fields passed change; the row's
 * other fields keep their values, so a park does not clear a waiting state
 * and vice versa. A waiting state is stamped with `requested_at` when the
 * caller gives none.
 */
export function useSetManagerFollowup() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ManagerFollowupInput) => {
      if (!user || !ctx) throw new Error('Not authenticated');
      const { item_key, ...fields } = input;
      const waiting = fields.work_state === 'waiting_on_employee' || fields.work_state === 'waiting_on_reviewer';
      const row = {
        org_id: ctx.org_id,
        item_key,
        created_by: user.id,
        updated_by: user.id,
        ...fields,
        ...(waiting && !fields.requested_at ? { requested_at: new Date().toISOString() } : {}),
      };
      const { error } = await supabase
        .from('manager_followups')
        .upsert(row, { onConflict: 'org_id,item_key' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manager-followups'] }),
  });
}

/** Remove an item's follow-up entirely: back to needs action, nothing parked or snoozed. */
export function useClearManagerFollowup() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (itemKey: string) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('manager_followups')
        .delete()
        .eq('org_id', ctx.org_id)
        .eq('item_key', itemKey);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['manager-followups'] }),
  });
}
