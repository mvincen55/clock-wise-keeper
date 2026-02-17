import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { getToday, calculatePunchMinutes } from '@/lib/time-utils';

export type PunchRow = {
  id: string;
  time_entry_id: string;
  seq: number;
  punch_type: 'in' | 'out';
  punch_time: string;
  source: 'manual' | 'import';
  raw_text: string | null;
  created_at: string;
};

export type TimeEntryRow = {
  id: string;
  user_id: string;
  entry_date: string;
  total_minutes: number | null;
  source: 'manual' | 'import';
  notes: string | null;
  created_at: string;
  updated_at: string;
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
  const qc = useQueryClient();
  const today = getToday();

  return useMutation({
    mutationFn: async (action: 'clock_in' | 'clock_out' | 'break_start' | 'break_end') => {
      if (!user) throw new Error('Not authenticated');

      const punchType: 'in' | 'out' = (action === 'clock_in' || action === 'break_end') ? 'in' : 'out';
      const now = new Date().toISOString();

      // Get or create today's entry
      let { data: entry } = await supabase
        .from('time_entries')
        .select('id')
        .eq('entry_date', today)
        .maybeSingle();

      if (!entry) {
        const { data: newEntry, error } = await supabase
          .from('time_entries')
          .insert({ user_id: user.id, entry_date: today, source: 'manual' as const })
          .select('id')
          .single();
        if (error) throw error;
        entry = newEntry;
      }

      // Get current max seq
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
        seq: nextSeq,
        punch_type: punchType,
        punch_time: now,
        source: 'manual' as const,
      });
      if (punchError) throw punchError;

      // Update total_minutes
      const { data: allPunches } = await supabase
        .from('punches')
        .select('punch_type, punch_time')
        .eq('time_entry_id', entry.id)
        .order('seq');

      if (allPunches) {
        const totalMin = calculatePunchMinutes(allPunches);
        await supabase.from('time_entries').update({ total_minutes: totalMin }).eq('id', entry.id);
      }

      // Audit
      await supabase.from('audit_events').insert({
        user_id: user.id,
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
