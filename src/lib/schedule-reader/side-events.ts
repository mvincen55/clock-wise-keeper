/**
 * The notes columns beside the chairs are the office's event log for the
 * day. A bar reading "CX >>" or "CX -->" is a cancellation without notice
 * for the chair the arrow points at, at that time; "NS" or "no show" is a
 * no-show. What follows in the chair says what became of the slot: open
 * rows are the disruption's open time, a booked row means the slot was
 * refilled. Nothing here reads patient text — only the two event words and
 * the arrow, and only in columns already excluded as notes.
 */
import type { LayoutColumn, OcrBox, OcrWord, ScheduleStatus } from './types';
import { groupWordsIntoLines } from './privacy-detector';
import { wordsInColumn } from './layout-detector';

export type SideEventKind = 'cancelled' | 'no_show';

/**
 * An arrow hint from the frame: dark ink inside the bar's box beyond the
 * words the engine read. The bar's resize handle at its far right is left
 * out. `pixels` reads one box's RGBA data.
 */
export function inkArrowHint(
  regions: OcrBox[],
  pixels: (box: OcrBox) => { width: number; height: number; data: ArrayLike<number> } | null,
): ArrowHint {
  return line => {
    if (!line.words.length) return null;
    const midY = line.words.reduce((s, w) => s + (w.bbox.y0 + w.bbox.y1) / 2, 0) / line.words.length;
    const first = Math.min(...line.words.map(w => w.bbox.x0)), last = Math.max(...line.words.map(w => w.bbox.x1));
    const box = regions.find(b => midY >= b.y0 && midY < b.y1 && first >= b.x0 - 2 && last <= b.x1 + 2);
    if (!box) return null;
    const img = pixels(box);
    if (!img) return null;
    const dark = (x0: number, x1: number) => {
      let n = 0;
      for (let y = 1; y < img.height - 1; y++) for (let x = Math.max(0, x0); x < Math.min(img.width, x1); x++) {
        const i = (y * img.width + x) * 4;
        if (Math.max(img.data[i], img.data[i + 1], img.data[i + 2]) < 90) n++;
      }
      return n;
    };
    const leftInk = dark(3, Math.floor(first - box.x0) - 1);
    const rightInk = dark(Math.ceil(last - box.x0) + 1, img.width - 14);
    if (rightInk >= 6 && rightInk > leftInk * 2) return 'right';
    if (leftInk >= 6 && leftInk > rightInk * 2) return 'left';
    return null;
  };
}

export interface SideEvent {
  kind: SideEventKind;
  /** Grid row the bar sits on. */
  rowIndex: number;
  /** Pixel span of the chair the bar points at. */
  target: { pxStart: number; pxEnd: number };
}

const NO_SHOW = /\b(?:ns|no[- ]?show|nshow)\b/i;
// "CX" as the engine returns it from a one-line bar: the arrow glyphs after
// it often come back as "s" ("Css", "Cs"), never as letters of a word.
const CANCEL = /(?:^|[\s([])c(?:x|s{1,2}|xl|ncl|anc\w*)(?=$|[\s:)\]>»-])/i;
const POINTS_RIGHT = /-+>|>>+|→|»/;
const POINTS_LEFT = /<-+|<<+|←|«/;

type Chair = LayoutColumn & { pxStart: number; pxEnd: number };

/**
 * Which way a bar's arrow points when the engine did not return it as
 * text: the ink left of the first word or right of the last, measured by
 * the caller on the frame. Null when neither side has an arrow's worth.
 */
export type ArrowHint = (line: { words: OcrWord[]; text: string }) => 'left' | 'right' | null;

