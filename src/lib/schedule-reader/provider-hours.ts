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

const BOOKABLE: ReadonlySet<ReducedRow['category']> = new Set(['scheduled', 'completed', 'open', 'cancelled', 'no_show', 'moved']);

/**
 * A note that the provider is away says more by where it sits: with nothing
 * bookable before it in the day, the provider came late; with nothing
 * bookable after it, the provider left early. In the middle of the day it
 * stays what it was. The office writes "Molly NOT here" at the end of her
 * column and "DO NOT BOOK - LUCY OUT" at the start of hers.
 */
export function refineProviderAway(placed: PlacedBlock[], rows: ReducedRow[]): void {
  for (const p of placed) {
    if (p.rowStart < 0 || (p.block.code !== 'PROVIDER_OFF' && p.block.code !== 'STAFFING_LIMITATION')) continue;
    const before = rows.slice(0, p.rowStart).some(r => BOOKABLE.has(r.category));
    const after = rows.slice(p.rowEnd + 1).some(r => BOOKABLE.has(r.category));
    if (before && !after) p.block.code = 'PROVIDER_OUT_EARLY';
    else if (!before && after) p.block.code = 'PROVIDER_STARTS_LATE';
  }
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
