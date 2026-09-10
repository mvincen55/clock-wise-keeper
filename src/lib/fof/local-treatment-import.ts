import type { OcrWord } from '../schedule-reader/types';

export interface LocalTreatmentRow { code: string; tooth: string; description: string; fee: number | null; officeFee: number | null; entryDate: string; visit: number | null }
export interface LocalTreatmentImport { rows: LocalTreatmentRow[]; warnings: string[] }
const failure = () => new Error('The screenshot could not be read completely. Nothing was imported. Use a clearer image with the Code and column headers visible, or enter the procedures manually.');
const midpoint = (word: OcrWord) => (word.bbox.y0 + word.bbox.y1) / 2;
const plain = (text: string) => text.trim().replace(/[():]/g, '').toLowerCase();
const dentalCode = /^D\d{4}$/i;
const tooth = /^#?(?:[1-9]|[12]\d|3[0-2]|[A-T])(?:[-*](?:[1-9]|[12]\d|3[0-2]|[A-T]))?$/i;

/** Geometry-based reading of explicit PMS columns. No fee/visit guessing and no
 * raw descriptions copied out of an image. Staff review every row before import. */
export function parseTreatmentWords(words: OcrWord[], codeNames: Record<string, string>): LocalTreatmentImport {
  if (!words.length) throw failure();
  const ordered = [...words].sort((a, b) => midpoint(a) - midpoint(b) || a.bbox.x0 - b.bbox.x0);
  const firstCode = ordered.find(word => dentalCode.test(word.text) || !!codeNames[word.text.toUpperCase()]);
  const codeHeader = ordered.find(word => plain(word.text) === 'code' && (!firstCode || midpoint(word) < midpoint(firstCode)));
  if (!codeHeader) throw failure();
  const headerY = midpoint(codeHeader);
  const headerHeight = codeHeader.bbox.y1 - codeHeader.bbox.y0;
  const headerWords = ordered.filter(word => Math.abs(midpoint(word) - headerY) < Math.max(10, headerHeight));
  const headerNames: Record<string, string> = { code: 'code', tooth: 'tooth', teeth: 'tooth', th: 'tooth', visit: 'visit', date: 'date', fee: 'fee', office: 'officeFee', description: 'description', desc: 'description', procedure: 'description', allowable: 'ignore', insurance: 'ignore', portion: 'ignore', ins: 'ignore', pays: 'ignore', surface: 'ignore', surfaces: 'ignore' };
  const columns = headerWords.filter(word => headerNames[plain(word.text)]).map(word => ({ name: headerNames[plain(word.text)], x: (word.bbox.x0 + word.bbox.x1) / 2 })).sort((a, b) => a.x - b.x);
  const codeColumn = columns.find(column => column.name === 'code')!;
  const codeIndex = columns.indexOf(codeColumn);
  const codeLeft = codeIndex ? (columns[codeIndex - 1].x + codeColumn.x) / 2 : -Infinity;
  const codeRight = columns[codeIndex + 1] ? (codeColumn.x + columns[codeIndex + 1].x) / 2 : codeColumn.x + 80;
  const inCodeColumn = (word: OcrWord) => {
    const center = (word.bbox.x0 + word.bbox.x1) / 2;
    return center >= codeLeft && center < codeRight;
  };
  const belowHeader = ordered.filter(word => midpoint(word) > headerY + headerHeight);
  const footer = belowHeader.find(word => inCodeColumn(word) && /^(?:total|totals|balance)$/i.test(plain(word.text)));
  const candidates = belowHeader.filter(word => (!footer || midpoint(word) < midpoint(footer)) && inCodeColumn(word) &&
    (/^[A-Z][A-Z0-9_-]{1,19}$/i.test(word.text) || /^\d{3,10}$/.test(word.text)) && !/^(?:code|visit|subtotal|page)$/i.test(word.text));
  if (!candidates.length || candidates.length > 40) throw failure();
  const warnings: string[] = [];
  if (!columns.some(column => column.name === 'officeFee' || column.name === 'fee')) warnings.push('No fee column was recognized; the office fee schedule will supply the fees.');
  if (!columns.some(column => column.name === 'tooth')) warnings.push('No tooth column was recognized. Check and enter tooth numbers before printing.');
  const rows = candidates.map(candidate => {
    if (candidate.confidence < 65) throw failure();
    const y = midpoint(candidate);
    const height = Math.max(8, candidate.bbox.y1 - candidate.bbox.y0);
    const rowWords = belowHeader.filter(word => Math.abs(midpoint(word) - y) <= height * 0.55);
    if (candidates.filter(word => Math.abs(midpoint(word) - y) <= height * 0.55).length !== 1) throw failure();
    const cell = (name: string) => {
      const index = columns.findIndex(column => column.name === name);
      if (index < 0) return [];
      const left = index ? (columns[index - 1].x + columns[index].x) / 2 : -Infinity;
      const right = columns[index + 1] ? (columns[index].x + columns[index + 1].x) / 2 : Infinity;
      return rowWords.filter(word => { const x = (word.bbox.x0 + word.bbox.x1) / 2; return x >= left && x < right; }).sort((a, b) => a.bbox.x0 - b.bbox.x0);
    };
    const readMoney = (name: string) => {
      const values = cell(name);
      if (!values.length) return null;
      const raw = values.map(word => word.text).join('').replace(/[$,\s]/g, '');
      if (!/^\d+\.\d{2}$/.test(raw) || values.some(word => word.confidence < 65)) throw failure();
      const number = Number(raw);
      if (!Number.isFinite(number) || number > 10000000) throw failure();
      return number;
    };
    const toothWords = cell('tooth');
    const toothValue = toothWords.map(word => word.text).join('').replace(/\s/g, '');
    if (toothValue && (!tooth.test(toothValue) || toothWords.some(word => word.confidence < 65))) throw failure();
    let visitValue = cell('visit').map(word => word.text).join('');
    if (!visitValue) {
      const heading = ordered.filter(word => plain(word.text) === 'visit' && midpoint(word) < y).at(-1);
      const number = heading && ordered.find(word => Math.abs(midpoint(word) - midpoint(heading)) < height * 0.55 && word.bbox.x0 >= heading.bbox.x1 && word.bbox.x0 - heading.bbox.x1 < 100 && /^\d{1,3}$/.test(word.text));
      if (number) visitValue = number.text;
    }
    if (visitValue && (!/^\d{1,3}$/.test(visitValue) || Number(visitValue) < 1)) throw failure();
    const entryDate = cell('date').map(word => word.text).join('');
    if (entryDate && !/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(entryDate)) throw failure();
    const code = candidate.text.toUpperCase();
    if (!dentalCode.test(code) && !codeNames[code]) warnings.push(`Review the custom code ${code}; it was not matched to the office code bank.`);
    return { code, tooth: toothValue.replace(/^#/, '').toUpperCase(), description: codeNames[code] ?? '',
      fee: readMoney('fee'), officeFee: readMoney('officeFee'), entryDate, visit: visitValue ? Number(visitValue) : null };
  });
  if (rows.every(row => row.visit === null)) warnings.push('No visit numbers were read. Check the appointment grouping after import.');
  return { rows, warnings: [...new Set(warnings)] };
}

/** Same-origin OCR assets; no upload, CDN, storage, logging, or remote fallback. */
export async function readLocalTreatment(file: File, codeNames: Record<string, string>): Promise<LocalTreatmentImport> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng', 1, { workerPath: '/tesseract/worker.min.js', corePath: '/tesseract', langPath: '/tesseract', gzip: true, cacheMethod: 'none', workerBlobURL: false });
  let bitmap: ImageBitmap | null = null;
  const canvas = document.createElement('canvas');
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 25000000) throw failure();
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) throw failure();
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(bitmap, 0, 0);
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
      for (const word of line.words) words.push({ text: word.text.trim(), confidence: word.confidence, bbox: { ...word.bbox } });
    }
    return parseTreatmentWords(words, codeNames);
  } catch { throw failure(); }
  finally { bitmap?.close(); canvas.width = 0; canvas.height = 0; await worker.terminate(); }
}
