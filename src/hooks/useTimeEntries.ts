import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday, calculatePunchMinutes } from '@/lib/time-utils';

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
  const today = getToday();

  return useQuery({
    queryKey: ['time-entry', today],
    enabled: !!user,
    queryFn: async () => {
      const { data: entry } = await supabase
        .from('time_entries')
        .select('*')
        .eq('entry_date', today)
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

export function useTimeEntries(startDate?: string, endDate?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['time-entries', startDate, endDate],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from('time_entries').select('*').order('entry_date', { ascending: false });
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
    mutationFn: async (action: 'clock_in' | 'clock_out' | 'break_start' | 'break_end') => {
      if (!user || !ctx) throw new Error('Not authenticated or no org context');

      const punchType: 'in' | 'out' = (action === 'clock_in' || action === 'break_end') ? 'in' : 'out';
      const now = (() => { const d = new Date(); d.setSeconds(0, 0); return d.toISOString(); })();

      let { data: entry } = await supabase
        .from('time_entries')
        .select('id')
        .eq('entry_date', today)
        .maybeSingle();

      if (!entry) {
        const { data: newEntry, error } = await supabase
          .from('time_entries')
          .insert({ user_id: user.id, org_id: ctx.org_id, employee_id: ctx.employee_id, entry_date: today, source: 'manual' as const })
          .select('id')
          .single();
        if (error) throw error;
        entry = newEntry;
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

      const { data: allPunches } = await supabase
        .from('punches')
        .select('punch_type, punch_time')
        .eq('time_entry_id', entry.id)
        .order('seq');

      if (allPunches) {
        const totalMin = calculatePunchMinutes(allPunches);
        await supabase.from('time_entries').update({ total_minutes: totalMin }).eq('id', entry.id);
      }

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
