import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';

// Private sticky notes. Only ever visible to the person who wrote them —
// not to managers, not to owners. Enforced by row-level security.

export type UserNote = {
  id: string;
  org_id: string;
  user_id: string;
  content: string;
  color: string;
  sort_order: number;
  updated_at: string;
};

export const NOTE_COLORS = ['plum', 'amber', 'sky', 'mint'] as const;

export const NOTE_COLOR_CLASS: Record<string, string> = {
  plum: 'bg-primary/10 border-primary/25',
  amber: 'bg-warning/10 border-warning/30',
  sky: 'bg-accent/10 border-accent/30',
  mint: 'bg-success/10 border-success/30',
};

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
        .order('sort_order')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as UserNote[];
    },
  });
}

export function useAddNote() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ content = '', color = 'plum', sortOrder = 0 }: {
      content?: string;
      color?: string;
      sortOrder?: number;
    }) => {
      if (!user || !ctx) throw new Error('Still loading — try again in a second.');
      const { data, error } = await supabase
        .from('user_notes')
        .insert({
          org_id: ctx.org_id,
          user_id: user.id,
          content,
          color,
          sort_order: sortOrder,
        })
        .select()
        .single();
      if (error) throw error;
      return data as UserNote;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-notes'] }),
  });
}

export function useUpdateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: { id: string; content?: string; color?: string; sort_order?: number }) => {
      const { error } = await supabase.from('user_notes').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-notes'] }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('user_notes').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['user-notes'] }),
  });
}
