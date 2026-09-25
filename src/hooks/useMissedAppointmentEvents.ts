import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrgContext } from '@/hooks/useOrgContext';
import type { MissedAppointmentEvent, MissedAppointmentInsert } from '@/lib/missed-appointments';

const PAGE = 1000;

/**
 * Every 9100/9101 posting recorded for the office, newest day first. RLS
 * returns the office's rows to every active member; only owners and
 * managers can add or remove them. Read in pages so a long history is never
 * cut off at PostgREST's row cap.
 */
export function useMissedAppointmentEvents(enabled = true) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['missed-appointments', ctx?.org_id],
    enabled: !!ctx?.org_id && enabled,
    queryFn: async (): Promise<MissedAppointmentEvent[]> => {
      const rows: MissedAppointmentEvent[] = [];
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('missed_appointment_events')
          .select('*')
          .eq('org_id', ctx!.org_id)
          .order('business_date', { ascending: false })
          .order('provider_name', { ascending: true })
          .order('ordinal', { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as MissedAppointmentEvent[]));
        if (!data || data.length < PAGE) break;
      }
      return rows;
    },
  });
}

/**
 * Record the postings of an import. Duplicates of rows already recorded
 * (same office, day, code, provider, ordinal) are ignored rather than
 * rewritten, so an earlier import's details survive a re-paste. Resolves to
 * the number of rows actually added.
 */
export function useImportMissedAppointmentEvents() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (rows: MissedAppointmentInsert[]): Promise<number> => {
      if (!rows.length) return 0;
      const { data, error } = await supabase
        .from('missed_appointment_events')
        .upsert(rows, { onConflict: 'org_id,business_date,code,provider_name,ordinal', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      return data?.length ?? 0;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['missed-appointments'] }); },
  });
}

export function useDeleteMissedAppointmentEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('missed_appointment_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['missed-appointments'] }); },
  });
}
