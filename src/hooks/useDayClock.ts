import { useTick } from '@/hooks/useTick';
import { usePayrollSettings } from '@/hooks/usePayrollSettings';
import { easternWallMinutes, getToday } from '@/lib/time-utils';
import type { DayClock } from '@/lib/attendance-day';

/**
 * The office's clock for the day rule (src/lib/attendance-day.ts): today's
 * date, the wall-clock minute, and the missing-shift buffer. Ticks once a
 * minute so "Not in yet" turns into "Absent" without a reload.
 */
export function useDayClock(): DayClock {
  const now = useTick(60_000);
  const { data: payroll } = usePayrollSettings();
  return { today: getToday(), nowMinutes: easternWallMinutes(now), bufferMinutes: payroll?.missing_shift_buffer_minutes ?? 60 };
}
