/** Local form reader. Raw text, files and pixels never leave this module. */
import { createWorker, PSM } from 'tesseract.js';
import type { Campaign, Ledger, RosterName, ScheduleSheet, SheetReading } from '@/lib/fill-the-schedule';
import { localDateTime, officeTimestamp } from '@/lib/fill-the-schedule';
import { cellBounds, SHEET_LAYOUT } from './sheet-layout';

export function matchStaff(text: string, names: RosterName[]): string | null {
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\bdr\.?\s*/g, '').replace(/[^a-z]/g, '');
  const value = norm(text); if (value.length < 2) return null;
  const matches = names.filter(n => n.employment_status === 'active' && (norm(n.display_name) === value || norm(n.display_name.replace(/^dr\.?\s+/i, '').split(/\s+/)[0]) === value));
  return matches.length === 1 ? matches[0].id : null;
}
export function sheetTimestamp(date: string, time: string, c: Campaign): string | null {
  const day = date.trim().match(/^(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2}|\d{4}))?$/);
  const clock = time.trim().match(/^(\d{1,2})\s*[:.]\s*(\d{2})\s*(am|pm|a|p)?$/i);
  if (!day || !clock) return null;
  const year = day[3] ? day[3].length === 2 ? `20${day[3]}` : day[3] : c.starts_on.slice(0, 4);
  let hour = Number(clock[1]); const min = Number(clock[2]); const suffix = clock[3]?.toLowerCase();
  // A handwritten 1–12 without AM/PM is ambiguous. Do not guess office hours.
  if (min > 59 || hour > 23 || (!suffix && hour >= 1 && hour <= 12) || (suffix && (hour < 1 || hour > 12))) return null;
  if (suffix) hour = hour % 12 + (suffix.startsWith('p') ? 12 : 0);
  const wall = `${year}-${day[1].padStart(2, '0')}-${day[2].padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
  try { const ts = officeTimestamp(wall, c.timezone); return localDateTime(ts, c.timezone) === wall ? ts : null; } catch { return null; }
}
function canvas(width: number, height: number) { const c = document.createElement('canvas'); c.width = width; c.height = height; return c; }
function context(c: HTMLCanvasElement) { const ctx = c.getContext('2d', { willReadFrequently: true }); if (!ctx) throw new Error('Could not read this image on the device.'); return ctx; }
function ink(c: HTMLCanvasElement, x: number, y: number, width: number, height: number): number {
  const pixels = context(c).getImageData(Math.round(x), Math.round(y), Math.max(1, Math.round(width)), Math.max(1, Math.round(height))).data;
  let dark = 0; for (let i = 0; i < pixels.length; i += 4) if ((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3 < 150) dark++;
  return dark / (pixels.length / 4);
}
/** Four printed corner squares calibrate the form, including mild perspective. */
function markers(c: HTMLCanvasElement): { x: number; y: number }[] | null {
  const scale = Math.min(1, 1000 / c.width); const small = canvas(Math.round(c.width * scale), Math.round(c.height * scale));
  try {
    context(small).drawImage(c, 0, 0, small.width, small.height); const { width: w, height: h } = small;
    const data = context(small).getImageData(0, 0, w, h).data; const visited = new Uint8Array(w * h); const found: { x: number; y: number; area: number }[] = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      if (!(x < w * .25 || x > w * .75) || !(y < h * .2 || y > h * .8)) continue;
      const first = y * w + x; if (visited[first] || data[first * 4] > 100) continue;
      const queue = [first]; visited[first] = 1; let minX = x, maxX = x, minY = y, maxY = y;
      for (let i = 0; i < queue.length; i++) {
        const n = queue[i], px = n % w, py = Math.floor(n / w); minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py);
        for (const next of [n - w, n + w, n - 1, n + 1]) {
          if (next < 0 || next >= w * h || Math.abs(next % w - px) > 1 || visited[next] || data[next * 4] > 100) continue;
          visited[next] = 1; queue.push(next);
        }
      }
      const bw = maxX - minX + 1, bh = maxY - minY + 1;
      if (bw >= 3 && bw <= 24 && bh >= 3 && bh <= 24 && bw / bh > .65 && bw / bh < 1.5 && queue.length / (bw * bh) > .7) found.push({ x: (minX + maxX) / 2 / scale, y: (minY + maxY) / 2 / scale, area: queue.length });
    }
    const corners = [[0, 0], [c.width, 0], [0, c.height], [c.width, c.height]];
    const selected = corners.map(([x, y]) => found.filter(p => (x === 0 ? p.x < c.width / 2 : p.x > c.width / 2) && (y === 0 ? p.y < c.height / 2 : p.y > c.height / 2)).sort((a, b) => Math.hypot(a.x - x, a.y - y) - Math.hypot(b.x - x, b.y - y))[0]);
    return selected.every(Boolean) ? selected.map(({ x, y }) => ({ x, y })) : null;
  } finally { small.width = 0; small.height = 0; }
}
function normalize(c: HTMLCanvasElement): HTMLCanvasElement {
  const points = markers(c); if (!points) throw new Error('Could not locate all four form corners. Upload an upright full-page scan with all corner squares visible.');
  const out = canvas(SHEET_LAYOUT.width * 2, SHEET_LAYOUT.height * 2); const source = context(c).getImageData(0, 0, c.width, c.height); const dest = context(out).createImageData(out.width, out.height);
  const [nw, ne, sw, se] = points;
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) {
    const u = (x / 2 - 13.5) / 970, v = (y / 2 - 13.5) / 726;
    const sx = Math.round((1 - v) * ((1 - u) * nw.x + u * ne.x) + v * ((1 - u) * sw.x + u * se.x));
    const sy = Math.round((1 - v) * ((1 - u) * nw.y + u * ne.y) + v * ((1 - u) * sw.y + u * se.y));
    const d = (y * out.width + x) * 4, s = (Math.min(c.height - 1, Math.max(0, sy)) * c.width + Math.min(c.width - 1, Math.max(0, sx))) * 4;
    dest.data[d] = source.data[s]; dest.data[d + 1] = source.data[s + 1]; dest.data[d + 2] = source.data[s + 2]; dest.data[d + 3] = 255;
  }
  context(out).putImageData(dest, 0, 0); source.data.fill(0); dest.data.fill(0); return out;
}
function crossedOut(c: HTMLCanvasElement, row: number): boolean {
  const first = cellBounds(row, 1), last = cellBounds(row, 4);
  const x = Math.round((first.x + 4) * 2), y = Math.round((first.y + 4) * 2);
  const width = Math.round((last.x + last.width - first.x - 8) * 2), height = 30 * 2;
  const data = context(c).getImageData(x, y, width, height).data;
  // A long stroke through the writing area is a flag, never an approval.
  for (const slope of [-.07, 0, .07]) for (let start = 5; start < height - 5; start += 3) {
    let hits = 0, samples = 0;
    for (let px = 0; px < width; px += 3) {
      const py = Math.round(start + slope * (px - width / 2)); if (py < 2 || py >= height - 2) continue;
      samples++; let dark = false;
      for (let dy = -2; dy <= 2; dy++) { const p = ((py + dy) * width + px) * 4; if ((data[p] + data[p + 1] + data[p + 2]) / 3 < 150) dark = true; }
      if (dark) hits++;
    }
    if (samples > width / 4 && hits / samples > .7) return true;
  }
  return false;
}
async function load(file: File): Promise<HTMLCanvasElement> {
  if (file.size > 8 * 1024 * 1024) throw new Error('Use one page under 8 MB.');
  if (file.type === 'application/pdf') {
    // The compatibility build includes typed-array APIs missing in older office browsers.
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs'); pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString();
    const bytes = new Uint8Array(await file.arrayBuffer()); const task = pdfjs.getDocument({ data: bytes });
    try { const doc = await task.promise; if (doc.numPages !== 1) throw new Error('Upload one sheet page at a time.'); const page = await doc.getPage(1); const view = page.getViewport({ scale: 2.5 }); const c = canvas(Math.ceil(view.width), Math.ceil(view.height)); try { await page.render({ canvas: c, canvasContext: context(c), viewport: view }).promise; return c; } catch (e) { c.width = 0; c.height = 0; throw e; } } finally { await task.destroy(); if (bytes.byteLength) bytes.fill(0); }
  }
  if (!['image/jpeg', 'image/png'].includes(file.type)) throw new Error('Use a JPEG, PNG, or single-page PDF.');
  const bitmap = await createImageBitmap(file); try { if (bitmap.width * bitmap.height > 40_000_000) throw new Error('This image is too large. Export a smaller scan.'); const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height)); const c = canvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale)); context(c).drawImage(bitmap, 0, 0, c.width, c.height); return c; } finally { bitmap.close(); }
}
export async function readLocalSheet(file: File, d: Ledger, sheet: ScheduleSheet, progress: (n: number) => void): Promise<{ rows: SheetReading[]; releasedAt: string }> {
  let original: HTMLCanvasElement | null = null; let page: HTMLCanvasElement | null = null;
  const rows: SheetReading[] = [];
  const worker = await createWorker('eng', 1, { workerPath: '/tesseract/worker.min.js', corePath: '/tesseract', langPath: '/tesseract', gzip: true, cacheMethod: 'none', workerBlobURL: false });
  try {
    await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE }); original = await load(file); page = normalize(original); original.width = 0; original.height = 0; original = null;
    async function read(x: number, y: number, width: number, height: number) {
      // Empty cells are empty. Avoid OCR inventing characters on a blank crop.
      if (ink(page!, x * 2, y * 2, width * 2, height * 2) < .001) return { text: '', confidence: 1 };
      const crop = canvas(Math.round(width * 3), Math.round(height * 3));
      try { context(crop).drawImage(page!, x * 2, y * 2, width * 2, height * 2, 0, 0, crop.width, crop.height); const { data } = await worker.recognize(crop); return { text: data.text.trim(), confidence: Math.min(1, data.confidence / 100) }; } finally { crop.width = 0; crop.height = 0; }
    }
    await worker.setParameters({ tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-' });
    const code = await read(772, 82, 205, 34); const printedCode = code.text.toUpperCase().replace(/\s/g, '').match(/^S-\d{4}-[A-Z]+$/)?.[0];
    await worker.setParameters({ tessedit_char_whitelist: '', tessedit_pageseg_mode: PSM.SINGLE_LINE });
    // Exact agreement with the selected registered code is required. OCR's
    // language confidence penalizes punctuation in these machine identifiers;
    // that confidence never determines an employee or an award.
    if (!printedCode || printedCode !== sheet.sheet_code) throw new Error('The printed sheet code could not be confirmed. Choose the matching registered sheet and upload a clearer scan.');
    for (let row = 1; row <= 12; row++) {
      const fields: { text: string; confidence: number }[] = [];
      for (const col of [1, 2, 3, 4, 8]) { const b = cellBounds(row, col); fields.push(await read(b.x + 3, b.y + 4, b.width - 6, b.height - 8)); }
      const [date, time, credit, booked, app] = fields;
      const tx = cellBounds(row, 5), pay = cellBounds(row, 6), hm = cellBounds(row, 9), pm = cellBounds(row, 10);
      const checked = (b: ReturnType<typeof cellBounds>, x = 5, y = 13) => ink(page!, (b.x + x + 2) * 2, (b.y + y + 2) * 2, 6 * 2, 6 * 2) > .12;
      const initialed = (b: ReturnType<typeof cellBounds>) => ink(page!, (b.x + 51) * 2, (b.y + 4) * 2, 27 * 2, 16 * 2) > .06;
      const none = checked(pay, 5, 6), yes = checked(pay, 53, 6); const prepaid = none !== yes ? yes : null;
      const payText = await read(pay.x + 3, pay.y + 20, pay.width - 6, 14);
      const parts = payText.text.replace(/date|time/gi, '').trim().split(/\s+/); const payDate = parts.find(t => /^\d{1,2}[/.-]\d{1,2}/.test(t)) ?? ''; const payTime = parts.filter(t => /\d{1,2}[:.]\d{2}|^(am|pm|a|p)$/i.test(t)).join(' ');
      const scheduled = checked(tx); const handoffVerified = checked(hm) && initialed(hm); const prepayVerified = checked(pm) && initialed(pm);
      const occurred = sheetTimestamp(date.text, time.text, d.campaign); const prepayAt = sheetTimestamp(payDate, payTime, d.campaign);
      const person = matchStaff(credit.text, d.names); const bookedBy = matchStaff(booked.text, d.names);
      const appCode = d.activities.find(a => a.entry_code === app.text.toUpperCase().replace(/\s/g, ''))?.entry_code ?? null;
      const blank = !date.text && !time.text && !credit.text && !scheduled && !handoffVerified && !prepayVerified && !yes;
      const marksConfidence = d.campaign.scan_validation ? .95 : .8;
      const crossed = !blank && crossedOut(page!, row);
      if (!blank) rows.push({ row_no: row, blank: false, occurred_at: occurred, credit_employee_id: person, booked_by_employee_id: bookedBy, staff_confirmed: scheduled,
        handoff_verified: handoffVerified, prepay_yes: prepaid, prepay_at: prepayAt, prepay_verified: prepayVerified, app_code: appCode, crossed_out: crossed,
        confidence: { occurred_at: occurred ? Math.min(date.confidence, time.confidence) : 0, credit: person ? credit.confidence : 0, booked_by: bookedBy ? booked.confidence : 0,
          staff: marksConfidence, handoff_verified: marksConfidence, prepay_yes: prepaid == null ? 0 : marksConfidence, prepay_at: prepayAt ? payText.confidence : 0, prepay_verified: marksConfidence, app_code: appCode ? app.confidence : app.text ? 0 : 1, crossed_out: marksConfidence } });
      progress(row);
    }
    // Checkbox recognition deliberately remains below the auto-post threshold
    // until the real handwriting/form test validates these crop coordinates.
  } finally { if (original) { original.width = 0; original.height = 0; } if (page) { page.width = 0; page.height = 0; } await worker.terminate(); }
  return { rows, releasedAt: new Date().toISOString() };
}
