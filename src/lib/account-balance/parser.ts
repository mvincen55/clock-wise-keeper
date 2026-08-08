/**
 * Dentrix ledger parser — OCR word geometry → structured transactions.
 *
 * Column reconstruction uses the x-positions of the ledger's header words
 * (DATE · TEETH · DESCRIPTION · PATIENT · CHARGE · PAYMENT · BALANCE), not
 * text order: every word below the header line is assigned to the column
 * whose horizontal band contains its center. Row grouping reuses the
 * schedule-reader line clustering.
 *
 * HIPAA boundary: input words come from the local Tesseract pipeline and are
 * wiped by the caller immediately after this parse. The rows produced here
 * exist only in React memory for the session.
 */
import type { OcrWord } from '@/lib/schedule-reader/types';
import { groupWordsIntoLines } from '@/lib/schedule-reader/privacy-detector';
import { classifyTransaction } from './classify';
import { parseLedgerAmount, parseLedgerDate } from './money';
import type { LedgerMoneyField, LedgerRow, ParsedLedgerCapture } from './types';

export type LedgerColumnKey =
  | 'date'
  | 'tooth'
  | 'description'
  | 'patient'
  | 'charge'
  | 'payment'
  | 'balance';

interface ColumnBand {
  key: LedgerColumnKey;
  /** Horizontal band (inclusive) that owns words in this column. */
  xStart: number;
  xEnd: number;
}

const HEADER_SYNONYMS: Array<{ key: LedgerColumnKey; pattern: RegExp }> = [
  { key: 'date', pattern: /^date$/i },
  { key: 'tooth', pattern: /^(teeth|tooth|th)$/i },
  { key: 'description', pattern: /^(description|desc|procedure)$/i },
  { key: 'patient', pattern: /^(patient|name)$/i },
  { key: 'charge', pattern: /^(charge|charges)$/i },
  { key: 'payment', pattern: /^(payment|payments|credits?)$/i },
  { key: 'balance', pattern: /^(balance|bal)$/i },
];

/** Words-per-line clusters, in reading order. Re-exported for tests. */
export { groupWordsIntoLines };

interface HeaderDetection {
  lineIndex: number;
  /** y just below the header line — rows live under it. */
  bottomY: number;
  columns: ColumnBand[];
}

/**
 * Find the header line and derive column bands from its word geometry.
 * Requires at least DATE + DESCRIPTION + two money columns to trust it.
 */
export function detectHeaderColumns(
  lines: Array<{ text: string; words: OcrWord[] }>
): HeaderDetection | null {
  for (let i = 0; i < lines.length; i++) {
    const anchors: Array<{ key: LedgerColumnKey; center: number }> = [];
    for (const word of lines[i].words) {
      const clean = word.text.replace(/[^A-Za-z]/g, '');
      const match = HEADER_SYNONYMS.find(h => h.pattern.test(clean));
      if (match && !anchors.some(a => a.key === match.key)) {
        anchors.push({ key: match.key, center: (word.bbox.x0 + word.bbox.x1) / 2 });
      }
    }
    const keys = new Set(anchors.map(a => a.key));
    const moneyCount = ['charge', 'payment', 'balance'].filter(k => keys.has(k as LedgerColumnKey)).length;
    if (!keys.has('date') || !keys.has('description') || moneyCount < 2) continue;

    anchors.sort((a, b) => a.center - b.center);
    const columns: ColumnBand[] = anchors.map((a, idx) => ({
      key: a.key,
      xStart: idx === 0 ? -Infinity : (anchors[idx - 1].center + a.center) / 2,
      xEnd: idx === anchors.length - 1 ? Infinity : (a.center + anchors[idx + 1].center) / 2,
    }));
    const bottomY = Math.max(...lines[i].words.map(w => w.bbox.y1));
    return { lineIndex: i, bottomY, columns };
  }
  return null;
}

