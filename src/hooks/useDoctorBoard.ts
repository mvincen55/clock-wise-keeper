import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { useOwnerBoardPrefs } from '@/hooks/useMessagingSettings';

export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly';

export interface BoardItem {
  id: string;
  org_id: string;
  owner_user_id: string;
  title: string;
  note: string | null;
  due_at: string | null;
  repeat_rule: RepeatRule;
  source_request_id: string | null;
  visible_to_manager: boolean;
  completed_at: string | null;
  created_at: string;
}

function nextOccurrence(due: string | null, rule: RepeatRule): string | null {
  if (rule === 'none') return null;
  const base = due ? new Date(due) : new Date();
  const d = new Date(base);
  if (rule === 'daily') d.setDate(d.getDate() + 1);
  if (rule === 'weekly') d.setDate(d.getDate() + 7);
  if (rule === 'monthly') d.setMonth(d.getMonth() + 1);
  return d.toISOString();
}

/**
 * The doctor's own list.
 *
 * Nothing here is reported anywhere. Only the doctor can add to it — the
 * database refuses writes from anyone else, so this is not a UI convention.
 * A manager can read it, read-only, and only after the doctor turned that on.
 */
export function useDoctorBoard(opts?: { ownerUserId?: string }) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const isOwner = ctx?.role === 'owner';
  const targetOwner = opts?.ownerUserId ?? user?.id;
  const readOnly = !isOwner || targetOwner !== user?.id;

  const query = useQuery({
    queryKey: ['doctor-board', ctx?.org_id, targetOwner],
    enabled: !!ctx?.org_id && !!targetOwner,
    queryFn: async (): Promise<BoardItem[]> => {
      const { data, error } = await supabase
        .from('doctor_board_items')
        .select('*')
        .eq('owner_user_id', targetOwner!)
        .order('due_at', { ascending: true, nullsFirst: false })
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as BoardItem[];
    },
  });

  const { prefs } = useOwnerBoardPrefs();
  const invalidate = () => qc.invalidateQueries({ queryKey: ['doctor-board'] });

  const create = useMutation({
    mutationFn: async (input: {
      title: string;
      note?: string;
      due_at?: string | null;
      repeat_rule?: RepeatRule;
      source_request_id?: string | null;
    }) => {
      if (!user || !ctx || !isOwner) throw new Error('Only the doctor can add to this list.');
      const { error } = await supabase.from('doctor_board_items').insert({
        org_id: ctx.org_id,
        owner_user_id: user.id,
        title: input.title.trim(),
        note: input.note?.trim() || null,
        due_at: input.due_at || null,
        repeat_rule: input.repeat_rule ?? 'none',
        source_request_id: input.source_request_id ?? null,
        visible_to_manager: prefs.share_with_manager,
      });
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const update = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Partial<BoardItem> }) => {
      const { error } = await supabase.from('doctor_board_items').update(patch).eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** Check it off and it's done. Nobody is told, nothing is asked. */
  const complete = useMutation({
    mutationFn: async (item: BoardItem) => {
      const { error } = await supabase
        .from('doctor_board_items')
        .update({ completed_at: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;

      // "Call the lab every Monday" writes next Monday's copy when this one closes.
      if (item.repeat_rule !== 'none' && user && ctx) {
        await supabase.from('doctor_board_items').insert({
          org_id: item.org_id,
          owner_user_id: item.owner_user_id,
          title: item.title,
          note: item.note,
          due_at: nextOccurrence(item.due_at, item.repeat_rule),
          repeat_rule: item.repeat_rule,
          visible_to_manager: item.visible_to_manager,
        });
      }
    },
    onSuccess: invalidate,
  });

  const uncomplete = useMutation({
    mutationFn: async (item: BoardItem) => {
      const { error } = await supabase
        .from('doctor_board_items')
        .update({ completed_at: null })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  /** One tap: push it to tomorrow. */
  const snooze = useMutation({
    mutationFn: async (item: BoardItem) => {
      const base = item.due_at ? new Date(item.due_at) : new Date();
      const d = new Date(Math.max(base.getTime(), Date.now()));
      d.setDate(d.getDate() + 1);
      const { error } = await supabase
        .from('doctor_board_items')
        .update({ due_at: d.toISOString() })
        .eq('id', item.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('doctor_board_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: invalidate,
  });

  const items = query.data ?? [];
  return {
    items,
    open: items.filter(i => !i.completed_at),
    done: items.filter(i => i.completed_at),
    /** Empty means the card does not exist at all — no placeholder, no hint. */
    hasAny: items.length > 0,
    isLoading: query.isLoading,
    readOnly,
    create,
    update,
    complete,
    uncomplete,
    snooze,
    remove,
  };
}

/** The one doctor whose board a manager is allowed to look at, if any. */
export function useSharedDoctorBoard() {
  const { data: ctx } = useOrgContext();
  const isManager = ctx?.role === 'manager' || ctx?.role === 'owner';

  return useQuery({
    queryKey: ['shared-doctor-board', ctx?.org_id],
    enabled: !!ctx?.org_id && isManager,
    queryFn: async (): Promise<BoardItem[]> => {
      const { data } = await supabase
        .from('doctor_board_items')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('visible_to_manager', true)
        .is('completed_at', null)
        .order('due_at', { ascending: true, nullsFirst: false });
      return (data ?? []) as BoardItem[];
    },
  });
}
