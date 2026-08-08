import { useMemo } from 'react';
import { useAttendanceDayStatus } from '@/hooks/useAttendanceDayStatus';
import { useOwnerUserIds } from '@/hooks/useOrgAttendanceSnapshot';
import { TrendChart } from '@/components/dashboard/charts';
import type { Series } from '@/components/dashboard/types';
import { getToday, shiftDate } from '@/lib/time-utils';

/** Short weekday label for chart columns. */
function dayTick(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { weekday: 'narrow', timeZone: 'UTC' });
}

/**
 * The 14-day arrivals trend — an attendance surface an admin opens on
 * purpose, here on Team. It deliberately does NOT live on Home: attendance is
 * one signal among many, not the product's headline.
 *
 * Owners never clock, so their rows are excluded from every denominator.
 * Days with no scheduled people render as no-data, never as 0%.
 */
export default function AttendanceTrendCard() {
  const today = getToday();
  const chartStart = shiftDate(today, -13);
  const { data: rows = [] } = useAttendanceDayStatus(chartStart, today);
  const { data: ownerIds } = useOwnerUserIds();

  const series: Series = useMemo(() => {
    const clockingRows = rows.filter(r => !ownerIds?.has(r.user_id));
    const dayKeys = Array.from({ length: 14 }, (_, i) => shiftDate(chartStart, i));
    return {
      id: 'arrivals',
      title: 'Arrivals, last 14 days',
      question: 'On-time share of scheduled days',
      caption: 'Solid bar: on-time arrivals. Pale bar: people scheduled that day.',
      format: 'percent',
      points: dayKeys.map(d => {
        const day = clockingRows.filter(r => r.entry_date === d && r.is_scheduled_day && !r.office_closed);
        return {
          x: dayTick(d),
          value: day.filter(r => r.has_punches && !r.is_late).length,
          of: day.length,
          muted: day.length === 0,
        };
      }),
    };
  }, [rows, ownerIds, chartStart]);

  const hasAnySchedule = series.points.some(p => (p.of ?? 0) > 0);
  if (!hasAnySchedule) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-4">
        <p className="text-sm font-medium">Arrivals trend</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Not enough history yet. This trend will appear after scheduled workdays are recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card px-4 py-4">
      <TrendChart series={series} />
    </div>
  );
}