export function readSideEvents(
  words: OcrWord[],
  columns: Chair[],
  rows: Array<{ yTop: number; yBottom: number }>,
  headerBottomPx: number,
  arrowHint: ArrowHint = () => null,
  regions: OcrBox[] = [],
): SideEvent[] {
  const notes = columns.filter(c => c.kind === 'non_clinical');
  const chairs = columns.filter(c => c.kind !== 'non_clinical');
  if (!notes.length || !chairs.length) return [];
  const events: SideEvent[] = [];
  for (const col of notes) {
    for (const line of groupWordsIntoLines(wordsInColumn(words, col, headerBottomPx))) {
      const kind: SideEventKind | null = NO_SHOW.test(line.text) ? 'no_show' : CANCEL.test(line.text) ? 'cancelled' : null;
      if (!kind) continue;
      const midY = line.words.reduce((s, w) => s + (w.bbox.y0 + w.bbox.y1) / 2, 0) / line.words.length;
      const rowIndex = rows.findIndex(r => midY >= r.yTop && midY < r.yBottom);
      if (rowIndex < 0) continue;
      const right = chairs.filter(c => c.pxStart >= col.pxEnd - 4).sort((a, b) => a.pxStart - b.pxStart)[0];
      const left = chairs.filter(c => c.pxEnd <= col.pxStart + 4).sort((a, b) => b.pxEnd - a.pxEnd)[0];
      let target: Chair | undefined;
      const hinted = POINTS_RIGHT.test(line.text) ? 'right' : POINTS_LEFT.test(line.text) ? 'left' : arrowHint(line);
      if (hinted === 'right') target = right;
      else if (hinted === 'left') target = left;
      else {
        // No arrow: the chair where a slot could have been cancelled at that
        // time — nothing booked there, or a box starting right there (the
        // refill) — and the nearer one when both or neither fit.
        const row = rows[rowIndex];
        const fits = (chair: Chair) => {
          const boxes = regions.filter(b => b.x0 < chair.pxEnd && b.x1 > chair.pxStart && b.y0 < row.yBottom && b.y1 > row.yTop);
          return boxes.length === 0 || boxes.some(b => b.y0 >= row.yTop - (row.yBottom - row.yTop) / 2);
        };
        const fitting = [right, left].filter((c): c is Chair => !!c && fits(c));
        if (fitting.length === 1) target = fitting[0];
        else {
          const dr = right ? right.pxStart - col.pxEnd : Infinity, dl = left ? col.pxStart - left.pxEnd : Infinity;
          target = dr <= dl ? right : left;
        }
      }
      if (!target) continue;
      events.push({ kind, rowIndex, target: { pxStart: target.pxStart, pxEnd: target.pxEnd } });
    }
  }
  return events;
}

/** What the side column's events did to one chair's rows. */
export interface SideEventOutcome {
  statuses: Array<ScheduleStatus | null>;
  /** Events whose slot was refilled or otherwise not open: counted, no open minutes. */
  recovered: Record<SideEventKind, number>;
  /** Grid rows booked in a refilled slot, by the box that refilled it. */
  recoveredRows: number;
  /** Every event aimed at this chair, by kind. */
  counts: Record<SideEventKind, number>;
}

/**
 * Apply the events aimed at one chair. From the bar's row, unknown rows
 * (the bar's own label, a box edge) are skipped, then an open run becomes
 * the event's open time. A booked row instead means the slot was refilled:
 * the event still counts, and the box booked there is recovered time.
 */
export function applySideEvents(
  statuses: Array<ScheduleStatus | null>,
  events: SideEvent[],
  col: { pxStart: number; pxEnd: number },
  rows: Array<{ yTop: number; yBottom: number }>,
  regions: OcrBox[],
): SideEventOutcome {
  const out = [...statuses];
  const recovered: Record<SideEventKind, number> = { cancelled: 0, no_show: 0 };
  const counts: Record<SideEventKind, number> = { cancelled: 0, no_show: 0 };
  let recoveredMinutesRows = 0;
  for (const e of events) {
    if (Math.abs(e.target.pxStart - col.pxStart) > 4) continue;
    counts[e.kind] += 1;
    let i = e.rowIndex;
    while (i < out.length && i <= e.rowIndex + 2 && out[i] === null) i += 1;
    if (i < out.length && out[i] === 'open') {
      while (i < out.length && out[i] === 'open') { out[i] = e.kind; i += 1; }
      continue;
    }
    recovered[e.kind] += 1;
    if (i < out.length && (out[i] === 'completed' || out[i] === 'scheduled')) {
      const y = (rows[i].yTop + rows[i].yBottom) / 2;
      const box = regions.find(b => b.x0 < col.pxEnd && b.x1 > col.pxStart && y >= b.y0 && y < b.y1);
      if (box) recoveredMinutesRows += rows.filter(r => (Math.min(r.yBottom, box.y1) - Math.max(r.yTop, box.y0)) / (r.yBottom - r.yTop) >= 0.5).length;
    }
  }
  return { statuses: out, recovered, recoveredRows: recoveredMinutesRows, counts };
}
