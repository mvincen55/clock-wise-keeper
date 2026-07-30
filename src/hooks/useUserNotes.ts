import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

// Private sticky notes. Owner-only by RLS — nobody else ever reads these.

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

export const NOTE_COLORS = ['amber', 'purple', 'green', 'blue', 'pink'] as const;

export function useUserNotes() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['user-notes', user?.id],
    enabled: !!user && !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_notes')
        .select('*')
        .eq('user_id', user!.id)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as UserNote[];
    },
  });
}

export function useCreateNote() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, color, sortOrder }: { content: string; color: string; sortOrder: number }) => {
      const { data, error } = await supabase
        .from('user_notes')
        .insert({ user_id: user!.id, org_id: ctx!.org_id, content, color, sort_order: sortOrder })
        .select()
        .single();
      if (error) throw error;
      return data as UserNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-notes', user?.id] }),
  });
}

export function useUpdateNote() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; content?: string; color?: string }) => {
      const { error } = await supabase.from('user_notes').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-notes', user?.id] }),
  });
}

export function useDeleteNote() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-notes', user?.id] }),
  });
}

/**
 * Persist a whole new order after a drag. The list is small, so rewriting every
 * sort_order keeps the ordering dense and predictable.
 */
export function useReorderNotes() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (orderedIds: string[]) => {
      await Promise.all(
        orderedIds.map((id, index) =>
          supabase.from('user_notes').update({ sort_order: index }).eq('id', id)
        )
      );
    },
    onMutate: async (orderedIds: string[]) => {
      const key = ['user-notes', user?.id];
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<UserNote[]>(key);
      if (previous) {
        const byId = new Map(previous.map(n => [n.id, n]));
        qc.setQueryData<UserNote[]>(
          key,
          orderedIds.map((id, index) => ({ ...(byId.get(id) as UserNote), sort_order: index }))
        );
      }
      return { previous };
    },
    onError: (_e, _v, context) => {
      if (context?.previous) qc.setQueryData(['user-notes', user?.id], context.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['user-notes', user?.id] }),
  });
}
