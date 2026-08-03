import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';

// Office events live alongside closures and days off on the office calendar.
// Today there is one category that matters to the rest of the app —
// "team_meeting" — because goal plans are built around the next one.

export type OfficeEventCategory = 'team_meeting' | 'other';

export type OfficeEvent = {
  id: string;
  org_id: string;
  event_date: string;
  title: string;
  category: OfficeEventCategory;
  start_time: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

export function useOfficeEvents() {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['office-events', ctx?.org_id],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('office_events')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .order('event_date');
      if (error) throw error;
      return (data ?? []) as OfficeEvent[];
    },
  });
}

/** The next team meeting on or after today, or null when none is scheduled. */
export function useNextTeamMeeting(): OfficeEvent | null {
  const { data } = useOfficeEvents();
  const today = getToday();
  return (
    (data ?? []).find(e => e.category === 'team_meeting' && e.event_date >= today) ?? null
  );
}

export function useSaveOfficeEvent() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id?: string;
      event_date: string;
      title: string;
      category: OfficeEventCategory;
      start_time?: string | null;
      notes?: string | null;
    }) => {
      if (!ctx || !user) throw new Error('Not ready');
      const row = {
        org_id: ctx.org_id,
        event_date: input.event_date,
        title: input.title,
        category: input.category,
        start_time: input.start_time || null,
        notes: input.notes || null,
        created_by: user.id,
      };
      const query = input.id
        ? supabase.from('office_events').update(row).eq('id', input.id)
        : supabase.from('office_events').insert(row);
      const { error } = await query;
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-events'] }),
  });
}

export function useDeleteOfficeEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('office_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['office-events'] }),
  });
}

/** "in 6 days" / "today" / "tomorrow" — plain, calm language. */
export function daysUntil(dateStr: string): number {
  const today = getToday();
  const a = Date.UTC(
    Number(today.slice(0, 4)),
    Number(today.slice(5, 7)) - 1,
    Number(today.slice(8, 10))
  );
  const b = Date.UTC(
    Number(dateStr.slice(0, 4)),
    Number(dateStr.slice(5, 7)) - 1,
    Number(dateStr.slice(8, 10))
  );
  return Math.round((b - a) / 86400000);
}

export function shortDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
