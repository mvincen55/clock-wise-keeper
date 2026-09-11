import type { LayoutColumn, ReducedRow } from './types';

/** Confirmed working hours explain empty off-duty rows, never hide appointments. */
export function applyProviderHours(rows: ReducedRow[], hours: LayoutColumn['workingHours'], date: string, startMinutes: number, minutesPerRow: number) {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  const periods = hours?.filter(p => p.weekday === weekday) ?? [];
  if (!periods.length) return { rows, offDutyMinutes: 0, conflict: false };
  let offDutyMinutes = 0;
  let conflict = false;
  const adjusted = rows.map((row, i) => {
    const start = startMinutes + i * minutesPerRow;
    const end = start + minutesPerRow;
    // Boundary rows overlapping work are retained; do not round away working time.
    if (periods.some(p => p.startMinutes < end && p.endMinutes > start)) return row;
    if (row.category === 'open') {
      offDutyMinutes += minutesPerRow;
      return { ...row, category: 'blocked' as const };
    }
    if (row.category && ['scheduled', 'completed', 'cancelled', 'no_show', 'moved'].includes(row.category)) conflict = true;
    return row;
  });
  return { rows: adjusted, offDutyMinutes, conflict };
}
