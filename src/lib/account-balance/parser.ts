/**
 * Dentrix ledger parser — OCR word geometry → structured transactions.
 *
 * Column reconstruction uses the x-positions of the ledger's header words
 * (DATE · TEETH · DESCRIPTION · PATIENT · CHARGE · PAYMENT · BALANCE), not
 * text order: every word below the header line is assigned to the column
 * whose horizontal band contains its center. Row grouping reuses the
 * schedule-reader line clustering.
 *
 * Two Dentrix layouts are supported:
 *   · split money — separate CHARGE and PAYMENT columns
 *   · signed amount — the Ledger window's single AMOUNT column (Date · Tooth ·
 *     Surface · Check # · Code · * · Description · N R D M · Amount · Prov ·
 *     Ins · Balance), where payments/credits print negative. Positive amounts
 *     become charges, negative amounts payments.
 * Columns the explainer does not use (surface, check #, provider, flags…)
 * still get anchored so their contents never bleed into a money cell.
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
  | 'amount'
  | 'balance'
  | 'code'
  // Columns read only so their words stay out of neighbouring cells.
  | 'surface'
  | 'check'
  | 'provider'
  | 'ins'
  | 'flag';

/** Anchored for geometry only — never read into a row. */
const IGNORED_KEYS = new Set<LedgerColumnKey>(['surface', 'check', 'provider', 'ins', 'flag']);

interface ColumnBand {
  key: LedgerColumnKey;
  /** Horizontal band (inclusive) that owns words in this column. */
  xStart: number;
  xEnd: number;
  /** Left edge of the header word itself. */
  headerX0: number;
}

const HEADER_SYNONYMS: Array<{ key: LedgerColumnKey; pattern: RegExp }> = [
  { key: 'date', pattern: /^date$/i },
  // Dentrix truncates a narrow Tooth column to "To…".
  { key: 'tooth', pattern: /^(teeth|tooth|th|to)$/i },
  { key: 'description', pattern: /^(description|desc|procedure)$/i },
  { key: 'patient', pattern: /^(patient|name)$/i },
  { key: 'charge', pattern: /^(charge|charges)$/i },
  { key: 'payment', pattern: /^(payment|payments|credits?)$/i },
  { key: 'amount', pattern: /^(amount|amt)$/i },
  { key: 'balance', pattern: /^(balance|bal)$/i },
  { key: 'code', pattern: /^code$/i },
  { key: 'surface', pattern: /^(surface|surf)$/i },
  { key: 'check', pattern: /^(check|chk|ck)$/i },
  { key: 'provider', pattern: /^(prov|provider)$/i },
  { key: 'ins', pattern: /^ins$/i },
  { key: 'flag', pattern: /^[NRDM]$/ },
];

/**
 * Split one OCR'd header word into the header names it holds. Grid lines read
 * as "|" ("|Ins|", "N|"), and tight columns run together ("AmountProv",
 * "RDM"); each piece gets the slice of the word's box its characters cover.
 */
export function splitHeaderWord(word: OcrWord): OcrWord[] {
  const text = word.text;
  const width = word.bbox.x1 - word.bbox.x0;
  const charW = text.length > 0 ? width / text.length : 0;
  const piece = (start: number, end: number): OcrWord => ({
    ...word,
    text: text.slice(start, end),
    bbox: { ...word.bbox, x0: word.bbox.x0 + start * charW, x1: word.bbox.x0 + end * charW },
  });
  const out: OcrWord[] = [];
  const re = /[A-Za-z]+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const start = m.index;
    const letters = m[0];
    if (HEADER_SYNONYMS.some(h => h.pattern.test(letters))) {
      out.push(piece(start, start + letters.length));
      continue;
    }
    // Run-together names: accept only a split that consumes every letter.
    const parts = splitConcatenated(letters);
    if (parts) {
      let offset = start;
      for (const part of parts) {
        out.push(piece(offset, offset + part.length));
        offset += part.length;
      }
    }
  }
  return out;
}

/** Names worth finding inside a run-together header word, longest first. */
const CONCAT_NAMES = [
  'description', 'balance', 'payment', 'surface', 'charge', 'amount', 'patient',
  'check', 'tooth', 'teeth', 'code', 'prov', 'date', 'ins', 'n', 'r', 'd', 'm',
];

