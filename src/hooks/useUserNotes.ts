import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

export type UserNote = {
  id: string;
  org_id: string;
  user_id: string;
  content: string;
  color: string;
  sort_order: number;
  /** Bumped once per reorder. Two devices can't write the same revision. */
  order_rev: number;
  created_at: string;
  updated_at: string;
};

const KEY = ['user-notes'];

/** The order revision the board is currently looking at. */
export function orderRevOf(notes: UserNote[] | undefined): number {
  return (notes ?? []).reduce((max, n) => Math.max(max, n.order_rev ?? 0), 0);
}

/**
 * Live sync for the signed-in person's notes.
 *
 * A reorder on a phone lands here on the laptop within a moment, so the two
 * boards stay on the same revision and the conflict path stays rare.
 */
export function useUserNotesRealtime() {
  const qc = useQueryClient();
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`user-notes-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'user_notes', filter: `user_id=eq.${user.id}` },
        () => {
          qc.invalidateQueries({ queryKey: [...KEY, user.id] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc, user]);
}

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

/**
 * Writes the new arrangement back — conflict-safe.
 *
 * The whole order goes to the database in a single guarded call that carries
 * the revision this board was looking at. If another device reordered in the
 * meantime the call is refused rather than half-applied, and we reload that
 * device's arrangement instead of scrambling the two together.
 */
export function useReorderNotes() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({ orderedIds, expectedRev }: { orderedIds: string[]; expectedRev: number }) => {
      const { error } = await supabase.rpc('reorder_user_notes', {
        _ordered_ids: orderedIds,
        _expected_rev: expectedRev,
      });
      if (error) {
        // 40001 is the revision guard: someone else got there first.
        if (error.code === '40001' || /changed elsewhere/i.test(error.message)) {
          throw Object.assign(new Error('stale-order'), { stale: true });
        }
        throw error;
      }
    },
    onMutate: async ({ orderedIds, expectedRev }) => {
      const key = [...KEY, user?.id];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<UserNote[]>(key);
      if (previous) {
        const byId = new Map(previous.map(n => [n.id, n]));
        const moved = orderedIds
          .map((id, index) => {
            const note = byId.get(id);
            return note ? { ...note, sort_order: index, order_rev: expectedRev + 1 } : null;
          })
          .filter((n): n is UserNote => n !== null);
        // Anything created elsewhere mid-drag stays visible, at the end.
        const rest = previous.filter(n => !orderedIds.includes(n.id));
        qc.setQueryData<UserNote[]>(key, [...moved, ...rest]);
      }
      return { previous, key };
    },
    onError: (err: Error & { stale?: boolean }, _vars, context) => {
      if (context?.previous) qc.setQueryData(context.key, context.previous);
      if (err?.stale) {
        toast.info('These notes were rearranged on another device — showing that order.');
      } else {
        toast.error("Couldn't save the new order. Try again.");
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
