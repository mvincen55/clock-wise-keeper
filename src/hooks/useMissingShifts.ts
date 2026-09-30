import { useMemo } from 'react';
import { useScheduleVersions, getVersionForDate, getWeekdayRule } from '@/hooks/useScheduleVersions';
import { useWorkSchedule, getScheduleForWeekday } from '@/hooks/useWorkSchedule';
import { useTimeEntries } from '@/hooks/useTimeEntries';
import { useDaysOff } from '@/hooks/useDaysOff';
import { useOfficeClosures } from '@/hooks/useOfficeClosures';
import { useAttendanceExceptions, AttendanceExceptionRow } from '@/hooks/useAttendanceExceptions';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { useClocksIn } from '@/hooks/usePracticeSettings';
import { useTick } from '@/hooks/useTick';
import { easternDateKey, easternWallToUtcIso, getAppTimezone, shiftDate } from '@/lib/time-utils';

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
  const now = useTick(60_000);
  const timezone = getAppTimezone();
  const today = easternDateKey(now);
  const start = startDate || shiftDate(today, -30);
  const end = endDate || today;
  const clocksIn = useClocksIn();
  const { data: versions } = useScheduleVersions();
  const { data: legacySchedule } = useWorkSchedule();
  const { data: entries } = useTimeEntries(startDate, endDate);
  const { data: daysOff } = useDaysOff();
  // A selected range may be historical or cross New Year's Day.
  const closureYear = start.slice(0, 4) === end.slice(0, 4) ? Number(start.slice(0, 4)) : undefined;
  const { data: closures } = useOfficeClosures(closureYear);
  const { data: exceptions } = useAttendanceExceptions(startDate, endDate);
  const { data: payrollSettings } = usePayrollSettings();

  const bufferMinutes = payrollSettings?.missing_shift_buffer_minutes ?? 60;

  return useMemo(() => {
    // Members outside the clock flow (owners) can't punch, so no day of
    // theirs is ever "missing".
    if (!clocksIn) return [];
    // Never warn while any part of the attendance picture is still loading.
    if (!versions || !legacySchedule || !entries || !daysOff || !closures || !exceptions) return [];
    const hasVersions = versions && versions.length > 0;
    const hasLegacy = legacySchedule && legacySchedule.length > 0;
    if (!hasVersions && !hasLegacy) return [];

    const entryDates = new Set((entries || []).map(e => e.entry_date));
    const closureDates = new Set((closures || []).map(c => c.closure_date));
    const exceptionMap = new Map<string, AttendanceExceptionRow>();
    (exceptions || []).forEach(e => exceptionMap.set(e.exception_date, e));

    const dayOffDates = new Set<string>();
    (daysOff || []).forEach(d => {
      // A recorded absence already explains the missing work. Its attendance
      // status stays absent, but it does not also need a missing-punch response.
      // These are calendar dates, not instants in the device's timezone.
      for (let date = d.date_start; date <= d.date_end; date = shiftDate(date, 1)) {
        dayOffDates.add(date);
      }
    });

    const missing: MissingShiftDay[] = [];
    for (let dateStr = start; dateStr <= end; dateStr = shiftDate(dateStr, 1)) {

      // Try versioned schedule first, then fallback to legacy
      let sched: { weekday: number; enabled: boolean; start_time: string; end_time: string; grace_minutes: number; threshold_minutes: number } | null = null;

      if (hasVersions) {
        const version = getVersionForDate(versions, dateStr);
        if (version) {
          const rule = getWeekdayRule(version, dateStr);
          if (rule) sched = rule;
        }
      }

      if (!hasVersions && hasLegacy) {
        const legacy = getScheduleForWeekday(legacySchedule, dateStr);
        if (legacy) sched = legacy;
      }

      if (sched && sched.enabled) {
        const [eh, em] = sched.end_time.split(':').map(Number);
        const endTime = Date.parse(easternWallToUtcIso(dateStr, eh, em)) + bufferMinutes * 60_000;

        if (now.getTime() > endTime) {
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
    }

    return missing;
    // Wall-clock conversion reads module state; a timezone change must invalidate this memo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clocksIn, versions, legacySchedule, entries, daysOff, closures, exceptions, start, end, bufferMinutes, now, timezone]);
}
