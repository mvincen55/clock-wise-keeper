import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useOrgContext } from '@/hooks/useOrgContext';
import { getToday } from '@/lib/time-utils';

// Office events — reuses the existing office calendar. The category we care
// about here is "team_meeting": the date the team gathers and shares goal
// updates. Pathfinder paces plans toward it.

export type OfficeEventCategory = 'team_meeting' | 'other';

export type OfficeEvent = {
  id: string;
  org_id: string;
  title: string;
  category: string;
  event_date: string;
  start_time: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
};

/** Office events in a date window (inclusive), oldest first. */
export function useOfficeEvents(start: string, end: string, category?: OfficeEventCategory) {
  const { data: ctx } = useOrgContext();
  return useQuery({
    queryKey: ['office-events', ctx?.org_id, start, end, category ?? 'all'],
    enabled: !!ctx,
    queryFn: async () => {
      let query = supabase
        .from('office_events')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .gte('event_date', start)
        .lte('event_date', end)
        .order('event_date');
      if (category) query = query.eq('category', category);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as OfficeEvent[];
    },
  });
}

/** The next team meeting on or after today — or null when none is scheduled. */
export function useNextTeamMeeting() {
  const { data: ctx } = useOrgContext();
  const today = getToday();
  return useQuery({
    queryKey: ['next-team-meeting', ctx?.org_id, today],
    enabled: !!ctx,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('office_events')
        .select('*')
        .eq('org_id', ctx!.org_id)
        .eq('category', 'team_meeting')
        .gte('event_date', today)
        .order('event_date')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as OfficeEvent | null;
    },
  });
}

export function useCreateOfficeEvent() {
  const { user } = useAuth();
  const { data: ctx } = useOrgContext();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      title: string;
      event_date: string;
      start_time?: string | null;
      notes?: string | null;
      category?: OfficeEventCategory;
    }) => {
      if (!ctx || !user) throw new Error('Not ready');
      const { error } = await supabase.from('office_events').insert({
        org_id: ctx.org_id,
        title: input.title,
        event_date: input.event_date,
        start_time: input.start_time || null,
        notes: input.notes || null,
        category: input.category ?? 'team_meeting',
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office-events'] });
      qc.invalidateQueries({ queryKey: ['next-team-meeting'] });
    },
  });
}

export function useDeleteOfficeEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('office_events').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['office-events'] });
      qc.invalidateQueries({ queryKey: ['next-team-meeting'] });
    },
  });
}

/** Whole days from today to a date, Eastern. Negative when in the past. */
export function daysUntil(date: string): number {
  const a = new Date(`${getToday()}T12:00:00Z`).getTime();
  const b = new Date(`${date}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86400000);
}

export function shortDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Team meeting in 6 days" / "Team meeting today" / no meeting scheduled. */
export function meetingCountdownLabel(date: string | null | undefined): string {
  if (!date) return 'No team meeting on the calendar yet';
  const d = daysUntil(date);
  if (d === 0) return `Team meeting today (${shortDate(date)})`;
  if (d === 1) return `Team meeting tomorrow (${shortDate(date)})`;
  if (d < 0) return `Last team meeting was ${shortDate(date)}`;
  return `Team meeting in ${d} days (${shortDate(date)})`;
}
