import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  DEFAULT_MESSAGING_SETTINGS,
  DEFAULT_OWNER_PREFS,
  type MessagingSettings,
  type OwnerBoardPrefs,
} from '@/lib/messaging-settings';

/** Office-wide wording, categories and retention for the messaging feature. */
export function useMessagingSettings() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['messaging-settings', ctx?.org_id],
    enabled: !!ctx?.org_id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<MessagingSettings> => {
      const { data } = await supabase
        .from('org_messaging_settings')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .maybeSingle();
      if (!data) return DEFAULT_MESSAGING_SETTINGS;
      return {
        enabled: data.enabled,
        messages_label: data.messages_label,
        requests_label: data.requests_label,
        categories: data.categories ?? DEFAULT_MESSAGING_SETTINGS.categories,
        retention_days: data.retention_days,
        closeout_cutoff_minutes: data.closeout_cutoff_minutes,
        closeout_item_enabled: data.closeout_item_enabled,
      };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<MessagingSettings>) => {
      if (!ctx?.org_id) throw new Error('No organization yet.');
      const next = { ...(query.data ?? DEFAULT_MESSAGING_SETTINGS), ...patch };
      const { error } = await supabase
        .from('org_messaging_settings')
        .upsert({ org_id: ctx.org_id, ...next }, { onConflict: 'org_id' });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messaging-settings'] }),
  });

  return {
    settings: query.data ?? DEFAULT_MESSAGING_SETTINGS,
    isLoading: query.isLoading,
    save,
  };
}

/**
 * The doctor's own switches. Read and written by him only — the RLS policy on
 * owner_board_prefs makes "the manager turns it on for him" impossible.
 */
export function useOwnerBoardPrefs() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isOwner = ctx?.role === 'owner';
  const qc = useQueryClient();

  const query = useQuery({
    queryKey: ['owner-board-prefs', user?.id],
    enabled: !!user && isOwner,
    staleTime: 60_000,
    queryFn: async (): Promise<OwnerBoardPrefs> => {
      const { data } = await supabase
        .from('owner_board_prefs')
        .select('share_with_manager, digest_frequency')
        .eq('user_id', user!.id)
        .maybeSingle();
      if (!data) return DEFAULT_OWNER_PREFS;
      return {
        share_with_manager: data.share_with_manager,
        digest_frequency: data.digest_frequency as OwnerBoardPrefs['digest_frequency'],
      };
    },
  });

  const save = useMutation({
    mutationFn: async (patch: Partial<OwnerBoardPrefs>) => {
      if (!user || !ctx || !isOwner) throw new Error('Only the doctor can change this.');
      const next = { ...(query.data ?? DEFAULT_OWNER_PREFS), ...patch };
      const { error } = await supabase
        .from('owner_board_prefs')
        .upsert({ user_id: user.id, org_id: ctx.org_id, ...next }, { onConflict: 'user_id' });
      if (error) throw error;

      // Sharing is one decision, not a per-item chore: flipping it brings the
      // whole list with it, and flipping it back takes it all away again.
      if (patch.share_with_manager !== undefined) {
        await supabase
          .from('doctor_board_items')
          .update({ visible_to_manager: patch.share_with_manager })
          .eq('owner_user_id', user.id);
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['owner-board-prefs'] });
      qc.invalidateQueries({ queryKey: ['doctor-board'] });
    },
  });

  return { prefs: query.data ?? DEFAULT_OWNER_PREFS, isLoading: query.isLoading, save };
}
