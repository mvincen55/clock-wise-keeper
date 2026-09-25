import type { OcrBox, OcrWord, LayoutColumn } from './types';
import { looksLikeAppointment, providerCodeCandidate, readProviderCodes } from './provider-codes';

type Pixels = { width: number; height: number; data: ArrayLike<number> };

/** What an empty cell is painted with: blank blue grid, or the pale tint of an unbooked slot inside the provider's hours. */
export type OpenSlotKind = 'blue' | 'tint';

/**
 * What one cell is made of: the share that is blank blue grid and the share
 * that is pale tint, or null when anything else is drawn on it (dark text,
 * a gray block, an outline, an unfamiliar shade), because such a cell is
 * never assumed open. The grid's own lines — a full-width row of one
 * neutral gray or white, a few of them per cell (the ten-minute line, the
 * hour line's white-and-gray pair) — are part of every blank cell and are
 * ignored; a neutral fill is not a line, and some software shades
 * unavailable time that way, so more than a quarter of the cell in lines
 * stays for review.
 */
function cellShares(image: Pixels, col: Pick<LayoutColumn,'xStart'|'xEnd'>, yStart: number, yEnd: number, allowTint: boolean): { blue: number; tint: number } | null {
  const left=Math.max(0,Math.ceil(col.xStart*image.width)+3), right=Math.min(image.width,Math.floor(col.xEnd*image.width)-3);
  const top=Math.max(0,Math.ceil(yStart*image.height)), bottom=Math.min(image.height,Math.floor(yEnd*image.height));
  if(right-left<10 || bottom-top<1) return null;
  let blue=0,tint=0,lineRows=0,total=0;
  const isBackground=(r:number,g:number,b:number)=>b-r>=20 && b-g>=8 && g-r>=8 && r>=65;
  const isPale=(r:number,g:number,b:number)=>{ const lo=Math.min(r,g,b), hi=Math.max(r,g,b); return lo>=200 && hi-lo>=6; };
  for(let y=top;y<bottom;y++) {
    const i0=(y*image.width+left)*4, r0=image.data[i0], g0=image.data[i0+1], b0=image.data[i0+2];
    if(!isBackground(r0,g0,b0) && !isPale(r0,g0,b0)) {
      // A row of one color the whole cell width is a line — the grid's, the
      // hour's, a box border — whatever its shade; the cap below keeps a fill out.
      let uniform=true;
      for(let x=left+1;x<right;x++) { const i=(y*image.width+x)*4; if(Math.abs(image.data[i]-r0)>3 || Math.abs(image.data[i+1]-g0)>3 || Math.abs(image.data[i+2]-b0)>3) { uniform=false; break; } }
      if(uniform) { lineRows++; continue; }
    }
    for(let x=left;x<right;x++) {
      const i=(y*image.width+x)*4,r=image.data[i],g=image.data[i+1],b=image.data[i+2];
      // A pale tint (Dentrix shades an unbooked slot inside the provider's
      // hours this way) is light on every channel but not neutral.
      if(isBackground(r,g,b)) blue++;
      else if(isPale(r,g,b) && allowTint) tint++;
      else return null;
      total++;
    }
  }
  if(total===0 || lineRows/(bottom-top) > .25) return null;
  return { blue: blue/total, tint: tint/total };
}

/** A uniform blue grid contains neither text nor appointment blocks. Unfamiliar pixels stay for review. */
export function isEmptyBlueGridColumn(image: Pixels, col: Pick<LayoutColumn,'xStart'|'xEnd'>, yStart=0, yEnd=1): boolean {
  return (cellShares(image, col, yStart, yEnd, false)?.blue ?? 0) > .7;
}

/**
 * Which kind of empty cell this is: blank blue grid, a uniform pale tint,
 * or null when something is drawn on it or the shade is unfamiliar. A
 * neutral light gray is not assumed open — some practice software shades
 * unavailable time that way — and stays for review. Lane omission keeps the
 * stricter blue-only test above: a column tinted all day is a provider with
 * nothing booked, not an empty lane.
 */
export function openSlotKind(image: Pixels, col: Pick<LayoutColumn,'xStart'|'xEnd'>, yStart: number, yEnd: number): OpenSlotKind | null {
  const shares = cellShares(image, col, yStart, yEnd, true);
  if (!shares) return null;
  if (shares.tint > .7) return 'tint';
  if (shares.blue > .7) return 'blue';
  return null;
}

/** One grid cell that is an open slot of either kind, with nothing drawn on it. */
export function isOpenSlotCell(image: Pixels, col: Pick<LayoutColumn,'xStart'|'xEnd'>, yStart: number, yEnd: number): boolean {
  return openSlotKind(image, col, yStart, yEnd) !== null;
}

