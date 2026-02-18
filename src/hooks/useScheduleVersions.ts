import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

export type ScheduleVersionRow = {
  id: string;
  user_id: string;
  name: string | null;
  effective_start_date: string;
  effective_end_date: string | null;
  apply_to_remote: boolean;
  timezone: string;
  week_start_day: number;
  created_at: string;
  updated_at: string;
};

export type ScheduleWeekdayRow = {
  id: string;
  schedule_version_id: string;
  weekday: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  threshold_minutes: number;
};

export type ScheduleVersionWithDays = ScheduleVersionRow & {
  weekdays: ScheduleWeekdayRow[];
};

export type ScheduleForDateResult = {
  version_id: string;
  version_name: string | null;
  effective_start_date: string;
  effective_end_date: string | null;
  apply_to_remote: boolean;
  timezone: string;
  weekday: number;
  enabled: boolean;
  start_time: string;
  end_time: string;
  grace_minutes: number;
  threshold_minutes: number;
};

const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export { WEEKDAY_NAMES, WEEKDAY_SHORT };

const DEFAULT_WEEKDAYS: Omit<ScheduleWeekdayRow, 'id' | 'schedule_version_id'>[] = [
  { weekday: 0, start_time: '08:00', end_time: '17:00', enabled: false, grace_minutes: 0, threshold_minutes: 1 },
  { weekday: 1, start_time: '08:20', end_time: '17:00', enabled: true, grace_minutes: 0, threshold_minutes: 1 },
  { weekday: 2, start_time: '09:50', end_time: '16:00', enabled: true, grace_minutes: 0, threshold_minutes: 1 },
  { weekday: 3, start_time: '09:50', end_time: '19:00', enabled: true, grace_minutes: 0, threshold_minutes: 1 },
  { weekday: 4, start_time: '08:00', end_time: '17:00', enabled: false, grace_minutes: 0, threshold_minutes: 1 },
  { weekday: 5, start_time: '08:20', end_time: '17:00', enabled: true, grace_minutes: 0, threshold_minutes: 1 },
  { weekday: 6, start_time: '08:00', end_time: '17:00', enabled: false, grace_minutes: 0, threshold_minutes: 1 },
];

export { DEFAULT_WEEKDAYS };

/** Fetch all schedule versions with their weekday rules */
export function useScheduleVersions() {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['schedule-versions'],
    enabled: !!user,
    queryFn: async () => {
      const { data: versions } = await supabase
        .from('schedule_versions')
        .select('*')
        .order('effective_start_date', { ascending: false });

      if (!versions?.length) return [] as ScheduleVersionWithDays[];

      const versionIds = versions.map(v => v.id);
      const { data: weekdays } = await supabase
        .from('schedule_weekdays')
        .select('*')
        .in('schedule_version_id', versionIds)
        .order('weekday');

      return versions.map(v => ({
        ...v,
        weekdays: (weekdays || []).filter(w => w.schedule_version_id === v.id),
      })) as ScheduleVersionWithDays[];
    },
  });
}

/** Get active schedule version (the one covering today or latest without end date) */
export function useActiveScheduleVersion() {
  const { data: versions } = useScheduleVersions();

  if (!versions?.length) return null;

  const today = new Date().toISOString().split('T')[0];
  return getVersionForDate(versions, today);
}

/** Find the version covering a specific date */
export function getVersionForDate(versions: ScheduleVersionWithDays[], date: string): ScheduleVersionWithDays | null {
  if (!versions?.length) return null;

  // Sort by start date desc so most recent first
  const sorted = [...versions].sort((a, b) =>
    b.effective_start_date.localeCompare(a.effective_start_date)
  );

  for (const v of sorted) {
    if (v.effective_start_date <= date && (v.effective_end_date === null || v.effective_end_date >= date)) {
      return v;
    }
  }
  return null;
}

/** Get weekday rule for a specific date from a version */
export function getWeekdayRule(version: ScheduleVersionWithDays, date: string): ScheduleWeekdayRow | null {
  const d = new Date(date + 'T00:00:00');
  const weekday = d.getDay();
  return version.weekdays.find(w => w.weekday === weekday) || null;
}

