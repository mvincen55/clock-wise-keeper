import type { LayoutColumn, OcrBox, OcrWord, PhraseRule, ScheduleStatus } from './types';
import { applyCompletedEvidence } from './completed-evidence';
import { openSlotKind } from './appointment-regions';

/**
 * Read a posted grid without a user-sampled status palette. Unclear content
 * stays unknown. When `blankGridIsClosed`, the grid paints unbooked slots
 * inside the provider's hours in a pale tint, so blank blue grid is the
 * provider's closed time — before the first patient, at lunch, after the
 * last — and reads as blocked, never as open.
 */
export function postedColumnStatuses(
  image: { width: number; height: number; data: ArrayLike<number> },
  col: LayoutColumn & { pxStart: number; pxEnd: number },
  rows: Array<{ yTop: number; yBottom: number }>,
  regions: OcrBox[], words: OcrWord[], rules: PhraseRule[],
  blankGridIsClosed = false,
): Array<ScheduleStatus | null> {
  const evidence = applyCompletedEvidence(rows.map(() => 'completed'), rows, regions, words, col, rules);
  return evidence.map((status, i) => {
    if (status) return status;
    // An unrecognized occupied block must never become an opening: a row a
    // box covers by half or more is that box's. A box edge grazing the row
    // is left out, and the rest of the row decides.
    const row = rows[i];
    const rowHeight = row.yBottom - row.yTop;
    const overlapping = regions.filter(b => b.x0 < col.pxEnd && b.x1 > col.pxStart && b.y0 < row.yBottom && b.y1 > row.yTop);
    if (overlapping.some(b => Math.min(b.y1, row.yBottom) - Math.max(b.y0, row.yTop) >= rowHeight * 0.5)) return null;
    let top = row.yTop, bottom = row.yBottom;
    for (const b of overlapping) { if (b.y0 <= top) top = Math.max(top, b.y1); else bottom = Math.min(bottom, b.y0); }
    if (bottom - top < rowHeight * 0.4) return null;
    const kind = openSlotKind(image, col, top / image.height, bottom / image.height);
    if (kind === 'tint') return 'open';
    if (kind === 'blue') return blankGridIsClosed ? 'blocked' : 'open';
    return null;
  });
}