function cellText(words: OcrWord[]): string {
  return words
    .sort((a, b) => a.bbox.x0 - b.bbox.x0)
    .map(w => w.text)
    .join(' ')
    .trim();
}

function meanConfidence(words: OcrWord[]): number {
  if (words.length === 0) return 0;
  return Math.min(1, Math.max(0, words.reduce((s, w) => s + w.confidence, 0) / words.length / 100));
}

let rowCounter = 0;
/** Unique in-memory row id — never persisted anywhere. */
export function nextRowId(): string {
  rowCounter += 1;
  return `abx-row-${rowCounter}`;
}

/** OCR word confidence below this marks the field "Please verify". */
const VERIFY_THRESHOLD = 0.6;

/**
 * Parse the OCR words of one ledger crop into transactions.
 * The caller wipes `words` immediately after this returns.
 */
export function parseLedgerWords(words: OcrWord[], captureId: string): ParsedLedgerCapture {
  const lines = groupWordsIntoLines(words);
  const header = detectHeaderColumns(lines);
  if (!header) {
    return { captureId, rows: [], headerFound: false, meanConfidence: meanConfidence(words) };
  }

  const rows: LedgerRow[] = [];
  let sequence = 0;

  for (let i = header.lineIndex + 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip lines that sit above the header band (clustering is y-sorted,
    // but guard against stray fragments).
    const lineTop = Math.min(...line.words.map(w => w.bbox.y0));
    if (lineTop < header.bottomY - 2) continue;

    const cells = new Map<LedgerColumnKey, OcrWord[]>();
    for (const word of line.words) {
      const center = (word.bbox.x0 + word.bbox.x1) / 2;
      const band = header.columns.find(c => center >= c.xStart && center < c.xEnd);
      if (!band) continue;
      const list = cells.get(band.key) ?? [];
      list.push(word);
      cells.set(band.key, list);
    }

    const get = (key: LedgerColumnKey) => cellText(cells.get(key) ?? []);
    const conf = (key: LedgerColumnKey) => meanConfidence(cells.get(key) ?? []);

    const dateText = get('date');
    const dateISO = parseLedgerDate(dateText);
    const chargeParsed = parseLedgerAmount(get('charge'));
    const paymentParsed = parseLedgerAmount(get('payment'));
    const balanceParsed = parseLedgerAmount(get('balance'));
    const description = get('description');

    const hasMoney = chargeParsed !== null || paymentParsed !== null || balanceParsed !== null;

    // A line with no date and no money is a description continuation of the
    // previous row (Dentrix wraps long descriptions).
    if (!dateISO && !hasMoney) {
      const prev = rows[rows.length - 1];
      const continuation = [description, get('patient'), get('tooth')].filter(Boolean).join(' ').trim();
      if (prev && continuation !== '') {
        prev.rawDescription = `${prev.rawDescription} ${continuation}`.trim();
      }
      continue;
    }

    const lowConfidenceFields: LedgerMoneyField[] = [];
    if (dateText !== '' && (!dateISO || conf('date') < VERIFY_THRESHOLD)) lowConfidenceFields.push('date');
    if (get('charge') !== '' && (chargeParsed === null || chargeParsed.uncertain || conf('charge') < VERIFY_THRESHOLD)) {
      lowConfidenceFields.push('charge');
    }
    if (get('payment') !== '' && (paymentParsed === null || paymentParsed.uncertain || conf('payment') < VERIFY_THRESHOLD)) {
      lowConfidenceFields.push('payment');
    }
    if (get('balance') !== '' && (balanceParsed === null || balanceParsed.uncertain || conf('balance') < VERIFY_THRESHOLD)) {
      lowConfidenceFields.push('balance');
    }

    const tooth = get('tooth');
    const classified = classifyTransaction({
      rawDescription: description,
      tooth,
      chargeCents: chargeParsed?.cents ?? null,
      paymentCents: paymentParsed?.cents ?? null,
    });

    rows.push({
      id: nextRowId(),
      sourceCaptureId: captureId,
      sourceSequence: sequence,
      dateISO: dateISO ?? '',
      tooth,
      rawDescription: description,
      patientName: get('patient'),
      chargeCents: chargeParsed?.cents ?? null,
      paymentCents: paymentParsed?.cents ?? null,
      balanceCents: balanceParsed?.cents ?? null,
      ocrConfidence: meanConfidence(line.words),
      lowConfidenceFields,
      classification: classified.classification,
      classificationConfidence: classified.confidence,
      staffVerified: false,
    });
    sequence += 1;
  }

  return { captureId, rows, headerFound: true, meanConfidence: meanConfidence(words) };
}

// ---------------------------------------------------------------------------
// Multi-screenshot sequence-overlap dedupe
// ---------------------------------------------------------------------------

/**
 * Ordered fingerprint of a row for overlap matching. Includes the displayed
 * balance so two legitimately identical transactions (same date, wording,
 * and amount) still differ unless their running balances match too.
 */
export function rowFingerprint(row: LedgerRow): string {
  return [
    row.dateISO,
    row.rawDescription.replace(/\s+/g, ' ').trim().toLowerCase(),
    row.chargeCents ?? 'x',
    row.paymentCents ?? 'x',
    row.balanceCents ?? 'x',
  ].join('|');
}

/** Minimum contiguous rows to call a suffix/prefix match a real overlap. */
export const MIN_OVERLAP_ROWS = 2;

/**
 * Merge a new capture after the existing rows, removing ONLY a confirmed
 * sequence overlap: the longest k ≥ MIN_OVERLAP_ROWS where the last k
 * existing fingerprints equal the first k new fingerprints, contiguously.
 *
 * This is deliberately NOT a global date+description+amount dedupe — a
 * ledger can legitimately contain identical transactions (two $0 insurance
 * postings, twin fees). Only the seam between consecutive screenshots is
 * deduplicated, and only when the whole run matches.
 */
export function mergeCaptureRows(existing: LedgerRow[], incoming: LedgerRow[]): {
  merged: LedgerRow[];
  overlapRemoved: number;
} {
  const maxK = Math.min(existing.length, incoming.length);
  let overlap = 0;
  for (let k = maxK; k >= MIN_OVERLAP_ROWS; k--) {
    let matches = true;
    for (let j = 0; j < k; j++) {
      if (rowFingerprint(existing[existing.length - k + j]) !== rowFingerprint(incoming[j])) {
        matches = false;
        break;
      }
    }
    if (matches) {
      overlap = k;
      break;
    }
  }
  return {
    merged: [...existing, ...incoming.slice(overlap)],
    overlapRemoved: overlap,
  };
}

// ---------------------------------------------------------------------------
// Patient name inference
// ---------------------------------------------------------------------------

export interface PatientNameInference {
  /** The single consistent name, '' when none or unresolved. */
  name: string;
  /** Every distinct normalized name seen in the PATIENT column. */
  distinctNames: string[];
  /** More than one distinct patient name — screenshots may span accounts. */
  conflict: boolean;
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * Infer the patient name only when the ledger consistently carries ONE
 * normalized name. Multiple distinct names is a hard stop upstream.
 */
export function inferPatientName(rows: LedgerRow[]): PatientNameInference {
  const byNormalized = new Map<string, string>();
  for (const row of rows) {
    const norm = normalizeName(row.patientName);
    if (norm === '') continue;
    if (!byNormalized.has(norm)) byNormalized.set(norm, row.patientName.replace(/\s+/g, ' ').trim());
  }
  const distinct = [...byNormalized.values()];
  if (distinct.length === 1) return { name: distinct[0], distinctNames: distinct, conflict: false };
  return { name: '', distinctNames: distinct, conflict: distinct.length > 1 };
}
