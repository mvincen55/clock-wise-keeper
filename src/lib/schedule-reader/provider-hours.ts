import { CONFIDENCE_THRESHOLD, type BlockCode, type ClassifiedBlock, type LayoutColumn, type ReducedRow } from './types';

/**
 * Codes that take the provider away, not just one chair: while the doctor is
 * off, at lunch, or in a meeting, every column they run is unavailable.
 * Chair-level codes (equipment down, a hold, an emergency reserve, a staffing
 * limit) are not here — the provider can still work another chair.
 */
export const PROVIDER_WIDE_CODES: readonly BlockCode[] = [
  'PROVIDER_OFF',
  'PROVIDER_OUT_EARLY',
  'PROVIDER_STARTS_LATE',
  'LUNCH_BLOCK',
  'MEETING_BLOCK',
  'TRAINING_BLOCK',
  'ADMIN_BLOCK',
  'OFFICE_CLOSED',
];

/** A classified note and the grid rows (inclusive) it was attributed to; -1 when it sat outside the grid. */
export interface PlacedBlock {
  block: ClassifiedBlock;
  rowStart: number;
  rowEnd: number;
}

/**
 * Apply a provider-wide block read in one column to the provider's reduced
 * rows: an empty second chair during the doctor's day off or lunch is not
 * open time. Only rows that read as open or unknown change; a visible
 * appointment in another chair is evidence and stays. The block itself is
 * unchanged — its minutes already explain the rows it covers.
 */
export function applyProviderWideBlocks(rows: ReducedRow[], placed: PlacedBlock[]): ReducedRow[] {
  let changed = false;
  const result = rows.map(r => r);
  for (const { block, rowStart, rowEnd } of placed) {
    if (rowStart < 0 || !PROVIDER_WIDE_CODES.includes(block.code)) continue;
    if (!block.userConfirmed && block.confidence < CONFIDENCE_THRESHOLD) continue;
    for (let i = Math.max(0, rowStart); i <= Math.min(rows.length - 1, rowEnd); i++) {
      if (result[i].category === 'open' || result[i].category === null) {
        result[i] = { ...result[i], category: 'blocked' };
        changed = true;
      }
    }
  }
  return changed ? result : rows;
}

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
