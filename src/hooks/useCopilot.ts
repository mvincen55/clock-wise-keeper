import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';
import { captureFingerprint, shiftDay, tinyFirstStep } from '@/lib/copilot';
import { toast } from 'sonner';

/**
 * Executive Co-Pilot data layer.
 *
 * Captured items are ordinary checklist items on the member's own personal
 * list — same table, same completion records, same clock-out gate. Nothing is
 * ever created without the member tapping "yes".
 */

export const PERSONAL_LIST_NAME = 'My List';

export interface CaptureProposal {
  id: string;
  surface: string;
  title: string;
  first_step: string | null;
  due_date: string | null;
  status: 'proposed' | 'confirmed' | 'declined';
  created_at: string;
}

export interface MyItem {
  id: string;
  title: string;
  first_step: string | null;
  due_date: string | null;
  deferral_count: number;
  source: string;
  done: boolean;
}

/** The item's completion period: dated items complete for their own day. */
export function itemPeriodKey(dueDate: string | null, today: string): string {
  return dueDate ?? today;
}

/** Find (or lazily create) the member's own personal list. */
async function ensurePersonalList(orgId: string, userId: string): Promise<string> {
  const { data: existing } = await supabase
    .from('checklists')
    .select('id')
    .eq('org_id', orgId)
    .eq('owner_user_id', userId)
    .limit(1)
    .maybeSingle();
  if (existing?.id) return existing.id;

  const { data: created, error } = await supabase
    .from('checklists')
    .insert({ org_id: orgId, name: PERSONAL_LIST_NAME, audience: 'all', owner_user_id: userId, sort_order: 999 })
    .select('id')
    .single();
  if (error) throw error;
  return created.id;
}

/** Open proposals for a surface (or all surfaces). */
export function useCaptureProposals(surface?: string) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['capture-proposals', ctx?.org_id, user?.id, surface ?? 'all'],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<CaptureProposal[]> => {
      let q = supabase
        .from('capture_proposals')
        .select('id, surface, title, first_step, due_date, status, created_at')
        .eq('user_id', user!.id)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(20);
      if (surface) q = q.eq('surface', surface);
      const { data, error } = await q;
      // Fails open — a missing suggestion is never an error for the member.
      if (error) return [];
      return (data ?? []) as CaptureProposal[];
    },
  });
}

export interface ProposeInput {
  surface: string;
  title: string;
  firstStep?: string | null;
  dueDate?: string | null;
}

/**
 * Any AI surface can offer an item. Re-proposing something the member already
 * saw (or declined) is a no-op — the fingerprint makes it silent.
 */
export function useProposeCapture() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: ProposeInput): Promise<CaptureProposal | null> => {
      if (!ctx || !user) return null;
      const dueDate = input.dueDate ?? getToday();
      const fingerprint = captureFingerprint(input.surface, input.title, dueDate);
      const { data, error } = await supabase
        .from('capture_proposals')
        .insert({
          org_id: ctx.org_id,
          user_id: user.id,
          surface: input.surface,
          title: input.title.trim(),
          first_step: tinyFirstStep(input.title, input.firstStep),
          due_date: dueDate,
          fingerprint,
        })
        .select('id, surface, title, first_step, due_date, status, created_at')
        .maybeSingle();
      if (error) return null; // duplicate fingerprint: already asked once, stay quiet
      return data as CaptureProposal | null;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capture-proposals'] }),
  });
}

/** One tap: the proposal becomes a real, gating checklist item. */
export function useConfirmCapture() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (proposal: CaptureProposal) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const listId = await ensurePersonalList(ctx.org_id, user.id);
      const { data: item, error } = await supabase
        .from('checklist_items')
        .insert({
          org_id: ctx.org_id,
          checklist_id: listId,
          title: proposal.title,
          cadence: 'daily',
          per_person: true,
          owner_user_id: user.id,
          created_by: user.id,
          due_date: proposal.due_date ?? getToday(),
          first_step: proposal.first_step,
          source: `ai:${proposal.surface}`,
          source_ref: { proposal_id: proposal.id },
        })
        .select('id')
        .single();
      if (error) throw error;

      const { error: updateError } = await supabase
        .from('capture_proposals')
        .update({ status: 'confirmed', item_id: item.id, resolved_at: new Date().toISOString() })
        .eq('id', proposal.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['capture-proposals'] });
      qc.invalidateQueries({ queryKey: ['my-items'] });
      qc.invalidateQueries({ queryKey: ['checklists'] });
      qc.invalidateQueries({ queryKey: ['checklist-gating'] });
      toast("Added to your list — I'll keep track of it.");
    },
  });
}