/** Neutral appointment backgrounds in blue-grid schedules. Other themes fall back to layout OCR. */
export function detectAppointmentRegions(image: { width: number; height: number; data: ArrayLike<number> }): OcrBox[] {
  const { width, height, data } = image;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const hi = Math.max(r,g,b), lo = Math.min(r,g,b);
    mask[i] = hi - lo <= 8 && lo >= 60 && hi <= 210 ? 1 : 0;
  }
  const queue = new Int32Array(mask.length);
  const found: OcrBox[] = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let read = 0, size = 1, x0 = width, x1 = 0, y0 = height, y1 = 0;
    queue[0] = start; mask[start] = 0;
    while (read < size) {
      const p = queue[read++], x = p % width, y = Math.floor(p / width);
      x0 = Math.min(x0,x); x1 = Math.max(x1,x); y0 = Math.min(y0,y); y1 = Math.max(y1,y);
      for (const next of [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, p - width, p + width]) {
        if (next >= 0 && next < mask.length && mask[next]) { mask[next] = 0; queue[size++] = next; }
      }
    }
    const w = x1 - x0 + 1, h = y1 - y0 + 1;
    if (w >= Math.max(40,width * .025) && w <= width * .45 && h >= 7 && h < height * .8 && size / (w*h) > .55) found.push({x0,y0,x1:x1+1,y1:y1+1});
  }
  return found.sort((a,b) => a.y0 - b.y0 || a.x0 - b.x0);
}

/** Occupied column bounds come from appointment edges, not toolbar/header words. */
export function columnsFromRegions(regions: OcrBox[], width: number): Array<Pick<LayoutColumn, 'xStart' | 'xEnd'>> {
  const groups: OcrBox[] = [];
  for (const box of regions) {
    if (!groups.some(g => Math.abs(g.x0 - box.x0) < width * .01 && Math.abs(g.x1 - box.x1) < width * .01)) groups.push(box);
  }
  return groups.sort((a,b) => a.x0-b.x0).map(b => ({ xStart: b.x0/width, xEnd: b.x1/width }));
}

/** Wording that reserves a provider's time even without a code: holds and early arrivals stay clinical. */
const RESERVES_TIME = /\b(?:hold|holds|arriv\w*|asap|reserved?|early)\b/i;

/**
 * A column whose boxes are all notes — "NO MORE CROWNS", "Moved down 1
 * unit", "sent blast" — is not a provider's chair. A one-line bar, a box no
 * taller than a line and a half of the grid's text, is a note whatever it
 * says ("Aware Early", "<-- CAN NOT COME IN EARLIER"): nothing is booked in
 * a row that thin unless it prints as an appointment. Taller boxes are read
 * by their words: when appointment boxes elsewhere on this grid carry
 * provider codes, a box with no code and no hold wording is a note, whatever
 * it says; when no code is visible anywhere (a view that hides them), only
 * positive note wording counts, because the absence of a code alone proves
 * nothing.
 */
export function isNotesOnlyColumn(words: OcrWord[], regions: OcrBox[], column: Pick<LayoutColumn,'xStart'|'xEnd'>, width: number): boolean {
  const boxes = regions.filter(b => b.x0 >= column.xStart * width - 4 && b.x1 <= column.xEnd * width + 4);
  if (!boxes.length) return false;
  const codesVisibleOnGrid = readProviderCodes(words).length > 0;
  const heights = words.filter(w => w.confidence >= 60 && w.text.length >= 3).map(w => w.bbox.y1 - w.bbox.y0).sort((a, b) => a - b);
  const lineHeight = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
  const isBar = (b: OcrBox) => lineHeight > 0 && b.y1 - b.y0 <= lineHeight * 1.8;
  return boxes.every(b => {
    const inside = words.filter(w => w.bbox.x0 >= b.x0-2 && w.bbox.x1 <= b.x1+2 && w.bbox.y0 >= b.y0-2 && w.bbox.y1 <= b.y1+2);
    const text = inside.map(w => w.text).join(' ');
    if (/\b(?:DR|HY|HYG)\s*\d{1,4}\b/i.test(text) || inside.some(w => w.confidence >= 40 && providerCodeCandidate(w.text))) return false;
    if (looksLikeAppointment(text)) return false; // an appointment whose code the engine misread is still an appointment
    if (isBar(b)) return true;
    if (RESERVES_TIME.test(text)) return false;
    return codesVisibleOnGrid || /\b(?:sent|call|question|reminder|memo|notes?)\b/i.test(text);
  });
}
