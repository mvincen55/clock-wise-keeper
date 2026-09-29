import type { OcrWord } from '../schedule-reader/types';

/**
 * Local, same-origin reading of a treatment plan for the FOF builder.
 *
 * PRIVACY BOUNDARY: a treatment-plan screenshot may carry a patient's name
 * even after cropping, so the image and every word read off it stay in this
 * browser. There is no upload, no AI endpoint, no CDN, no storage, no
 * logging and no remote fallback of any kind. The only things that leave
 * this module are structured rows (code, tooth, fee, office fee, visit,
 * entry date) that staff review on screen before anything enters the form,
 * and even those never leave the browser.
 *
 * Nothing is silently discarded: a cell the OCR is unsure about, a code the
 * office bank does not know, or a plan longer than the review limit comes
 * back as a row with issues for staff to confirm or drop, never as a
 * vanished line.
 */

export type RowConfidence = 'ok' | 'low';

export interface LocalTreatmentRow {
  code: string;
  tooth: string;
  /** Office code-bank description for the code; never text copied off the image. */
  description: string;
  fee: number | null;
  officeFee: number | null;
  entryDate: string;
  visit: number | null;
  /** 'low' when any cell of the row read below the confidence floor. */
  confidence: RowConfidence;
  /** Why this row needs a look before import (empty when nothing does). */
  issues: string[];
}

export interface LocalTreatmentImport {
  rows: LocalTreatmentRow[];
  warnings: string[];
  /** True when the plan exceeded the recommended review size. */
  oversized: boolean;
}

/** The size above which a plan is flagged for batch review. */
export const REVIEW_ROW_LIMIT = 40;
/** A hard ceiling that keeps a misread page from producing thousands of rows. */
export const MAX_ROWS = 200;
const CONFIDENCE_FLOOR = 65;

const failure = () =>
  new Error(
    'The screenshot could not be read. Nothing was imported. Use a clearer image with the Code and column headers visible, paste the plan as text, or enter the procedures manually.'
  );
const midpoint = (word: OcrWord) => (word.bbox.y0 + word.bbox.y1) / 2;
const plain = (text: string) => text.trim().replace(/[():]/g, '').toLowerCase();
const dentalCode = /^D\d{4}$/i;
// A CDT code (with an optional office suffix), a numeric office code, or a
// short letters-plus-digits office code. A word, a name or a sentence
// fragment never passes, so nothing else in the plan is ever read as a row.
const officeCode = /^(?:D\d{4}(?:[A-Z.]{1,3})?|\d{1,6}|[A-Z]{1,2}\d{2,5}[A-Z]?)$/i;
const tooth = /^#?(?:[1-9]|[12]\d|3[0-2]|[A-T])(?:[-*](?:[1-9]|[12]\d|3[0-2]|[A-T]))?$/i;
const moneyText = /^\d+\.\d{2}$/;
const dateText = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;

