import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { Tables } from '@/integrations/supabase/types';
import { DEFAULT_CHECKLISTS, type ChecklistCadence } from '@/lib/checklist-defaults';
import { getToday, mondayOf } from '@/lib/time-utils';

// Office checklists: recurring tasks with per-period completion history.
// Periods are Eastern-local, matching the rest of the app.

export type Checklist = Tables<'checklists'>;
export type ChecklistItem = Tables<'checklist_items'>;
export type ChecklistCompletion = Tables<'checklist_completions'>;

export const CADENCES: ChecklistCadence[] = ['daily', 'weekly', 'monthly', 'yearly'];

export const CADENCE_LABELS: Record<ChecklistCadence, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
  yearly: 'Yearly',
};

/** period_key for a cadence, anchored to an ET date ('YYYY-MM-DD'). */
export function periodKeyFor(cadence: ChecklistCadence, etDate: string): string {
  switch (cadence) {
    case 'daily':
      return etDate;
    case 'weekly':
      return `week-${mondayOf(etDate)}`;
    case 'monthly':
      return etDate.slice(0, 7);
    case 'yearly':
      return etDate.slice(0, 4);
  }
}

/** Shift an ET anchor date by one period of the given cadence. */
export function shiftAnchor(cadence: ChecklistCadence, etDate: string, delta: 1 | -1): string {
  const [y, m, d] = etDate.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  if (cadence === 'daily') noonUtc.setUTCDate(noonUtc.getUTCDate() + delta);
  if (cadence === 'weekly') noonUtc.setUTCDate(noonUtc.getUTCDate() + 7 * delta);
  if (cadence === 'monthly') noonUtc.setUTCMonth(noonUtc.getUTCMonth() + delta);
  if (cadence === 'yearly') noonUtc.setUTCFullYear(noonUtc.getUTCFullYear() + delta);
  return noonUtc.toISOString().slice(0, 10);
}

export function periodLabel(cadence: ChecklistCadence, etDate: string): string {
  const [y, m, d] = etDate.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  switch (cadence) {
    case 'daily':
      return etDate === getToday()
        ? 'Today'
        : noonUtc.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
    case 'weekly': {
      const monday = mondayOf(etDate);
      const [my, mm, md] = monday.split('-').map(Number);
      const label = new Date(Date.UTC(my, mm - 1, md, 12)).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        timeZone: 'UTC',
      });
      return `Week of ${label}`;
    }
    case 'monthly':
      return noonUtc.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    case 'yearly':
      return String(y);
  }
}

export function useChecklists() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const isAdmin = ctx?.role === 'owner' || ctx?.role === 'manager';

  return useQuery({
    queryKey: ['checklists', ctx?.org_id],
    enabled: !!user && !!ctx,
    queryFn: async (): Promise<{ checklists: Checklist[]; items: ChecklistItem[] }> => {
      if (!ctx) return { checklists: [], items: [] };
      const { data: lists, error } = await supabase
        .from('checklists')
        .select('*')
        .eq('org_id', ctx.org_id)
        .order('sort_order');
      if (error) throw error;

      // First use: admins seed the factory checklists from the office's
      // paper sheets; employees see the empty state until then.
      if ((!lists || lists.length === 0) && isAdmin) {
        for (const seed of DEFAULT_CHECKLISTS) {
          const { data: created, error: listError } = await supabase
            .from('checklists')
            .insert({
              org_id: ctx.org_id,
              name: seed.name,
              audience: seed.audience,
              sort_order: seed.sortOrder,
            })
            .select('*')
            .single();
          if (listError) throw listError;
          const { error: itemsError } = await supabase.from('checklist_items').insert(
            seed.items.map((item, i) => ({
              org_id: ctx.org_id,
              checklist_id: created.id,
              title: item.title,
              cadence: item.cadence,
              per_person: !!item.perPerson,
              sort_order: i,
            }))
          );
          if (itemsError) throw itemsError;
        }
        return fetchAll(ctx.org_id);
      }

      const items = lists && lists.length > 0 ? await fetchItems(ctx.org_id) : [];
      return { checklists: lists ?? [], items };
    },
  });
}

async function fetchItems(orgId: string): Promise<ChecklistItem[]> {
  const { data, error } = await supabase
    .from('checklist_items')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order');
  if (error) throw error;
  return data ?? [];
}

async function fetchAll(orgId: string) {
  const { data: lists, error } = await supabase
    .from('checklists')
    .select('*')
    .eq('org_id', orgId)
    .order('sort_order');
  if (error) throw error;
  return { checklists: lists ?? [], items: await fetchItems(orgId) };
}

/** Completions for a set of period keys (one query per page view). */
export function useChecklistCompletions(periodKeys: string[]) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['checklist-completions', ctx?.org_id, ...periodKeys],
    enabled: !!user && !!ctx && periodKeys.length > 0,
    queryFn: async (): Promise<ChecklistCompletion[]> => {
      const { data, error } = await supabase
        .from('checklist_completions')
        .select('*')
        .in('period_key', periodKeys);
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** The caller's display name, for the completion record. */
async function ownDisplayName(userId: string, fallback: string): Promise<string> {
  const { data } = await supabase
    .from('employees')
    .select('display_name')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();
  return data?.display_name || fallback;
}

export function useToggleCompletion() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      item: ChecklistItem;
      periodKey: string;
      /** Existing completion to remove (un-check); absent = check. */
      existing?: ChecklistCompletion;
    }) => {
      if (!ctx || !user) throw new Error('Not authenticated');
      if (input.existing) {
        const { error } = await supabase
          .from('checklist_completions')
          .delete()
          .eq('id', input.existing.id);
        if (error) throw error;
        return;
      }
      const name = await ownDisplayName(user.id, user.email ?? 'Team member');
      const { error } = await supabase.from('checklist_completions').insert({
        org_id: ctx.org_id,
        item_id: input.item.id,
        period_key: input.periodKey,
        completed_by: user.id,
        completed_by_name: name,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklist-completions'] }),
  });
}

export interface ChecklistItemUpsert {
  id?: string;
  checklistId: string;
  title: string;
  cadence: ChecklistCadence;
  perPerson: boolean;
}

export function useUpsertChecklistItem() {
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (item: ChecklistItemUpsert) => {
      if (!ctx) throw new Error('Not authenticated');
      const { error } = await supabase.from('checklist_items').upsert({
        ...(item.id ? { id: item.id } : {}),
        org_id: ctx.org_id,
        checklist_id: item.checklistId,
        title: item.title.trim(),
        cadence: item.cadence,
        per_person: item.perPerson,
      });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists'] }),
  });
}

export function useDeleteChecklistItem() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('checklist_items').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['checklists'] }),
  });
}
