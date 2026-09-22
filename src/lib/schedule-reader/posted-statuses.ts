import type { LayoutColumn, OcrBox, OcrWord, PhraseRule, ScheduleStatus } from './types';
import { applyCompletedEvidence } from './completed-evidence';
import { isOpenSlotCell } from './appointment-regions';

/** Read a posted grid without a user-sampled status palette. Unclear content stays unknown. */
export function postedColumnStatuses(
  image: { width: number; height: number; data: ArrayLike<number> },
  col: LayoutColumn & { pxStart: number; pxEnd: number },
  rows: Array<{ yTop: number; yBottom: number }>,
  regions: OcrBox[], words: OcrWord[], rules: PhraseRule[],
): Array<ScheduleStatus | null> {
  const evidence = applyCompletedEvidence(rows.map(() => 'completed'), rows, regions, words, col, rules);
  return evidence.map((status, i) => {
    if (status) return status;
    // An unrecognized occupied block must never become an opening.
    const row = rows[i];
    const occupied = regions.some(b => b.x0 < col.pxEnd && b.x1 > col.pxStart && b.y0 < row.yBottom && b.y1 > row.yTop);
    if (occupied) return null;
    // Blank grid, or a pale tint the practice software paints on an unbooked slot, is open time.
    return isOpenSlotCell(image, col, row.yTop / image.height, row.yBottom / image.height) ? 'open' : null;
  });
}