const HEADER_NAMES: Record<string, string> = {
  code: 'code', tooth: 'tooth', teeth: 'tooth', th: 'tooth', visit: 'visit', date: 'date', fee: 'fee',
  office: 'officeFee', description: 'description', desc: 'description', procedure: 'description',
  allowable: 'ignore', insurance: 'ignore', portion: 'ignore', ins: 'ignore', pays: 'ignore',
  surface: 'ignore', surfaces: 'ignore',
};

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
  const columns = headerWords
    .filter(word => HEADER_NAMES[plain(word.text)])
    .map(word => ({ name: HEADER_NAMES[plain(word.text)], x: (word.bbox.x0 + word.bbox.x1) / 2 }))
    .sort((a, b) => a.x - b.x);
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
  const candidates = belowHeader.filter(
    word =>
      (!footer || midpoint(word) < midpoint(footer)) &&
      inCodeColumn(word) &&
      officeCode.test(word.text) &&
      !/^(?:code|visit|subtotal|page)$/i.test(word.text)
  );
  if (!candidates.length) throw failure();
  if (candidates.length > MAX_ROWS) throw failure();
  const warnings: string[] = [];
  const oversized = candidates.length > REVIEW_ROW_LIMIT;
  if (oversized) {
    warnings.push(
      `${candidates.length} procedure rows were read — more than the ${REVIEW_ROW_LIMIT}-row review limit. Every row is listed; check the count against the original plan before importing, or import it in batches.`
    );
  }
  if (!columns.some(column => column.name === 'officeFee' || column.name === 'fee')) warnings.push('No fee column was recognized; the office fee schedule will supply the fees.');
  if (!columns.some(column => column.name === 'tooth')) warnings.push('No tooth column was recognized. Check and enter tooth numbers before printing.');
  const rows = candidates.map((candidate): LocalTreatmentRow => {
    const issues: string[] = [];
    let confidence: RowConfidence = candidate.confidence < CONFIDENCE_FLOOR ? 'low' : 'ok';
    if (confidence === 'low') issues.push('The code was read with low confidence; compare it with the screenshot.');
    const y = midpoint(candidate);
    const height = Math.max(8, candidate.bbox.y1 - candidate.bbox.y0);
    const rowWords = belowHeader.filter(word => Math.abs(midpoint(word) - y) <= height * 0.55);
    if (candidates.filter(word => Math.abs(midpoint(word) - y) <= height * 0.55).length !== 1) {
      issues.push('Two codes share this row on the image; confirm which procedure this is.');
      confidence = 'low';
    }
    const cell = (name: string) => {
      const index = columns.findIndex(column => column.name === name);
      if (index < 0) return [];
      const left = index ? (columns[index - 1].x + columns[index].x) / 2 : -Infinity;
      const right = columns[index + 1] ? (columns[index].x + columns[index + 1].x) / 2 : Infinity;
      return rowWords
        .filter(word => { const x = (word.bbox.x0 + word.bbox.x1) / 2; return x >= left && x < right; })
        .sort((a, b) => a.bbox.x0 - b.bbox.x0);
    };
    const readMoney = (name: string, label: string): number | null => {
      const values = cell(name);
      if (!values.length) return null;
      const raw = values.map(word => word.text).join('').replace(/[$,\s]/g, '');
      if (!moneyText.test(raw)) {
        issues.push(`The ${label} amount could not be read as dollars and cents; enter it by hand.`);
        confidence = 'low';
        return null;
      }
      const number = Number(raw);
      if (!Number.isFinite(number) || number > 10000000) {
        issues.push(`The ${label} amount is out of range; enter it by hand.`);
        confidence = 'low';
        return null;
      }
      if (values.some(word => word.confidence < CONFIDENCE_FLOOR)) {
        issues.push(`The ${label} amount was read with low confidence; compare it with the screenshot.`);
        confidence = 'low';
      }
      return number;
    };
    const toothWords = cell('tooth');
    let toothValue = toothWords.map(word => word.text).join('').replace(/\s/g, '');
    if (toothValue && !tooth.test(toothValue)) {
      issues.push('The tooth cell did not read as a tooth number; enter it by hand.');
      confidence = 'low';
      toothValue = '';
    } else if (toothValue && toothWords.some(word => word.confidence < CONFIDENCE_FLOOR)) {
      issues.push('The tooth number was read with low confidence; compare it with the screenshot.');
      confidence = 'low';
    }
    let visitValue = cell('visit').map(word => word.text).join('');
    if (!visitValue) {
      const heading = ordered.filter(word => plain(word.text) === 'visit' && midpoint(word) < y).at(-1);
      const number = heading && ordered.find(word => Math.abs(midpoint(word) - midpoint(heading)) < height * 0.55 && word.bbox.x0 >= heading.bbox.x1 && word.bbox.x0 - heading.bbox.x1 < 100 && /^\d{1,3}$/.test(word.text));
      if (number) visitValue = number.text;
    }
    if (visitValue && (!/^\d{1,3}$/.test(visitValue) || Number(visitValue) < 1)) {
      issues.push('The visit number could not be read; check the appointment grouping.');
      confidence = 'low';
      visitValue = '';
    }
    let entryDate = cell('date').map(word => word.text).join('');
    if (entryDate && !dateText.test(entryDate)) {
      issues.push('The entry date could not be read; it is office-copy detail only.');
      entryDate = '';
    }
    const code = candidate.text.toUpperCase();
    if (!dentalCode.test(code) && !codeNames[code]) {
      issues.push('This code is not on the office fee schedule; confirm it or correct it before importing.');
    }
    const fee = readMoney('fee', 'Fee');
    const officeFee = readMoney('officeFee', 'Office');
    return {
      code, tooth: toothValue.replace(/^#/, '').toUpperCase(), description: codeNames[code] ?? '',
      fee, officeFee, entryDate, visit: visitValue ? Number(visitValue) : null, confidence, issues,
    };
  });
  if (rows.every(row => row.visit === null)) warnings.push('No visit numbers were read. Check the appointment grouping after import.');
  return { rows, warnings: [...new Set(warnings)], oversized };
}

/**
 * Pasted treatment-plan text (a PMS grid copied as text, or lines typed by
 * hand). Every line that starts with a procedure code becomes a row; the
 * rest of the line is scanned for a tooth number, dollar amounts (first =
 * fee, second = office fee) and a "Visit N" marker. Descriptions are never
 * taken from the pasted text — the office code bank names the procedure.
 */