function splitConcatenated(letters: string): string[] | null {
  if (letters === '') return [];
  const lower = letters.toLowerCase();
  for (const name of CONCAT_NAMES) {
    if (!lower.startsWith(name)) continue;
    // Single letters only ever stand for the N · R · D · M flag columns.
    if (name.length === 1 && letters[0] !== letters[0].toUpperCase()) continue;
    const rest = splitConcatenated(letters.slice(name.length));
    if (rest) return [letters.slice(0, name.length), ...rest];
  }
  return null;
}

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
    const anchors: Array<{ key: LedgerColumnKey; center: number; x0: number }> = [];
    for (const word of lines[i].words.flatMap(splitHeaderWord)) {
      const clean = word.text;
      const match = HEADER_SYNONYMS.find(h => h.pattern.test(clean));
      // Flag columns (N · R · D · M) repeat the key; each still needs a band.
      if (match && (match.key === 'flag' || !anchors.some(a => a.key === match.key))) {
        anchors.push({ key: match.key, center: (word.bbox.x0 + word.bbox.x1) / 2, x0: word.bbox.x0 });
      }
    }
    const keys = new Set(anchors.map(a => a.key));
    const moneyCount = ['charge', 'payment', 'amount', 'balance'].filter(k => keys.has(k as LedgerColumnKey)).length;
    if (!keys.has('date') || !keys.has('description') || moneyCount < 2) continue;

    anchors.sort((a, b) => a.center - b.center);
    // Bands split halfway between header centers, except after DESCRIPTION:
    // it is left-aligned and wide, so its text runs up to the next header.
    const boundary = (left: (typeof anchors)[number], right: (typeof anchors)[number]) =>
      left.key === 'description' ? right.x0 - 2 : (left.center + right.center) / 2;
    const columns: ColumnBand[] = anchors.map((a, idx) => ({
      key: a.key,
      xStart: idx === 0 ? -Infinity : boundary(anchors[idx - 1], a),
      xEnd: idx === anchors.length - 1 ? Infinity : boundary(a, anchors[idx + 1]),
      headerX0: a.x0,
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
      // Dentrix's "*" (posted) marker sits in its own unlabeled column, and
      // grid lines read as "|".
      if (/^[*•|]+$/.test(word.text.trim())) continue;
      // The narrow Tooth column's grid line, left of its header text, reads
      // as "1" / "I" / "|" — it is not a tooth.
      const toothBand = header.columns.find(c => c.key === 'tooth');
      if (toothBand && /^[Il1|!]$/.test(word.text.trim()) && word.bbox.x1 <= toothBand.headerX0) {
        const center = (word.bbox.x0 + word.bbox.x1) / 2;
        if (center >= toothBand.xStart && center < toothBand.xEnd) continue;
      }
      const center = (word.bbox.x0 + word.bbox.x1) / 2;
      const band = header.columns.find(c => center >= c.xStart && center < c.xEnd);
      if (!band || IGNORED_KEYS.has(band.key)) continue;
      const list = cells.get(band.key) ?? [];
      list.push(word);
      cells.set(band.key, list);
    }

    // "Adj" commonly reads as "Ad)".
    const get = (key: LedgerColumnKey) => cellText(cells.get(key) ?? []).replace(/\bAd\)/g, 'Adj');
    const conf = (key: LedgerColumnKey) => meanConfidence(cells.get(key) ?? []);

    const dateText = get('date');
    const dateISO = parseLedgerDate(dateText);
    const code = get('code');
    const description = get('description');
    const amountParsed = parseLedgerAmount(get('amount'));
    // Signed-amount layout: route the one amount into charge or payment.
    // $0.00 lands on the payment side for payment-type rows (an insurance
    // check that paid nothing) and on the charge side for procedures.
    const amountIsPayment =
      amountParsed !== null &&
      (amountParsed.cents < 0 ||
        (amountParsed.cents === 0 && (/\b(pay|adj|ins)\b/i.test(code) || /\b(payment|pmt|adj)\b/i.test(description))));
    const chargeText = amountParsed && !amountIsPayment ? get('amount') : get('charge');
    const paymentText = amountParsed && amountIsPayment ? get('amount') : get('payment');
    const chargeField: LedgerColumnKey = amountParsed && !amountIsPayment ? 'amount' : 'charge';
    const paymentField: LedgerColumnKey = amountParsed && amountIsPayment ? 'amount' : 'payment';
    const chargeParsed = parseLedgerAmount(chargeText);
    const paymentParsed = parseLedgerAmount(paymentText);
    const balanceParsed = parseLedgerAmount(get('balance'));

    const hasMoney =
      chargeParsed !== null || paymentParsed !== null || balanceParsed !== null || get('amount') !== '';

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
    if (chargeText !== '' && (chargeParsed === null || chargeParsed.uncertain || conf(chargeField) < VERIFY_THRESHOLD)) {
      lowConfidenceFields.push('charge');
    }
    if (paymentText !== '' && (paymentParsed === null || paymentParsed.uncertain || conf(paymentField) < VERIFY_THRESHOLD)) {
      lowConfidenceFields.push('payment');
    }
    // An Amount cell that is not a readable number lands on neither side.
    if (get('amount') !== '' && amountParsed === null) lowConfidenceFields.push('charge');
    if (get('balance') !== '' && (balanceParsed === null || balanceParsed.uncertain || conf('balance') < VERIFY_THRESHOLD)) {
      lowConfidenceFields.push('balance');
    }

    // A lone vertical stroke in the narrow Tooth column is a truncation
    // glyph or grid line, not a tooth.
    const tooth = get('tooth')
      .split(' ')
      .filter(t => !/^[Il|!]$/.test(t))
      .join(' ');
    const classified = classifyTransaction({
      rawDescription: description,
      tooth,
      code,
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
