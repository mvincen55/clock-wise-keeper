import type { OcrBox, OcrWord, LayoutColumn } from './types';
import { looksLikeAppointment, providerCodeCandidate, readProviderCodes } from './provider-codes';

type Pixels = { width: number; height: number; data: ArrayLike<number> };

/**
 * Share of a cell that is empty background, or null when any pixel is
 * something else (text, a gray block, an unfamiliar shade). Blue grid always
 * counts; a uniform light tint counts only when the caller allows it.
 */
function emptyShare(image: Pixels, col: Pick<LayoutColumn,'xStart'|'xEnd'>, yStart: number, yEnd: number, allowTint: boolean): number | null {
  const left=Math.max(0,Math.ceil(col.xStart*image.width)+3), right=Math.min(image.width,Math.floor(col.xEnd*image.width)-3);
  const top=Math.max(0,Math.ceil(yStart*image.height)), bottom=Math.min(image.height,Math.floor(yEnd*image.height));
  if(right-left<10 || bottom-top<1) return null;
  let empty=0,total=0;
  for(let y=top;y<bottom;y++)for(let x=left;x<right;x++) {
    const i=(y*image.width+x)*4,r=image.data[i],g=image.data[i+1],b=image.data[i+2];
    const background=b-r>=20 && b-g>=8 && g-r>=8 && r>=65;
    // A pale tint (Dentrix shades an unbooked slot inside the provider's
    // hours this way) is light on every channel but not neutral.
    const lo=Math.min(r,g,b), hi=Math.max(r,g,b);
    const tint=allowTint && lo>=200 && hi-lo>=6;
    // Bright neutral grid lines are harmless; dark text or gray blocks are not.
    const gridLine=r>=220 && g>=220 && b>=220 && hi-lo<6;
    if(!background && !tint && !gridLine) return null;
    empty+=Number(background||tint); total++;
  }
  return total>0 ? empty/total : null;
}

/** A uniform blue grid contains neither text nor appointment blocks. Unfamiliar pixels stay for review. */
export function isEmptyBlueGridColumn(image: Pixels, col: Pick<LayoutColumn,'xStart'|'xEnd'>, yStart=0, yEnd=1): boolean {
  return (emptyShare(image, col, yStart, yEnd, false) ?? 0) > .7;
}

/**
 * One grid cell that is an open slot: blank blue grid, or a uniform pale
 * tint with nothing drawn on it. A neutral light gray is not assumed open —
 * some practice software shades unavailable time that way — and stays for
 * review. Lane omission keeps the stricter blue-only test above: a column
 * tinted all day is a provider with nothing booked, not an empty lane.
 */
export function isOpenSlotCell(image: Pixels, col: Pick<LayoutColumn,'xStart'|'xEnd'>, yStart: number, yEnd: number): boolean {
  return (emptyShare(image, col, yStart, yEnd, true) ?? 0) > .7;
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
 * unit", "sent blast" — is not a provider's chair. When appointment boxes
 * elsewhere on this grid carry provider codes, a box with no code and no
 * hold wording is a note, whatever it says; when no code is visible anywhere
 * (a view that hides them), only positive note wording counts, because the
 * absence of a code alone proves nothing.
 */
export function isNotesOnlyColumn(words: OcrWord[], regions: OcrBox[], column: Pick<LayoutColumn,'xStart'|'xEnd'>, width: number): boolean {
  const boxes = regions.filter(b => b.x0 >= column.xStart * width - 4 && b.x1 <= column.xEnd * width + 4);
  if (!boxes.length) return false;
  const codesVisibleOnGrid = readProviderCodes(words).length > 0;
  return boxes.every(b => {
    const inside = words.filter(w => w.bbox.x0 >= b.x0-2 && w.bbox.x1 <= b.x1+2 && w.bbox.y0 >= b.y0-2 && w.bbox.y1 <= b.y1+2);
    const text = inside.map(w => w.text).join(' ');
    if (/\b(?:DR|HY|HYG)\s*\d{1,4}\b/i.test(text) || inside.some(w => w.confidence >= 40 && providerCodeCandidate(w.text))) return false;
    if (looksLikeAppointment(text)) return false; // an appointment whose code the engine misread is still an appointment
    if (RESERVES_TIME.test(text)) return false;
    return codesVisibleOnGrid || /\b(?:sent|call|question|reminder|memo|notes?)\b/i.test(text);
  });
}