/** Create a new schedule version with weekday rules */
export function useCreateScheduleVersion() {
  const { user } = useAuth();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      name?: string;
      effective_start_date: string;
      effective_end_date?: string | null;
      apply_to_remote?: boolean;
      timezone?: string;
      week_start_day?: number;
      weekdays: Omit<ScheduleWeekdayRow, 'id' | 'schedule_version_id'>[];
      auto_adjust_previous?: boolean;
    }) => {
      if (!user) throw new Error('Not authenticated');

      // If auto_adjust, shorten previous version
      if (input.auto_adjust_previous !== false) {
        const { data: existing } = await supabase
          .from('schedule_versions')
          .select('id, effective_start_date, effective_end_date')
          .order('effective_start_date', { ascending: false });

        if (existing?.length) {
          for (const v of existing) {
            const vStart = v.effective_start_date;
            const vEnd = v.effective_end_date;
            // If the existing version overlaps with the new one, adjust its end date
            if (vStart < input.effective_start_date && (vEnd === null || vEnd >= input.effective_start_date)) {
              const newEnd = new Date(input.effective_start_date + 'T00:00:00');
              newEnd.setDate(newEnd.getDate() - 1);
              const newEndStr = newEnd.toISOString().split('T')[0];
              await supabase.from('schedule_versions').update({ effective_end_date: newEndStr }).eq('id', v.id);
            }
          }
        }
      }

      // Validate at least one weekday is enabled
      if (!input.weekdays.some(w => w.enabled)) {
        throw new Error('At least one weekday must be enabled');
      }

      // Validate end >= start if end is set
      if (input.effective_end_date && input.effective_end_date < input.effective_start_date) {
        throw new Error('End date must be on or after start date');
      }

      const { data: version, error } = await supabase
        .from('schedule_versions')
        .insert({
          user_id: user.id,
          name: input.name || null,
          effective_start_date: input.effective_start_date,
          effective_end_date: input.effective_end_date || null,
          apply_to_remote: input.apply_to_remote ?? false,
          timezone: input.timezone || 'America/New_York',
          week_start_day: input.week_start_day ?? 1,
        })
        .select('id')
        .single();

      if (error) throw error;

      const weekdayRows = input.weekdays.map(w => ({
        schedule_version_id: version.id,
        weekday: w.weekday,
        enabled: w.enabled,
        start_time: w.start_time,
        end_time: w.end_time,
        grace_minutes: w.grace_minutes,
        threshold_minutes: w.threshold_minutes,
      }));

      const { error: wError } = await supabase.from('schedule_weekdays').insert(weekdayRows);
      if (wError) throw wError;

      return version.id;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-versions'] });
      qc.invalidateQueries({ queryKey: ['work-schedule'] });
    },
  });
}

/** Update a schedule version + weekdays */
export function useUpdateScheduleVersion() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      versionId: string;
      updates: Partial<Pick<ScheduleVersionRow, 'name' | 'effective_start_date' | 'effective_end_date' | 'apply_to_remote' | 'timezone' | 'week_start_day'>>;
      weekdays?: { id: string; updates: Partial<Omit<ScheduleWeekdayRow, 'id' | 'schedule_version_id'>> }[];
    }) => {
      if (Object.keys(input.updates).length > 0) {
        const { error } = await supabase
          .from('schedule_versions')
          .update(input.updates)
          .eq('id', input.versionId);
        if (error) throw error;
      }

      if (input.weekdays?.length) {
        for (const w of input.weekdays) {
          const { error } = await supabase
            .from('schedule_weekdays')
            .update(w.updates)
            .eq('id', w.id);
          if (error) throw error;
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-versions'] });
      qc.invalidateQueries({ queryKey: ['work-schedule'] });
    },
  });
}

/** Delete a schedule version */
export function useDeleteScheduleVersion() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (versionId: string) => {
      const { error } = await supabase.from('schedule_versions').delete().eq('id', versionId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['schedule-versions'] });
      qc.invalidateQueries({ queryKey: ['work-schedule'] });
    },
  });
}

/** Summarize weekday rules into a short string like "Mon 8:20–5, Tue 9:50–4" */
export function summarizeWeekdays(weekdays: ScheduleWeekdayRow[]): string {
  return weekdays
    .filter(w => w.enabled)
    .sort((a, b) => a.weekday - b.weekday)
    .map(w => {
      const s = w.start_time?.slice(0, 5);
      const e = w.end_time?.slice(0, 5);
      return `${WEEKDAY_SHORT[w.weekday]} ${s}–${e}`;
    })
    .join(', ');
}
