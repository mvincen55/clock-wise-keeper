import { useMemo } from 'react';
import { useScheduleVersions, getVersionForDate, getWeekdayRule, ScheduleWeekdayRow, ScheduleVersionWithDays } from '@/hooks/useScheduleVersions';
import { useWorkSchedule, getScheduleForWeekday, WorkScheduleRow } from '@/hooks/useWorkSchedule';
import { useTimeEntries, TimeEntryRow } from '@/hooks/useTimeEntries';
import { useDaysOff, DayOffRow } from '@/hooks/useDaysOff';
import { useOfficeClosures, OfficeClosureRow } from '@/hooks/useOfficeClosures';
import { useAttendanceExceptions, AttendanceExceptionRow } from '@/hooks/useAttendanceExceptions';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';

export type MissingShiftDay = {
  date: string;
  schedule: { weekday: number; enabled: boolean; start_time: string; end_time: string; grace_minutes: number; threshold_minutes: number };
  exception?: AttendanceExceptionRow;
};

/**
 * Detects missing shifts using versioned schedules.
 * Falls back to legacy work_schedule if no versions exist.
 */
export function useMissingShifts(startDate?: string, endDate?: string) {
  const { data: versions } = useScheduleVersions();
  const { data: legacySchedule } = useWorkSchedule();
  const { data: entries } = useTimeEntries(startDate, endDate);
  const { data: daysOff } = useDaysOff();
  const currentYear = new Date().getFullYear();
  const { data: closures } = useOfficeClosures(currentYear);
  const { data: exceptions } = useAttendanceExceptions(startDate, endDate);
  const { data: payrollSettings } = usePayrollSettings();

  const bufferMinutes = payrollSettings?.missing_shift_buffer_minutes ?? 60;

  return useMemo(() => {
    const hasVersions = versions && versions.length > 0;
    const hasLegacy = legacySchedule && legacySchedule.length > 0;
    if (!hasVersions && !hasLegacy) return [];

    const now = new Date();
    const start = startDate ? new Date(startDate + 'T00:00:00') : (() => {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      return d;
    })();
    const end = endDate ? new Date(endDate + 'T00:00:00') : now;

    const entryDates = new Set((entries || []).map(e => e.entry_date));
    const closureDates = new Set((closures || []).map(c => c.closure_date));
    const exceptionMap = new Map<string, AttendanceExceptionRow>();
    (exceptions || []).forEach(e => exceptionMap.set(e.exception_date, e));

    const dayOffDates = new Set<string>();
    (daysOff || []).forEach(d => {
      const s = new Date(d.date_start + 'T00:00:00');
      const e = new Date(d.date_end + 'T00:00:00');
      for (let cur = new Date(s); cur <= e; cur.setDate(cur.getDate() + 1)) {
        dayOffDates.add(cur.toISOString().split('T')[0]);
      }
    });

    const missing: MissingShiftDay[] = [];
    const current = new Date(start);

    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];

      // Try versioned schedule first, then fallback to legacy
      let sched: { weekday: number; enabled: boolean; start_time: string; end_time: string; grace_minutes: number; threshold_minutes: number } | null = null;

      if (hasVersions) {
        const version = getVersionForDate(versions, dateStr);
        if (version) {
          const rule = getWeekdayRule(version, dateStr);
          if (rule) sched = rule;
        }
      }

      if (!sched && hasLegacy) {
        const legacy = getScheduleForWeekday(legacySchedule, dateStr);
        if (legacy) sched = legacy;
      }

      if (sched && sched.enabled) {
        const [eh, em] = sched.end_time.split(':').map(Number);
        const endTime = new Date(dateStr + 'T00:00:00');
        endTime.setHours(eh, em + bufferMinutes, 0, 0);

        if (now > endTime) {
          const isOfficeClosed = closureDates.has(dateStr);
          const hasEntry = entryDates.has(dateStr);
          const hasDayOff = dayOffDates.has(dateStr);
          const existingException = exceptionMap.get(dateStr);

          if (!isOfficeClosed && !hasEntry && !hasDayOff) {
            missing.push({
              date: dateStr,
              schedule: sched,
              exception: existingException,
            });
          }
        }
      }

      current.setDate(current.getDate() + 1);
    }

    return missing;
  }, [versions, legacySchedule, entries, daysOff, closures, exceptions, startDate, endDate, bufferMinutes]);
}
