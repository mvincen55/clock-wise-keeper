import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

/**
 * Writes the new arrangement back. The board already shows the new order
 * optimistically, so this only has to make it stick.
 */
export function useReorderNotes() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const results = await Promise.all(
        orderedIds.map((id, index) =>
          supabase.from('user_notes').update({ sort_order: index }).eq('id', id)
        )
      );
      const failed = results.find(r => r.error);
      if (failed?.error) throw failed.error;
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
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
