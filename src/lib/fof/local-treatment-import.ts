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
 * vanished line. Every issue names the exact cell to check (and quotes the
 * text read when it is not a usable value), never a recognition score.
 *
 * Small PMS type reads correctly at a confidence Tesseract calls low, so a
 * low-confidence code or amount is corroborated against the office fee
 * schedule before it is flagged: a code the office bank knows, on a row
 * whose fee reads as that code's own on-file fee, is read right unless a
 * one-character neighbour of the code carries the same fee. A code that
 * had to be corrected, an unknown code, a $0 fee or a fee that differs
 * from the schedule is never corroborated.
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
/** Words read below this Tesseract confidence (0–100) are flagged for a second look. */
export const CONFIDENCE_FLOOR = 65;
/** Pixel budget for the upscaled read; keeps the reader responsive on a laptop. */
const OCR_PIXEL_BUDGET = 12_000_000;

const failure = () =>
  new Error(
    'The screenshot could not be read. Nothing was imported. Use a clearer image with the Code and column headers visible, paste the plan as text, or enter the procedures manually.'
  );
const midpoint = (word: OcrWord) => (word.bbox.y0 + word.bbox.y1) / 2;
const center = (word: OcrWord) => (word.bbox.x0 + word.bbox.x1) / 2;
const plain = (text: string) => text.trim().replace(/[():.]/g, '').toLowerCase();
const dentalCode = /^D\d{4}$/i;
// A CDT code (with an optional office suffix), a numeric office code, or a
// short letters-plus-digits office code. A word, a name or a sentence
// fragment never passes, so nothing else in the plan is ever read as a row.
const officeCode = /^(?:D\d{4}(?:[A-Z.]{1,3})?|\d{1,6}|[A-Z]{1,2}\d{2,5}[A-Z]?)$/i;
const tooth = /^#?(?:[1-9]|[12]\d|3[0-2]|[A-T])(?:[-*](?:[1-9]|[12]\d|3[0-2]|[A-T]))?$/i;
const moneyText = /^\d+\.\d{2}$/;
const dateText = /^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/;
/** Icons, bullets and list glyphs the OCR turns into stray symbols beside a cell. */
const symbolOnly = (text: string) => !/[A-Za-z0-9]/.test(text);
/** Leading/trailing glyph noise ("(®", "\\Visit1", "|3") without touching the token itself. */
const trimGlyphs = (text: string) => text.trim().replace(/^[^A-Za-z0-9$#]+/, '').replace(/[^A-Za-z0-9%.]+$/, '');

const HEADER_NAMES: Record<string, string> = {
  code: 'code', tooth: 'tooth', teeth: 'tooth', th: 'tooth', visit: 'visit', date: 'date', fee: 'fee',
  office: 'officeFee', description: 'description', desc: 'description', procedure: 'description',
  allowable: 'ignore', insurance: 'ignore', portion: 'ignore', ins: 'ignore', pays: 'ignore',
  surface: 'ignore', surfaces: 'ignore', surf: 'ignore', proc: 'ignore', appt: 'ignore', entry: 'ignore', exp: 'ignore',
  status: 'ignore', provider: 'ignore', prov: 'ignore',
};
/** The word before "Date" in a two-word PMS header decides which date column it is. */
const DATE_QUALIFIERS: Record<string, string> = { entry: 'date', proc: 'ignore', appt: 'ignore', exp: 'ignore', post: 'ignore', due: 'ignore' };

/**
 * OCR confusions inside a token that can only be digits: the letter O for 0,
 * I or l for 1, S for 5, B for 8. Applied to codes, amounts, teeth and dates
 * only after the token's shape says it is numeric there.
 */
const digitConfusables: Record<string, string> = { O: '0', o: '0', I: '1', l: '1', '|': '1', S: '5', B: '8' };
const fixDigits = (text: string) => text.replace(/[OoIl|SB]/g, ch => digitConfusables[ch] ?? ch);

/**
 * A code token as the office would write it, plus whether the read had to be
 * corrected. "D6O57" and "D6O5B" become D6057; "06057" (a D read as a zero)
 * becomes D6057 unless the office bank really has a code spelled that way.
 */
export function normalizeCodeToken(raw: string, known: Record<string, string> = {}): { code: string; corrected: boolean } {
  const trimmed = trimGlyphs(raw).toUpperCase();
  if (known[trimmed] || dentalCode.test(trimmed)) return { code: trimmed, corrected: false };
  const cdt = /^[D0O]([0-9OIlSB]{4})([A-Z.]{1,3})?$/.exec(trimmed);
  if (cdt && !(/^\d+$/.test(trimmed) && trimmed[0] !== '0')) {
    const code = `D${fixDigits(cdt[1])}${cdt[2] ?? ''}`;
    if (code !== trimmed) return { code, corrected: true };
  }
  return { code: trimmed, corrected: false };
}

/**
 * Dollars and cents from an OCR cell: "$1,141.00", "1.141.00", "1,141,00" and
 * digit confusions all read as 1141.00; the last separator is the decimal
 * point and it must leave exactly two cents digits. Null when the text is
 * not an amount at all.
 */
export function normalizeMoneyToken(raw: string): number | null {
  const text = fixDigits(trimGlyphs(raw).replace(/[$\s]/g, ''));
  const match = /^(\d[\d.,]*)[.,](\d{2})$/.exec(text);
  if (!match) return null;
  const whole = match[1].replace(/[.,]/g, '');
  if (!/^\d+$/.test(whole)) return null;
  const value = Number(`${whole}.${match[2]}`);
  return Number.isFinite(value) ? value : null;
}

/** "6/24/2024" with digit confusions fixed; empty when the cell is not a date. */
export function normalizeDateToken(raw: string): string {
  const text = fixDigits(trimGlyphs(raw).replace(/\s/g, ''));
  return dateText.test(text) ? text : '';
}

/** "Visit 1", "Visit1", "\\Visit #2" → 2; "Visit Not Set" → null; anything else → undefined. */
export function visitFromHeading(words: string[]): number | null | undefined {
  const joined = words.map(word => trimGlyphs(word)).join(' ').replace(/\s+/g, ' ').trim();
  const match = /^visit\s*#?\s*(\d{1,3})\b/i.exec(joined);
  if (match) return Number(match[1]);
  return /^visit\b/i.test(joined) ? null : undefined;
}

/** Geometry-based reading of explicit PMS columns. No fee/visit guessing and no
 * raw descriptions copied out of an image. Staff review every row before import. */
export function parseTreatmentWords(words: OcrWord[], codeNames: Record<string, string>, officeFees: Record<string, number> = {}): LocalTreatmentImport {
  if (!words.length) throw failure();
  const onFile = (code: string): number | null => {
    const fee = officeFees[code] ?? officeFees[code.toUpperCase()];
    return typeof fee === 'number' && Number.isFinite(fee) && fee > 0 ? Math.round(fee * 100) / 100 : null;
  };
  // A code the reader could have confused with this one: same length, one
  // character different (D6057/D6058, D0367/D0387). Same fee there means the
  // amount cannot tell the two apart.
  const neighbourWithFee = (code: string, fee: number) =>
    Object.keys(officeFees).some(other => {
      const upper = other.toUpperCase();
      if (upper === code || upper.length !== code.length) return false;
      let differs = 0;
      for (let i = 0; i < code.length && differs < 2; i += 1) if (upper[i] !== code[i]) differs += 1;
      return differs === 1 && onFile(upper) === fee;
    });
  const ordered = [...words].sort((a, b) => midpoint(a) - midpoint(b) || a.bbox.x0 - b.bbox.x0);
  const firstCode = ordered.find(word => dentalCode.test(trimGlyphs(word.text)) || !!codeNames[trimGlyphs(word.text).toUpperCase()]);
  const codeHeader = ordered.find(word => plain(word.text) === 'code' && (!firstCode || midpoint(word) < midpoint(firstCode)));
  if (!codeHeader) throw failure();
  const headerY = midpoint(codeHeader);
  const headerHeight = codeHeader.bbox.y1 - codeHeader.bbox.y0;
  const headerWords = ordered
    .filter(word => Math.abs(midpoint(word) - headerY) < Math.max(10, headerHeight))
    .sort((a, b) => a.bbox.x0 - b.bbox.x0);
  const columns = headerWords
    .map((word, index) => {
      let name = HEADER_NAMES[plain(word.text)];
      if (name === 'date') {
        // "Proc Date", "Appt Date", "Entry Date": only the entry date is office-copy detail.
        const before = headerWords[index - 1];
        const qualifier = before && word.bbox.x0 - before.bbox.x1 < 40 ? DATE_QUALIFIERS[plain(before.text)] : undefined;
        if (qualifier) name = qualifier;
      }
      return name ? { name, x: center(word) } : null;
    })
    .filter((column): column is { name: string; x: number } => column !== null)
    .sort((a, b) => a.x - b.x);
  // Several plain "Date" headers and none marked "Entry": the first is the date column, as before.
  const codeColumn = columns.find(column => column.name === 'code')!;
  const codeIndex = columns.indexOf(codeColumn);
  const codeLeft = codeIndex ? (columns[codeIndex - 1].x + codeColumn.x) / 2 : -Infinity;
  const codeRight = columns[codeIndex + 1] ? (codeColumn.x + columns[codeIndex + 1].x) / 2 : codeColumn.x + 80;
  const inCodeColumn = (word: OcrWord) => center(word) >= codeLeft && center(word) < codeRight;
  // Everything whose centre sits below the header's bottom edge: the first
  // data row of a tight PMS grid starts directly under the header.
  const belowHeader = ordered.filter(word => midpoint(word) > headerY + headerHeight * 0.5);
  const footer = belowHeader.find(word => inCodeColumn(word) && /^(?:total|totals|balance)$/i.test(plain(word.text)));
  const candidates = belowHeader
    .map(word => ({ word, ...normalizeCodeToken(word.text, codeNames) }))
    .filter(
      ({ word, code }) =>
        (!footer || midpoint(word) < midpoint(footer)) &&
        inCodeColumn(word) &&
        officeCode.test(code) &&
        !/^(?:code|visit|subtotal|page)$/i.test(code)
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
  const headings = ordered.filter(word => /^visit/i.test(trimGlyphs(word.text)));
  const rows = candidates.map(({ word: candidate, code, corrected }): LocalTreatmentRow => {
    const issues: string[] = [];
    let confidence: RowConfidence = 'ok';
    const lower = () => { confidence = 'low'; };
    if (corrected) {
      issues.push(`The code was read as "${trimGlyphs(candidate.text)}" and corrected to ${code}; confirm it against the screenshot.`);
      lower();
    }
    const y = midpoint(candidate);
    const height = Math.max(8, candidate.bbox.y1 - candidate.bbox.y0);
    const sameRow = (word: OcrWord) => Math.abs(midpoint(word) - y) <= height * 0.55;
    const rowWords = belowHeader.filter(sameRow);
    if (candidates.filter(({ word }) => sameRow(word)).length !== 1) {
      issues.push('Two codes share this row on the image; confirm which procedure this is.');
      lower();
    }
    const cell = (name: string) => {
      const index = columns.findIndex(column => column.name === name);
      if (index < 0) return [];
      const left = index ? (columns[index - 1].x + columns[index].x) / 2 : -Infinity;
      const right = columns[index + 1] ? (columns[index].x + columns[index + 1].x) / 2 : Infinity;
      return rowWords
        .filter(word => !symbolOnly(word.text) && center(word) >= left && center(word) < right)
        .sort((a, b) => a.bbox.x0 - b.bbox.x0);
    };
    const readMoney = (name: string, label: string): { value: number | null; unsure?: string } => {
      const values = cell(name);
      if (!values.length) return { value: null };
      const raw = values.map(word => trimGlyphs(word.text)).join('');
      const number = normalizeMoneyToken(raw);
      if (number === null) {
        issues.push(`The ${label} amount was read as "${raw}", which is not dollars and cents; enter it by hand.`);
        lower();
        return { value: null };
      }
      if (number > 10000000) {
        issues.push(`The ${label} amount was read as "${raw}", which is out of range; enter it by hand.`);
        lower();
        return { value: null };
      }
      const weakest = values.reduce((low, word) => (word.confidence < low.confidence ? word : low));
      const unsure = weakest.confidence < CONFIDENCE_FLOOR
        ? `Check the ${label} amount "${raw}" against the screenshot; the text is unclear.`
        : undefined;
      return { value: number, unsure };
    };
    const toothWords = cell('tooth');
    let toothValue = toothWords.map(word => trimGlyphs(word.text)).join('').replace(/\s/g, '');
    if (toothValue && !tooth.test(toothValue) && tooth.test(fixDigits(toothValue))) toothValue = fixDigits(toothValue);
    if (toothValue && !tooth.test(toothValue)) {
      issues.push(`The tooth cell was read as "${toothValue}", which is not a tooth number; enter it by hand.`);
      lower();
      toothValue = '';
    } else if (toothValue) {
      const weakest = toothWords.reduce((low, word) => (word.confidence < low.confidence ? word : low));
      if (weakest.confidence < CONFIDENCE_FLOOR) {
        issues.push(`Check tooth number "${toothValue}" against the screenshot; the text is unclear.`);
        lower();
      }
    }
    // A visit column on the row, else the "Visit N" section heading above it
    // ("Visit Not Set" leaves the visit open on purpose).
    let visitValue: number | null = null;
    let visitProblem = '';
    const visitCell = cell('visit').map(word => trimGlyphs(word.text)).join('');
    if (visitCell) {
      const digits = fixDigits(visitCell);
      if (/^\d{1,3}$/.test(digits) && Number(digits) >= 1) visitValue = Number(digits);
      else visitProblem = `The visit cell was read as "${visitCell}", which is not a visit number; check the appointment grouping.`;
    } else {
      const heading = headings.filter(word => midpoint(word) < y).at(-1);
      if (heading) {
        const rest = ordered
          .filter(word => word !== heading && Math.abs(midpoint(word) - midpoint(heading)) < height * 0.55 && word.bbox.x0 >= heading.bbox.x1 - 2 && word.bbox.x0 - heading.bbox.x1 < 100)
          .sort((a, b) => a.bbox.x0 - b.bbox.x0)
          .map(word => word.text);
        const fromHeading = visitFromHeading([heading.text, ...rest]);
        if (typeof fromHeading === 'number') visitValue = fromHeading;
      }
    }
    if (visitProblem) { issues.push(visitProblem); lower(); }
    const dateRaw = cell('date').map(word => trimGlyphs(word.text)).join('');
    const entryDate = dateRaw ? normalizeDateToken(dateRaw) : '';
    if (dateRaw && !entryDate) issues.push(`The entry date was read as "${dateRaw}", which is not a date; it is office-copy detail only.`);
    if (!dentalCode.test(code) && !codeNames[code]) {
      issues.push('This code is not on the office fee schedule; confirm it or correct it before importing.');
    }
    const feeRead = readMoney('fee', 'Fee');
    const officeRead = readMoney('officeFee', 'Office');
    // Corroboration: the row's fee (the OFFICE column when the plan has one)
    // is exactly the on-file fee of the code as read. Only an uncorrected,
    // known code with a non-zero on-file fee qualifies, and not when a
    // one-character neighbour of the code costs the same.
    const scheduleFee = !corrected && codeNames[code] ? onFile(code) : null;
    const rowFee = officeRead.value ?? feeRead.value;
    const corroborated = scheduleFee !== null && rowFee !== null && rowFee === scheduleFee && !neighbourWithFee(code, scheduleFee);
    if (candidate.confidence < CONFIDENCE_FLOOR && !corroborated) {
      issues.push(`Check code ${code} against the screenshot; the text is unclear.`);
      lower();
    }
    for (const read of [feeRead, officeRead]) {
      if (read.unsure && !(corroborated && read.value === scheduleFee)) { issues.push(read.unsure); lower(); }
    }
    const fee = feeRead.value;
    const officeFee = officeRead.value;
    return {
      code, tooth: toothValue.replace(/^#/, '').toUpperCase(), description: codeNames[code] ?? '',
      fee, officeFee, entryDate, visit: visitValue, confidence, issues,
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
    if (/^visit\s+not\s+set\b/i.test(line)) { currentVisit = null; continue; }
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

/**
 * How much to enlarge a screenshot before reading it. PMS grids are set in
 * 9–11px type, which Tesseract misreads at native size (on a real plan it
 * found 4 of 8 codes and no amounts; at 2× it found all 8 with every amount
 * and date). Small captures get 3×, ordinary ones 2×, within the pixel budget.
 */
export function ocrScale(width: number, height: number): number {
  const wanted = width < 900 ? 3 : 2;
  const budget = Math.sqrt(OCR_PIXEL_BUDGET / Math.max(1, width * height));
  return Math.max(1, Math.min(wanted, budget));
}

/** Flatten anti-aliased colour UI text to grayscale in place (luma weights). */
export function toGrayscale(pixels: Uint8ClampedArray): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const gray = Math.round(0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2]);
    pixels[i] = pixels[i + 1] = pixels[i + 2] = gray;
  }
}

/** Same-origin OCR assets; no upload, CDN, storage, logging, or remote fallback. */
export async function readLocalTreatment(file: File, codeNames: Record<string, string>, officeFees: Record<string, number> = {}): Promise<LocalTreatmentImport> {
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
    const scale = ocrScale(bitmap.width, bitmap.height);
    canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw failure();
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.fillStyle = 'white'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const image = context.getImageData(0, 0, canvas.width, canvas.height);
    toGrayscale(image.data);
    context.putImageData(image, 0, 0);
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const words: OcrWord[] = [];
    for (const block of data.blocks ?? []) for (const paragraph of block.paragraphs) for (const line of paragraph.lines) {
      for (const word of line.words) {
        // Positions are reported in screenshot pixels, whatever the read scale.
        words.push({ text: word.text.trim(), confidence: word.confidence, bbox: { x0: word.bbox.x0 / scale, y0: word.bbox.y0 / scale, x1: word.bbox.x1 / scale, y1: word.bbox.y1 / scale } });
      }
    }
    return parseTreatmentWords(words, codeNames, officeFees);
  } catch (error) {
    throw error instanceof Error && error.message.includes('Nothing was') ? error : failure();
  } finally {
    bitmap?.close(); canvas.width = 0; canvas.height = 0;
    if (worker) await worker.terminate();
  }
}
