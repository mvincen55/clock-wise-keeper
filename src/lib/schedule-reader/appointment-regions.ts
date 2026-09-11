import type { OcrBox, OcrWord, LayoutColumn } from './types';

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

export function isNotesOnlyColumn(words: OcrWord[], regions: OcrBox[], column: Pick<LayoutColumn,'xStart'|'xEnd'>, width: number): boolean {
  const boxes = regions.filter(b => b.x0 >= column.xStart * width - 4 && b.x1 <= column.xEnd * width + 4);
  if (!boxes.length) return false;
  // Require positive note wording in every box; lack of a code alone is not evidence.
  return boxes.every(b => {
    const text = words.filter(w => w.bbox.x0 >= b.x0-2 && w.bbox.x1 <= b.x1+2 && w.bbox.y0 >= b.y0-2 && w.bbox.y1 <= b.y1+2).map(w => w.text).join(' ');
    return !/\b(?:DR|HY|HYG)\s*\d{1,4}\b/i.test(text) && /\b(?:sent|call|question|reminder|memo|notes?)\b/i.test(text);
  });
}
