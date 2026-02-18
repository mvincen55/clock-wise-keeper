import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useScheduleVersions, getVersionForDate, getWeekdayRule } from '@/hooks/useScheduleVersions';
import { useWorkSchedule, getScheduleForWeekday } from '@/hooks/useWorkSchedule';
import { useTimeEntries } from '@/hooks/useTimeEntries';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { useDaysOff } from '@/hooks/useDaysOff';
import { useTardies } from '@/hooks/useTardies';
import { useCallback } from 'react';

export type AttendanceDayStatusRow = {
  id: string;
  user_id: string;
  entry_date: string;
  schedule_expected_start: string | null;
  schedule_expected_end: string | null;
  is_scheduled_day: boolean;
  office_closed: boolean;
  has_punches: boolean;
  is_remote: boolean;
  is_absent: boolean;
  is_incomplete: boolean;
  is_late: boolean;
  minutes_late: number;
  tardy_approval_status: string;
  has_edits: boolean;
  has_day_comment: boolean;
  computed_at: string;
};

export function useAttendanceDayStatus(startDate?: string, endDate?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ['attendance-day-status', startDate, endDate],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from('attendance_day_status')
        .select('*')
        .order('entry_date', { ascending: false });
      if (startDate) q = q.gte('entry_date', startDate);
      if (endDate) q = q.lte('entry_date', endDate);
      const { data } = await q;
      return (data || []) as AttendanceDayStatusRow[];
    },
  });
}

/**
 * Hook that provides a recompute function for attendance status.
 * Call recompute() after punches, schedule, closures, PTO, or wipe changes.
 */
export function useRecomputeAttendance() {
  const { user } = useAuth();
  const { data: versions } = useScheduleVersions();
  const { data: legacySchedule } = useWorkSchedule();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ startDate, endDate }: { startDate: string; endDate: string }) => {
      if (!user) throw new Error('Not authenticated');

      // Fetch all needed data for the range
      const [entriesRes, closuresRes, daysOffRes, tardiesRes] = await Promise.all([
        supabase.from('time_entries').select('*, punches(*)').gte('entry_date', startDate).lte('entry_date', endDate),
        supabase.from('office_closures').select('closure_date').gte('closure_date', startDate).lte('closure_date', endDate),
        supabase.from('days_off').select('*').lte('date_start', endDate).gte('date_end', startDate),
        supabase.from('tardies').select('*').gte('entry_date', startDate).lte('entry_date', endDate),
      ]);

      const entries = entriesRes.data || [];
      const closureDates = new Set((closuresRes.data || []).map((c: any) => c.closure_date));
      const tardyMap = new Map<string, any>();
      (tardiesRes.data || []).forEach((t: any) => tardyMap.set(t.entry_date, t));

      // Build day-off coverage set
      const dayOffDates = new Set<string>();
      (daysOffRes.data || []).forEach((d: any) => {
        const s = new Date(d.date_start + 'T00:00:00');
        const e = new Date(d.date_end + 'T00:00:00');
        for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
          dayOffDates.add(cur.toISOString().split('T')[0]);
        }
      });

      // Build entry map
      const entryMap = new Map<string, any>();
      entries.forEach((e: any) => entryMap.set(e.entry_date, e));

      const hasVersions = versions && versions.length > 0;
      const hasLegacy = legacySchedule && legacySchedule.length > 0;

      // Iterate each date in range
      const rows: any[] = [];
      const current = new Date(startDate + 'T00:00:00');
      const end = new Date(endDate + 'T00:00:00');

      while (current <= end) {
        const dateStr = current.toISOString().split('T')[0];

        // Resolve schedule
        let schedStart: string | null = null;
        let schedEnd: string | null = null;
        let isScheduled = false;
        let applyToRemote = false;

        if (hasVersions) {
          const version = getVersionForDate(versions, dateStr);
          if (version) {
            const rule = getWeekdayRule(version, dateStr);
            if (rule && rule.enabled) {
              isScheduled = true;
              schedStart = rule.start_time;
              schedEnd = rule.end_time;
              applyToRemote = version.apply_to_remote;
            }
          }
        }

        if (!isScheduled && hasLegacy) {
          const legacy = getScheduleForWeekday(legacySchedule, dateStr);
          if (legacy && legacy.enabled) {
            isScheduled = true;
            schedStart = legacy.start_time;
            schedEnd = legacy.end_time;
            applyToRemote = legacy.apply_to_remote;
          }
        }

        const isClosed = closureDates.has(dateStr);
        const entry = entryMap.get(dateStr);
        const punches: any[] = entry?.punches || [];
        const hasPunches = punches.length > 0;
        const isRemote = entry?.is_remote || false;
        const hasDayOff = dayOffDates.has(dateStr);
        const tardy = tardyMap.get(dateStr);

        // is_absent: scheduled + not closed + no punches + no PTO
        const isAbsent = isScheduled && !isClosed && !hasPunches && !hasDayOff;

        // is_incomplete: has punches but last is IN, or odd number of punches
        const isIncomplete = hasPunches && (
          punches[punches.length - 1].punch_type === 'in' ||
          punches.length % 2 !== 0
        );

        // is_late
        let isLate = false;
        let minutesLate = 0;
        if (hasPunches && isScheduled && schedStart) {
          // Skip remote check if !applyToRemote
          if (!isRemote || applyToRemote) {
            const firstIn = punches.find((p: any) => p.punch_type === 'in');
            if (firstIn) {
              const arrivalDate = new Date(firstIn.punch_time);
              const [sh, sm] = schedStart.split(':').map(Number);
              const expectedDate = new Date(dateStr + 'T00:00:00');
              expectedDate.setHours(sh, sm, 0, 0);
              const diffMin = Math.ceil((arrivalDate.getTime() - expectedDate.getTime()) / 60000);
              if (diffMin > 0) {
                isLate = true;
                minutesLate = diffMin;
              }
            }
          }
        }

        const hasEdits = punches.some((p: any) => p.is_edited);
        const hasDayComment = !!(entry?.entry_comment);

        rows.push({
          user_id: user.id,
          entry_date: dateStr,
          schedule_expected_start: schedStart,
          schedule_expected_end: schedEnd,
          is_scheduled_day: isScheduled,
          office_closed: isClosed,
          has_punches: hasPunches,
          is_remote: isRemote,
          is_absent: isAbsent,
          is_incomplete: isIncomplete,
          is_late: isLate,
          minutes_late: minutesLate,
          tardy_approval_status: tardy?.approval_status || 'unreviewed',
          has_edits: hasEdits,
          has_day_comment: hasDayComment,
          computed_at: new Date().toISOString(),
        });

        current.setDate(current.getDate() + 1);
      }

      // Upsert all rows
      if (rows.length > 0) {
        // Batch in groups of 100
        for (let i = 0; i < rows.length; i += 100) {
          const batch = rows.slice(i, i + 100);
          const { error } = await supabase
            .from('attendance_day_status')
            .upsert(batch, { onConflict: 'user_id,entry_date' });
          if (error) throw error;
        }
      }

      return rows.length;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['attendance-day-status'] });
      qc.invalidateQueries({ queryKey: ['attendance-exceptions'] });
    },
  });
}
