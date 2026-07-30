import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import {
  clearQueuedReorder,
  isConnectivityError,
  isOnline,
  queueReorder,
  readQueuedReorder,
  type QueuedReorder,
} from '@/lib/offline-queue';


export type UserNote = {
  id: string;
  org_id: string;
  user_id: string;
  content: string;
  color: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

const KEY = ['user-notes'];

/**
 * Private sticky notes for the signed-in user. Order lives in
 * `sort_order` on the row, so the arrangement follows the person to
 * any device and survives a sign-out.
 */
export function useUserNotes() {
  const { user } = useAuth();

  return useQuery({
    queryKey: [...KEY, user?.id],
    enabled: !!user,
    queryFn: async (): Promise<UserNote[]> => {
      const { data, error } = await supabase
        .from('user_notes')
        .select('*')
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as UserNote[];
    },
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useMutation({
    mutationFn: async (input: { content?: string; color?: string; sort_order: number }) => {
      if (!user || !ctx) throw new Error('Not ready yet — try again in a moment.');
      const { data, error } = await supabase
        .from('user_notes')
        .insert({
          org_id: ctx.org_id,
          user_id: user.id,
          content: input.content ?? '',
          color: input.color ?? 'amber',
          sort_order: input.sort_order,
        })
        .select()
        .single();
      if (error) throw error;
      return data as UserNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; content?: string; color?: string }) => {
      const { error } = await supabase.from('user_notes').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

/** The single write that makes an arrangement stick. Shared with the offline replay. */
export async function writeNoteOrder(orderedIds: string[]) {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('user_notes').update({ sort_order: index }).eq('id', id)
    )
  );
  const failed = results.find(r => r.error);
  if (failed?.error) throw failed.error;
}

/**
 * Writes the new arrangement back. The board already shows the new order
 * optimistically, so this only has to make it stick — and when the connection
 * is gone it parks the arrangement locally instead of snapping the board back.
 */
export function useReorderNotes() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      if (user && !isOnline()) {
        queueReorder(user.id, orderedIds);
        return { queued: true as const };
      }
      try {
        await writeNoteOrder(orderedIds);
        if (user) clearQueuedReorder(user.id);
        return { queued: false as const };
      } catch (error) {
        if (user && isConnectivityError(error)) {
          queueReorder(user.id, orderedIds);
          return { queued: true as const };
        }
        throw error;
      }
    },
    onMutate: async (orderedIds: string[]) => {
      const key = [...KEY, user?.id];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<UserNote[]>(key);
      if (previous) {
        const byId = new Map(previous.map(n => [n.id, n]));
        qc.setQueryData<UserNote[]>(
          key,
          orderedIds
            .map((id, index) => {
              const note = byId.get(id);
              return note ? { ...note, sort_order: index } : null;
            })
            .filter((n): n is UserNote => n !== null)
        );
      }
      return { previous, key };
    },
    onError: (_err, _ids, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
    },
    onSettled: (result) => {
      // A queued reorder must not be refetched — the server still has the old
      // order and would visibly undo the drag the person just made.
      if (result?.queued) return;
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

/**
 * Watches the connection and flushes a parked arrangement the moment it comes
 * back. Returns whether something is still waiting, so the board can say so.
 */
export function useOfflineReorderSync() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [pending, setPending] = useState<QueuedReorder | null>(null);
  const flushing = useRef(false);

  const flush = useCallback(async () => {
    if (!user || flushing.current || !isOnline()) return;
    const queued = readQueuedReorder(user.id);
    if (!queued) {
      setPending(null);
      return;
    }
    flushing.current = true;
    try {
      await writeNoteOrder(queued.orderedIds);
      clearQueuedReorder(user.id);
      setPending(null);
      qc.invalidateQueries({ queryKey: KEY });
      toast.success('Your note order is synced.');
    } catch (error) {
      // Still offline or the write failed — leave it parked and try again later.
      if (!isConnectivityError(error)) {
        clearQueuedReorder(user.id);
        setPending(null);
      }
    } finally {
      flushing.current = false;
    }
  }, [qc, user]);

  useEffect(() => {
    if (!user) return;
    setPending(readQueuedReorder(user.id));
    void flush();

    const onOnline = () => void flush();
    const onOffline = () => setPending(readQueuedReorder(user.id));
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    // Coming back to the tab is as good a signal as the online event.
    const onVisible = () => document.visibilityState === 'visible' && void flush();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [flush, user]);

  return { pending, refresh: () => user && setPending(readQueuedReorder(user.id)) };
}