/** Declined once, dropped for good. */
export function useDeclineCapture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('capture_proposals')
        .update({ status: 'declined', resolved_at: new Date().toISOString() })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['capture-proposals'] });
      toast("Got it — I won't bring that one up again.");
    },
  });
}

/** The member's own captured/personal items due today or earlier. */
export function useMyItems() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const today = getToday();

  return useQuery({
    queryKey: ['my-items', ctx?.org_id, user?.id, today],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<MyItem[]> => {
      const { data: items, error } = await supabase
        .from('checklist_items')
        .select('id, title, first_step, due_date, deferral_count, source, is_active')
        .eq('owner_user_id', user!.id)
        .order('due_date', { ascending: true });
      if (error) return [];

      const live = (items ?? []).filter(i => i.is_active !== false);
      if (!live.length) return [];

      const { data: completions } = await supabase
        .from('checklist_completions')
        .select('item_id, period_key')
        .in('item_id', live.map(i => i.id))
        .eq('completed_by', user!.id);

      const doneKeys = new Set((completions ?? []).map(c => `${c.item_id}|${c.period_key}`));
      return live.map(i => ({
        id: i.id,
        title: i.title,
        first_step: i.first_step,
        due_date: i.due_date,
        deferral_count: i.deferral_count ?? 0,
        source: i.source ?? 'manual',
        done: doneKeys.has(`${i.id}|${itemPeriodKey(i.due_date, today)}`),
      }));
    },
  });
}

/** "Hold this for tomorrow?" — one tap, no commentary, no shame. */
export function useDeferItem() {
  const qc = useQueryClient();
  const today = getToday();

  return useMutation({
    mutationFn: async ({ id, toDate, currentCount }: { id: string; toDate?: string; currentCount: number }) => {
      const { error } = await supabase
        .from('checklist_items')
        .update({ due_date: toDate ?? shiftDay(today, 1), deferral_count: currentCount + 1 })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-items'] });
      qc.invalidateQueries({ queryKey: ['checklist-gating'] });
      toast('Moved. Nothing lost.');
    },
  });
}

/** Rescope: move a set of slipping items to one day, together. */
export function useRescopeItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ids, toDate }: { ids: string[]; toDate: string }) => {
      for (const id of ids) {
        const { error } = await supabase
          .from('checklist_items')
          .update({ due_date: toDate })
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-items'] });
      qc.invalidateQueries({ queryKey: ['checklist-gating'] });
      toast('Plan reshaped — same work, saner week.');
    },
  });
}

/** Complete one of my items (same completion record as a manual tick). */
export function useCompleteMyItem() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const today = getToday();

  return useMutation({
    mutationFn: async (item: MyItem) => {
      if (!ctx || !user) throw new Error('Not signed in');
      const { data: employee } = await supabase
        .from('employees')
        .select('display_name')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      const { error } = await supabase.from('checklist_completions').insert({
        org_id: ctx.org_id,
        item_id: item.id,
        period_key: itemPeriodKey(item.due_date, today),
        completed_by: user.id,
        completed_by_name: employee?.display_name || user.email || 'Team member',
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-items'] });
      qc.invalidateQueries({ queryKey: ['checklist-gating'] });
      qc.invalidateQueries({ queryKey: ['checklist-completions'] });
      toast('Done. Nice.');
    },
  });
}

/**
 * COMMITMENT LISTENING — when someone says they'll do something in the AI
 * channel, the AI drafts it and offers it. Silent when there's no commitment,
 * silent when the same thing was already offered once.
 */
export function useCommitmentListen() {
  const propose = useProposeCapture();

  return useMutation({
    mutationFn: async (message: string) => {
      const { data, error } = await supabase.functions.invoke('commitment-listen', {
        body: { message, today: getToday() },
      });
      if (error || !data?.capture) return null; // fails open: never blocks the chat
      const capture = data.capture as { title: string; first_step?: string; due_date?: string };
      return propose.mutateAsync({
        surface: 'ai_channel',
        title: capture.title,
        firstStep: capture.first_step ?? null,
        dueDate: capture.due_date ?? null,
      });
    },
  });
}
