import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday, nowEasternIso } from '@/lib/time-utils';

export type PunchRow = {
  id: string;
  time_entry_id: string;
  seq: number;
  punch_type: 'in' | 'out';
  punch_time: string;
  source: 'manual' | 'import' | 'auto_location' | 'system_adjustment';
  raw_text: string | null;
  created_at: string;
  low_confidence: boolean;
  location_lat: number | null;
  location_lng: number | null;
  is_edited: boolean;
  original_punch_time: string | null;
  edited_at: string | null;
  edited_by: string | null;
};

export type TimeEntryRow = {
  id: string;
  user_id: string;
  entry_date: string;
  total_minutes: number | null;
  source: 'manual' | 'import' | 'auto_location' | 'system_adjustment';
  notes: string | null;
  created_at: string;
  updated_at: string;
  is_remote: boolean;
  entry_comment: string | null;
  punches: PunchRow[];
};

export function useTodayEntry() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const today = getToday();

  return useQuery({
    queryKey: ['time-entry', today],
    enabled: !!user && !!ctx,
    queryFn: async () => {
      // Scope to own employee record: imported entries for unlinked employees
      // carry the importer's user_id, and admins can see the whole org — an
      // unscoped maybeSingle() would error once a second entry shares the date.
      const { data: entry } = await supabase
        .from('time_entries')
        .select('*')
        .eq('entry_date', today)
        .eq('employee_id', ctx!.employee_id)
        .maybeSingle();
      if (!entry) return null;
      const { data: punches } = await supabase
        .from('punches')
        .select('*')
        .eq('time_entry_id', entry.id)
        .order('seq', { ascending: true });
      return { ...entry, punches: punches || [] } as TimeEntryRow;
    },
  });
}

/**
 * @param scope 'own' (default) returns only the caller's own employee entries —
 *   the right scope for a personal timesheet. Necessary because RLS lets an admin
 *   read the whole org, and imported entries for unlinked employees carry the
 *   importer's user_id, so an unscoped query pollutes a manager's own views.
 *   'all' returns everything RLS allows (org-wide for admins) — for reporting.
 */
export function useTimeEntries(
  startDate?: string,
  endDate?: string,
  scope: 'own' | 'all' = 'own',
) {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();

  return useQuery({
    queryKey: ['time-entries', startDate, endDate, scope, ctx?.employee_id],
    enabled: !!user && (scope === 'all' || !!ctx),
    queryFn: async () => {
      let q = supabase.from('time_entries').select('*').order('entry_date', { ascending: false });
      if (scope === 'own') q = q.eq('employee_id', ctx!.employee_id);
      if (startDate) q = q.gte('entry_date', startDate);
      if (endDate) q = q.lte('entry_date', endDate);
      const { data: entries } = await q;
      if (!entries?.length) return [];
      const ids = entries.map(e => e.id);
      const { data: allPunches } = await supabase
        .from('punches')
        .select('*')
        .in('time_entry_id', ids)
        .order('seq', { ascending: true });
      return entries.map(e => ({
        ...e,
        punches: (allPunches || []).filter(p => p.time_entry_id === e.id),
      })) as TimeEntryRow[];
    },
  });
}

export function useClockAction() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  const today = getToday();

  return useMutation({
    mutationFn: async (action: 'clock_in' | 'clock_out') => {
      if (!user || !ctx) throw new Error('Not authenticated or no org context');

      const punchType: 'in' | 'out' = action === 'clock_in' ? 'in' : 'out';
      const now = nowEasternIso();

      let { data: entry } = await supabase
        .from('time_entries')
        .select('id')
        .eq('employee_id', ctx.employee_id)
        .eq('entry_date', today)
        .maybeSingle();

      if (!entry) {
        const { data: newEntry, error } = await supabase
          .from('time_entries')
          .insert({ user_id: user.id, org_id: ctx.org_id, employee_id: ctx.employee_id, entry_date: today, source: 'manual' as const })
          .select('id')
          .single();
        if (error) {
          // Concurrent insert — fetch the existing row
          if ((error as any).code === '23505') {
            const { data: existing } = await supabase
              .from('time_entries')
              .select('id')
              .eq('employee_id', ctx.employee_id)
              .eq('entry_date', today)
              .maybeSingle();
            if (!existing) throw error;
            entry = existing;
          } else {
            throw error;
          }
        } else {
          entry = newEntry;
        }
      }

      const { data: maxPunch } = await supabase
        .from('punches')
        .select('seq')
        .eq('time_entry_id', entry.id)
        .order('seq', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextSeq = (maxPunch?.seq ?? -1) + 1;

      const { error: punchError } = await supabase.from('punches').insert({
        time_entry_id: entry.id,
        org_id: ctx.org_id,
        employee_id: ctx.employee_id,
        seq: nextSeq,
        punch_type: punchType,
        punch_time: now,
        source: 'manual' as const,
      });
      if (punchError) throw punchError;

      // total_minutes is now recomputed by trg_recompute_punch trigger.

      await supabase.from('audit_events').insert({
        user_id: user.id,
        org_id: ctx.org_id,
        employee_id: ctx.employee_id,
        actor_id: user.id,
        event_type: action,
        event_details: { punch_time: now } as any,
        related_date: today,
        related_entry_id: entry.id,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entry', today] });
      qc.invalidateQueries({ queryKey: ['time-entries'] });
    },
  });
}

export function useUpdateEntry() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ entryId, updates, audit }: {
      entryId: string;
      updates: { is_remote?: boolean; entry_comment?: string };
      audit?: { field_changed: string; old_value: string; new_value: string; reason_comment: string };
    }) => {
      if (!user || !ctx) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('time_entries')
        .update(updates)
        .eq('id', entryId);
      if (error) throw error;

      if (audit) {
        await supabase.from('audit_events').insert({
          user_id: user.id,
          org_id: ctx.org_id,
          employee_id: ctx.employee_id,
          actor_id: user.id,
          event_type: 'manual_edit',
          event_details: {
            entity_type: 'time_entry',
            entity_id: entryId,
            field_changed: audit.field_changed,
            old_value: audit.old_value,
            new_value: audit.new_value,
            reason_comment: audit.reason_comment,
            edit_source: 'manual_edit',
          } as any,
          related_entry_id: entryId,
        });
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['time-entry'] });
    },
  });
}