export function parseTreatmentText(text: string, codeNames: Record<string, string>): LocalTreatmentImport {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  const rows: LocalTreatmentRow[] = [];
  const warnings: string[] = [];
  let currentVisit: number | null = null;
  let skipped = 0;
  for (const line of lines) {
    const visitHeading = /^visit\s*#?\s*(\d{1,3})\b/i.exec(line);
    if (visitHeading) { currentVisit = Number(visitHeading[1]); continue; }
    // Tabs, pipes, semicolons and whitespace separate cells; a comma only
    // separates when it ends a cell (so "$1,569.00" stays one amount).
    const tokens = line.split(/[\t|;]+|\s+/).map(token => token.replace(/,+$/, '')).filter(Boolean);
    const codeToken = tokens[0]?.toUpperCase() ?? '';
    if (!officeCode.test(codeToken) || /^(?:total|totals|balance|code|subtotal|page)$/i.test(codeToken)) { skipped++; continue; }
    const rest = tokens.slice(1);
    const issues: string[] = [];
    const toothToken = rest.find(token => tooth.test(token));
    const money = rest
      .map(token => token.replace(/[$,]/g, ''))
      .filter(token => moneyText.test(token) || /^\d+$/.test(token) && token.length <= 7)
      .map(Number)
      .filter(value => Number.isFinite(value) && value <= 10000000);
    const inlineVisit = /\bvisit\s*#?\s*(\d{1,3})\b/i.exec(line);
    const visit = inlineVisit ? Number(inlineVisit[1]) : currentVisit;
    const date = rest.find(token => dateText.test(token)) ?? '';
    // A bare number that is also the visit or tooth is not an amount.
    const amounts = money.filter(value => !(toothToken && value === Number(toothToken)) && !(visit !== null && value === visit && !moneyText.test(String(value))));
    if (!dentalCode.test(codeToken) && !codeNames[codeToken]) issues.push('This code is not on the office fee schedule; confirm it or correct it before importing.');
    if (amounts.length > 2) issues.push('More than two dollar amounts were found on this line; only the first (fee) and second (office fee) are used.');
    rows.push({
      code: codeToken,
      tooth: toothToken ? toothToken.replace(/^#/, '').toUpperCase() : '',
      description: codeNames[codeToken] ?? '',
      fee: amounts[0] ?? null,
      officeFee: amounts[1] ?? null,
      entryDate: date,
      visit,
      confidence: 'ok',
      issues,
    });
  }
  if (!rows.length) throw new Error('No procedure lines were recognized in the pasted text. Each line should start with a procedure code (for example D2740 3 1569.00).');
  if (rows.length > MAX_ROWS) throw new Error(`The pasted plan has more than ${MAX_ROWS} lines. Paste it in smaller batches.`);
  if (skipped) warnings.push(`${skipped} line${skipped === 1 ? '' : 's'} did not start with a procedure code and ${skipped === 1 ? 'was' : 'were'} left out.`);
  const oversized = rows.length > REVIEW_ROW_LIMIT;
  if (oversized) warnings.push(`${rows.length} procedure lines were read — more than the ${REVIEW_ROW_LIMIT}-row review limit. Check the count against the original plan before importing.`);
  if (rows.every(row => row.visit === null)) warnings.push('No visit numbers were found. Check the appointment grouping after import.');
  return { rows, warnings, oversized };
}

/** Same-origin OCR assets; no upload, CDN, storage, logging, or remote fallback. */
export async function readLocalTreatment(file: File, codeNames: Record<string, string>): Promise<LocalTreatmentImport> {
  const { createWorker } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | null = null;
  let bitmap: ImageBitmap | null = null;
  const canvas = document.createElement('canvas');
  try {
    try {
      worker = await createWorker('eng', 1, { workerPath: '/tesseract/worker.min.js', corePath: '/tesseract', langPath: '/tesseract', gzip: true, cacheMethod: 'none', workerBlobURL: false });
    } catch {
      throw new Error('The on-device text reader could not start (its files did not load from this site). Nothing was uploaded and nothing was imported. Reload the page and try again, or paste the plan as text.');
    }
    bitmap = await createImageBitmap(file);
    if (bitmap.width * bitmap.height > 25000000) throw new Error('The image is too large to read on this device. Crop it to the treatment plan and try again. Nothing was imported.');
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
  } catch (error) {
    throw error instanceof Error && error.message.includes('Nothing was') ? error : failure();
  } finally {
    bitmap?.close(); canvas.width = 0; canvas.height = 0;
    if (worker) await worker.terminate();
  }
}
