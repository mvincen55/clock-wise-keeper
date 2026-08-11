/**
 * Dentrix ledger parser — OCR word geometry → structured transactions.
 *
 * A dense ledger is NOT a generic text page, so this module does its own row
 * reconstruction instead of reusing the schedule-reader's line clustering:
 *
 *   1. Header geometry — column bands split at the WHITESPACE GAPS between
 *      header words (bbox edges), then money columns are refined from the
 *      observed right-aligned numeric content below the header.
 *   2. Date anchors — a valid date in the DATE band starts a transaction.
 *      Every other word attaches to its NEAREST date baseline, so two dated
 *      rows can never merge no matter how tight the vertical spacing is.
 *      The attach tolerance adapts to the measured baseline pitch and median
 *      word height of THIS image — no hardcoded row tolerance.
 *   3. Shape-aware cells — content that violates a column's expected shape
 *      (prose in TEETH, text in a money band) is evidence of a geometry
 *      error and is reassigned, not kept.
 *   4. Running-balance checksum — displayed balances are structural evidence:
 *      when `charge + payment` disagrees with how the balance actually moved
 *      and exactly one digit-plausible repair exists, the repair is applied
 *      and recorded (original OCR text preserved) instead of being silently
 *      trusted or dumped on the user. Ambiguity flags ONLY the cell involved.
 *
 * HIPAA boundary: input words come from the local Tesseract pipeline and are
 * wiped by the caller immediately after this parse. The rows produced here
 * (including preserved OCR text inside corrections) exist only in React
 * memory for the session.
 */
import type { OcrWord } from '@/lib/schedule-reader/types';
import { groupWordsIntoLines } from '@/lib/schedule-reader/privacy-detector';
import { classifyTransaction } from './classify';
import { parseLedgerAmount, parseLedgerDate } from './money';
import type {
  BalanceDerivedCorrection,
  Cents,
  LedgerRow,
  LedgerVerifyField,
  ParsedLedgerCapture,
} from './types';

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

/** Kept for the schedule-reader tests/tools that import it from here. */
export { groupWordsIntoLines };

// ---------------------------------------------------------------------------
// Geometry + shape helpers
// ---------------------------------------------------------------------------

const yCenterOf = (w: OcrWord): number => (w.bbox.y0 + w.bbox.y1) / 2;
const xCenterOf = (w: OcrWord): number => (w.bbox.x0 + w.bbox.x1) / 2;
const heightOf = (w: OcrWord): number => w.bbox.y1 - w.bbox.y0;

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** "129.00", "-500.00", "(35.50)", "2,000.00", "26" — a money-looking token. */
function isMoneyShaped(text: string): boolean {
  const t = text.trim();
  return /^[($−-]*\d[\d.,]*[)−-]*$/.test(t);
}

/** Decimal-bearing money ("129.00") — used to learn numeric column alignment. */
function isDecimalMoney(text: string): boolean {
  return isMoneyShaped(text) && /\d\.\d{2}(?!\d)/.test(text.trim());
}

/** A token that is only sign/paren/currency glyphs ("-", "(", "$", ")"). */
function isSignToken(text: string): boolean {
  const t = text.trim();
  return t !== '' && /^[()$−-]+$/.test(t);
}

/** 1–32, primary letters A–T, ranges "3-6", lists "12,13", quadrant codes. */
function isToothShaped(text: string): boolean {
  const t = text.trim().replace(/\.$/, '');
  if (t === '') return false;
  if (/^(UL|UR|LL|LR|UA|LA|FM)$/i.test(t)) return true;
  if (!/^[0-9A-Ta-t]{1,2}([,-][0-9A-Ta-t]{1,2})*$/.test(t)) return false;
  return t.split(/[,-]/).every(part => {
    if (/^\d+$/.test(part)) {
      const n = parseInt(part, 10);
      return n >= 1 && n <= 32;
    }
    return /^[A-Ta-t]$/.test(part);
  });
}

const hasLetters = (text: string): boolean => /[A-Za-z]/.test(text);

/**
 * Reading-order join: same-line words left→right, wrapped lines top→bottom —
 * a pure x-sort would interleave a wrapped description into word salad.
 */
function joinWords(words: OcrWord[]): string {
  return [...words]
    .sort((a, b) => {
      const dy = yCenterOf(a) - yCenterOf(b);
      if (Math.abs(dy) > (heightOf(a) + heightOf(b)) / 4) return dy;
      return a.bbox.x0 - b.bbox.x0;
    })
    .map(w => w.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function meanConfidence(words: OcrWord[]): number {
  if (words.length === 0) return 0;
  return Math.min(1, Math.max(0, words.reduce((s, w) => s + w.confidence, 0) / words.length / 100));
}

// ---------------------------------------------------------------------------
// Header detection
// ---------------------------------------------------------------------------

export interface HeaderDetection {
  /** y just below the header labels — rows live under it. */
  bottomY: number;
  columns: ColumnBand[];
  /** The matched header label words (excluded from row reconstruction). */
  headerWords: Set<OcrWord>;
}

/**
 * Find the header labels and derive column bands from their geometry.
 * Requires at least DATE + DESCRIPTION + two money columns to trust it.
 *
 * Bands split at the midpoint of the whitespace GAP between adjacent header
 * words (bounding-box edges) — never between their centers, because a wide
 * centered header like DESCRIPTION would otherwise swallow the left part of
 * its own column into the neighbor.
 */
export function detectHeaderColumns(words: OcrWord[]): HeaderDetection | null {
  interface Candidate {
    key: LedgerColumnKey;
    word: OcrWord;
  }
  const candidates: Candidate[] = [];
  for (const word of words) {
    const clean = word.text.replace(/[^A-Za-z]/g, '');
    const match = HEADER_SYNONYMS.find(h => h.pattern.test(clean));
    if (match) candidates.push({ key: match.key, word });
  }
  if (candidates.length === 0) return null;

  // Group candidates into horizontal lines by y proximity.
  const sorted = [...candidates].sort((a, b) => yCenterOf(a.word) - yCenterOf(b.word));
  const groups: Candidate[][] = [];
  for (const c of sorted) {
    const group = groups[groups.length - 1];
    if (
      group &&
      yCenterOf(c.word) - yCenterOf(group[group.length - 1].word) <
        Math.max(heightOf(c.word), 8) * 1.2
    ) {
      group.push(c);
    } else {
      groups.push([c]);
    }
  }

  for (const group of groups) {
    const byKey = new Map<LedgerColumnKey, OcrWord>();
    for (const c of group) if (!byKey.has(c.key)) byKey.set(c.key, c.word);
    const moneyCount = (['charge', 'payment', 'balance'] as const).filter(k => byKey.has(k)).length;
    if (!byKey.has('date') || !byKey.has('description') || moneyCount < 2) continue;

    const anchors = [...byKey.entries()]
      .map(([key, word]) => ({ key, word }))
      .sort((a, b) => a.word.bbox.x0 - b.word.bbox.x0);
    const columns: ColumnBand[] = anchors.map((a, idx) => ({
      key: a.key,
      xStart:
        idx === 0 ? -Infinity : (anchors[idx - 1].word.bbox.x1 + a.word.bbox.x0) / 2,
      xEnd:
        idx === anchors.length - 1
          ? Infinity
          : (a.word.bbox.x1 + anchors[idx + 1].word.bbox.x0) / 2,
    }));
    return {
      bottomY: Math.max(...anchors.map(a => a.word.bbox.y1)),
      columns,
      headerWords: new Set(anchors.map(a => a.word)),
    };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Row reconstruction (date anchors + adaptive baselines)
// ---------------------------------------------------------------------------

interface MoneyCellDraft {
  /** Raw OCR text of the cell (session memory only — never persisted). */
  text: string;
  cents: Cents | null;
  uncertain: boolean;
  confidence: number;
  present: boolean;
}

interface RowDraft {
  y: number;
  dateText: string;
  dateISO: string | null;
  dateConfidence: number;
  tooth: string;
  description: string;
  patient: string;
  patientConfidence: number;
  charge: MoneyCellDraft;
  payment: MoneyCellDraft;
  balance: MoneyCellDraft;
  words: OcrWord[];
  corrections: BalanceDerivedCorrection[];
  flags: Set<LedgerVerifyField>;
  /** The running-balance math proved this row's money cells. */
  mathProven: boolean;
}

function emptyMoneyCell(): MoneyCellDraft {
  return { text: '', cents: null, uncertain: false, confidence: 1, present: false };
}

const MONEY_KEYS = ['charge', 'payment', 'balance'] as const;
type MoneyKey = (typeof MONEY_KEYS)[number];

/**
 * Learn where each money column's numbers actually right-align by clustering
 * the right edges of decimal-money words below the header. Numeric alignment
 * is far more deterministic than header centers, so these stripes (when
 * found) take precedence for money-cell assignment.
 */
function learnMoneyStripes(
  dataWords: OcrWord[],
  header: HeaderDetection,
  typicalHeight: number
): Map<MoneyKey, number> {
  const moneyBands = header.columns.filter((c): c is ColumnBand & { key: MoneyKey } =>
    (MONEY_KEYS as readonly string[]).includes(c.key)
  );
  if (moneyBands.length === 0) return new Map();
  const regionStart = Math.min(...moneyBands.map(c => c.xStart));

  const rightEdges = dataWords
    .filter(w => isDecimalMoney(w.text) && w.bbox.x1 > regionStart)
    .map(w => w.bbox.x1)
    .sort((a, b) => a - b);

  const clusters: number[][] = [];
  for (const x of rightEdges) {
    const cluster = clusters[clusters.length - 1];
    if (cluster && x - cluster[cluster.length - 1] <= typicalHeight * 1.2) cluster.push(x);
    else clusters.push([x]);
  }

  const stripes = new Map<MoneyKey, { x1: number; size: number }>();
  for (const cluster of clusters) {
    if (cluster.length < 2) continue;
    const mean = cluster.reduce((s, x) => s + x, 0) / cluster.length;
    const band = moneyBands.find(c => mean > c.xStart && mean <= c.xEnd);
    if (!band) continue;
    const existing = stripes.get(band.key);
    if (!existing || cluster.length > existing.size) {
      stripes.set(band.key, { x1: mean, size: cluster.length });
    }
  }
  return new Map([...stripes.entries()].map(([k, v]) => [k, v.x1]));
}

/**
 * Split one reconstructed row's words into typed cells. Column bands give the
 * first guess; content shape corrects geometric misassignment (a description
 * prefix crossing into the TEETH band, a name grazing a money band, …).
 */
function splitRowIntoCells(
  rowWords: OcrWord[],
  header: HeaderDetection,
  stripes: Map<MoneyKey, number>,
  typicalHeight: number,
  y: number
): RowDraft {
  const bandOf = (w: OcrWord): LedgerColumnKey | null => {
    const cx = xCenterOf(w);
    return header.columns.find(c => cx >= c.xStart && cx < c.xEnd)?.key ?? null;
  };
  const moneyBands = header.columns.filter(c =>
    (MONEY_KEYS as readonly string[]).includes(c.key)
  );
  const moneyRegionStart =
    moneyBands.length > 0 ? Math.min(...moneyBands.map(c => c.xStart)) : Infinity;

  const cellWords = new Map<LedgerColumnKey, OcrWord[]>();
  const put = (key: LedgerColumnKey, w: OcrWord) => {
    const list = cellWords.get(key) ?? [];
    list.push(w);
    cellWords.set(key, list);
  };

  // Pass 1 — money-shaped words in the numeric region, assigned by their
  // RIGHT edge (numbers are right-aligned; centers of wide values drift left
  // across band boundaries, right edges do not).
  const rest: OcrWord[] = [];
  const signTokens: OcrWord[] = [];
  for (const w of rowWords) {
    if (isSignToken(w.text)) {
      signTokens.push(w);
      continue;
    }
    if (isMoneyShaped(w.text) && w.bbox.x1 > moneyRegionStart) {
      let key: MoneyKey | null = null;
      let best = Infinity;
      for (const [stripeKey, stripeX1] of stripes) {
        const d = Math.abs(w.bbox.x1 - stripeX1);
        if (d < best && d <= typicalHeight * 1.6) {
          best = d;
          key = stripeKey;
        }
      }
      if (key === null) {
        const band = moneyBands.find(c => w.bbox.x1 > c.xStart && w.bbox.x1 <= c.xEnd);
        key = (band?.key as MoneyKey | undefined) ?? null;
      }
      if (key !== null) {
        put(key, w);
        continue;
      }
    }
    rest.push(w);
  }

  // Sign tokens attach to a horizontally-adjacent money word ("-" "500.00",
  // "(" "35.50" ")"). Orphan sign tokens fall through to text handling.
  for (const s of signTokens) {
    let attached = false;
    for (const key of MONEY_KEYS) {
      for (const m of cellWords.get(key) ?? []) {
        const leftGap = m.bbox.x0 - s.bbox.x1;
        const rightGap = s.bbox.x0 - m.bbox.x1;
        if (
          (leftGap >= -1 && leftGap <= typicalHeight * 1.2) ||
          (rightGap >= -1 && rightGap <= typicalHeight * 1.2)
        ) {
          put(key, s);
          attached = true;
          break;
        }
      }
      if (attached) break;
    }
    if (!attached) rest.push(s);
  }

  // Pass 2 — the text region, shape-checked.
  for (const w of rest) {
    const band = bandOf(w);
    switch (band) {
      case 'date':
        // Row markers and stray punctuation share the date gutter — only
        // digit-bearing tokens belong to the date cell.
        if (/\d/.test(w.text)) put('date', w);
        break;
      case 'tooth':
        if (isToothShaped(w.text)) put('tooth', w);
        else if (parseLedgerDate(w.text) !== null) put('date', w);
        else if (hasLetters(w.text)) put('description', w); // description prefix crossed the band
        else if (/\d/.test(w.text)) put('tooth', w); // odd numeric ("12.13") — still tooth-ish
        // pure punctuation in the tooth gutter: dropped
        break;
      case 'patient':
        put('patient', w);
        break;
      case 'charge':
      case 'payment':
      case 'balance':
        // Text inside a money band is the patient column running long —
        // never invent an amount from it.
        if (hasLetters(w.text)) put('patient', w);
        else if (isMoneyShaped(w.text)) put(band, w);
        break;
      case 'description':
      default:
        put('description', w);
        break;
    }
  }

  const moneyCell = (key: MoneyKey): MoneyCellDraft => {
    const words = cellWords.get(key) ?? [];
    if (words.length === 0) return emptyMoneyCell();
    const text = joinWords(words);
    const parsed = parseLedgerAmount(text);
    return {
      text,
      cents: parsed?.cents ?? null,
      uncertain: parsed?.uncertain ?? false,
      confidence: meanConfidence(words),
      present: true,
    };
  };

  const dateWords = cellWords.get('date') ?? [];
  const dateText = joinWords(dateWords);
  const patientWords = cellWords.get('patient') ?? [];

  return {
    y,
    dateText,
    dateISO: parseLedgerDate(dateText),
    dateConfidence: dateWords.length > 0 ? meanConfidence(dateWords) : 1,
    tooth: joinWords(cellWords.get('tooth') ?? []),
    description: joinWords(cellWords.get('description') ?? []),
    patient: joinWords(patientWords),
    patientConfidence: patientWords.length > 0 ? meanConfidence(patientWords) : 1,
    charge: moneyCell('charge'),
    payment: moneyCell('payment'),
    balance: moneyCell('balance'),
    words: rowWords,
    corrections: [],
    flags: new Set<LedgerVerifyField>(),
    mathProven: false,
  };
}

/**
 * Reconstruct transaction rows from the words below the header.
 *
 * Valid dates in the DATE band are row anchors; every other word joins its
 * NEAREST anchor baseline (adaptive tolerance from the measured pitch), so
 * two dated rows can never merge. Leftover "orphan" lines become standalone
 * undated rows when they carry money, or description continuations attached
 * to the row above when they don't.
 */
function reconstructRows(dataWords: OcrWord[], header: HeaderDetection): RowDraft[] {
  if (dataWords.length === 0) return [];
  const typicalHeight = median(dataWords.map(heightOf).filter(h => h > 0)) || 12;
  const stripes = learnMoneyStripes(dataWords, header, typicalHeight);

  const dateBand = header.columns.find(c => c.key === 'date');
  const anchorSet = new Set<OcrWord>();
  if (dateBand) {
    for (const w of dataWords) {
      const cx = xCenterOf(w);
      if (cx >= dateBand.xStart && cx < dateBand.xEnd && parseLedgerDate(w.text) !== null) {
        anchorSet.add(w);
      }
    }
  }

  // Baselines: one per anchor, merging anchors that share a visual line.
  const anchorWords = [...anchorSet].sort((a, b) => yCenterOf(a) - yCenterOf(b));
  const baselines: Array<{ y: number; words: OcrWord[] }> = [];
  for (const a of anchorWords) {
    const last = baselines[baselines.length - 1];
    if (last && yCenterOf(a) - last.y < typicalHeight * 0.5) last.words.push(a);
    else baselines.push({ y: yCenterOf(a), words: [a] });
  }

  const gaps: number[] = [];
  for (let i = 1; i < baselines.length; i++) gaps.push(baselines[i].y - baselines[i - 1].y);
  const pitch = gaps.length > 0 ? median(gaps) : typicalHeight * 1.4;
  // Nearest-baseline assignment cannot merge rows; the tolerance only decides
  // what is "between rows" (orphan) vs "on a row". Adaptive: just over half
  // the measured pitch, capped for sparse layouts.
  const attachMax =
    baselines.length >= 2
      ? Math.min(pitch * 0.55, typicalHeight * 1.6)
      : typicalHeight * 0.8;

  const perBaseline: OcrWord[][] = baselines.map(b => [...b.words]);
  const orphans: OcrWord[] = [];
  for (const w of dataWords) {
    if (anchorSet.has(w)) continue;
    if (baselines.length === 0) {
      orphans.push(w);
      continue;
    }
    let bestIndex = 0;
    let bestDist = Infinity;
    for (let i = 0; i < baselines.length; i++) {
      const d = Math.abs(yCenterOf(w) - baselines[i].y);
      if (d < bestDist) {
        bestDist = d;
        bestIndex = i;
      }
    }
    if (bestDist <= attachMax) perBaseline[bestIndex].push(w);
    else orphans.push(w);
  }

  // Cluster leftover words into their own visual lines.
  const orphanLines: Array<{ y: number; words: OcrWord[] }> = [];
  for (const w of [...orphans].sort((a, b) => yCenterOf(a) - yCenterOf(b))) {
    const line = orphanLines[orphanLines.length - 1];
    if (line && yCenterOf(w) - line.y < typicalHeight * 0.6) {
      line.words.push(w);
      line.y =
        line.words.reduce((s, x) => s + yCenterOf(x), 0) / line.words.length;
    } else {
      orphanLines.push({ y: yCenterOf(w), words: [w] });
    }
  }

  const drafts: RowDraft[] = baselines.map((b, i) =>
    splitRowIntoCells(perBaseline[i], header, stripes, typicalHeight, b.y)
  );

  const continuations: Array<{ y: number; draft: RowDraft }> = [];
  for (const line of orphanLines) {
    const draft = splitRowIntoCells(line.words, header, stripes, typicalHeight, line.y);
    const hasMoney = draft.charge.present || draft.payment.present || draft.balance.present;
    if (hasMoney || draft.dateISO !== null) {
      drafts.push(draft); // a real transaction whose date OCR failed (or an undated money line)
    } else {
      continuations.push({ y: line.y, draft });
    }
  }
  drafts.sort((a, b) => a.y - b.y);

  // Description continuations attach to the nearest row ABOVE — they may
  // never merge two dated transactions.
  for (const cont of continuations) {
    let target: RowDraft | null = null;
    for (const d of drafts) {
      if (d.y < cont.y) target = d;
      else break;
    }
    if (!target) continue; // stray fragment above the first row
    const continuationText = [cont.draft.description, cont.draft.patient, cont.draft.tooth]
      .filter(Boolean)
      .join(' ')
      .trim();
    if (continuationText !== '') {
      target.description = `${target.description} ${continuationText}`.trim();
    }
  }

  // Drop drafts with no content at all (marker gutter noise etc).
  return drafts.filter(
    d =>
      d.charge.present ||
      d.payment.present ||
      d.balance.present ||
      d.description !== '' ||
      d.tooth !== '' ||
      d.patient !== ''
  );
}

// ---------------------------------------------------------------------------
// Running-balance checksum repair
// ---------------------------------------------------------------------------

/**
 * Could `text` plausibly be an OCR misread of `impliedCents`? True when the
 * digit strings agree up to sign/punctuation loss or a dropped/shifted
 * decimal point ("2,000.00" ↔ $20.00, "500.00" ↔ −$500.00, "119 00" ↔
 * $119.00). Anything looser would be inventing numbers.
 */
export function plausibleMisread(text: string, impliedCents: Cents): boolean {
  const digits = (text.match(/\d/g) ?? []).join('');
  if (digits === '') return false;
  if (impliedCents === 0) return /^0+$/.test(digits);
  const strip = (s: string) => s.replace(/^0+(?=\d)/, '');
  const a = strip(digits);
  const b = strip(String(Math.abs(impliedCents)));
  return a === b || a === `${b}00` || b === `${a}00`;
}

interface RepairCandidate {
  field: MoneyKey;
  cents: Cents;
  /** True when the cell was blank and the delta supplies the only value. */
  fill: boolean;
}

/**
 * Walk the reconstructed rows using the displayed running balance as a
 * checksum. Consistent rows are marked math-proven (no "Please verify" needed
 * regardless of raw word confidence); a uniquely-determined misread is
 * repaired and recorded; ambiguity flags exactly the cells involved.
 */
function repairWithRunningBalance(rows: RowDraft[]): void {
  let prev: Cents | null = null; // trusted balance BEFORE the current row
  let pendingDelta = 0;
  let gapRows: RowDraft[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const delta = (row.charge.cents ?? 0) + (row.payment.cents ?? 0);

    if (row.balance.cents === null) {
      if (row.balance.present) row.flags.add('balance');
      pendingDelta += delta;
      gapRows.push(row);
      continue;
    }

    if (prev === null) {
      // First balance anchor — nothing to check it against yet.
      prev = row.balance.cents;
      pendingDelta = 0;
      gapRows = [];
      continue;
    }

    const target = row.balance.cents - prev;

    if (gapRows.length > 0) {
      // Rows without readable balances sit between anchors: verify the whole
      // span, but a mismatch cannot be localized — flag, don't guess.
      if (pendingDelta + delta === target) {
        for (const r of gapRows) r.mathProven = true;
        row.mathProven = true;
      } else {
        for (const r of [...gapRows, row]) flagUnprovenMoney(r);
      }
      prev = row.balance.cents;
      pendingDelta = 0;
      gapRows = [];
      continue;
    }

    if (delta === target) {
      row.mathProven = true;
      prev = row.balance.cents;
      continue;
    }

    // Inconsistent row — enumerate single-cell repairs.
    const charge = row.charge.cents ?? 0;
    const payment = row.payment.cents ?? 0;
    const candidates: RepairCandidate[] = [];

    if (row.payment.present) {
      const implied = target - charge;
      if (implied !== row.payment.cents && plausibleMisread(row.payment.text, implied)) {
        candidates.push({ field: 'payment', cents: implied, fill: false });
      }
    }

    if (row.charge.present) {
      const implied = target - payment;
      // Charges are never negative in Dentrix — a negative "repair" would be
      // a payment in the wrong column, which is not ours to invent.
      if (
        implied >= 0 &&
        implied !== row.charge.cents &&
        plausibleMisread(row.charge.text, implied)
      ) {
        candidates.push({ field: 'charge', cents: implied, fill: false });
      }
    }

    // Fill a completely unread money value ONLY when no cell was read at all:
    // the two balances prove money moved, and the sign decides the column.
    // (With one cell present but wrong, filling the other would invent a
    // phantom transaction — that stays a flag, never a guess.)
    if (!row.charge.present && !row.payment.present && target !== 0) {
      candidates.push({
        field: target > 0 ? 'charge' : 'payment',
        cents: target,
        fill: true,
      });
    }

    // Balance-cell repair: this row's own money agrees with the chain when
    // the NEXT row confirms it (or the digits say the balance was the typo).
    const expected = prev + charge + payment;
    if (expected !== row.balance.cents) {
      const next = rows[i + 1];
      const forwardConfirms =
        next !== undefined &&
        next.balance.cents !== null &&
        next.balance.cents === expected + (next.charge.cents ?? 0) + (next.payment.cents ?? 0);
      if (forwardConfirms || plausibleMisread(row.balance.text, expected)) {
        candidates.push({ field: 'balance', cents: expected, fill: false });
      }
    }

    // Dedupe candidates that describe the same outcome.
    const unique = candidates.filter(
      (c, idx) =>
        candidates.findIndex(o => o.field === c.field && o.cents === c.cents) === idx
    );

    if (unique.length === 1) {
      const fix = unique[0];
      const cell = row[fix.field];
      row.corrections.push({
        field: fix.field,
        ocrText: cell.text,
        ocrCents: cell.present ? cell.cents : null,
        correctedCents: fix.cents,
      });
      cell.cents = fix.cents;
      cell.uncertain = false;
      cell.present = true;
      if (fix.fill) {
        // The math supplied a value OCR never saw — targeted confirm.
        row.flags.add(fix.field);
      } else {
        row.mathProven = true;
      }
      prev = row.balance.cents;
      continue;
    }

    if (unique.length > 1) {
      for (const c of unique) row.flags.add(c.field);
    } else {
      flagUnprovenMoney(row);
    }
    // Resync on the displayed balance so ONE bad row doesn't cascade.
    prev = row.balance.cents;
  }
}

/** Flag the money cells that exist but could not be proven or repaired. */
function flagUnprovenMoney(row: RowDraft): void {
  let flagged = false;
  for (const key of MONEY_KEYS) {
    if (row[key].present) {
      row.flags.add(key);
      flagged = true;
    }
  }
  if (!flagged) row.flags.add('balance');
}

// ---------------------------------------------------------------------------
// Public parse
// ---------------------------------------------------------------------------

let rowCounter = 0;
/** Unique in-memory row id — never persisted anywhere. */
export function nextRowId(): string {
  rowCounter += 1;
  return `abx-row-${rowCounter}`;
}

/** OCR word confidence below this marks an UNPROVEN field "Please verify". */
const VERIFY_THRESHOLD = 0.6;

/**
 * Parse the OCR words of one ledger crop into transactions.
 * The caller wipes `words` immediately after this returns.
 */
export function parseLedgerWords(words: OcrWord[], captureId: string): ParsedLedgerCapture {
  const header = detectHeaderColumns(words);
  if (!header) {
    return { captureId, rows: [], headerFound: false, meanConfidence: meanConfidence(words) };
  }

  const dataWords = words.filter(
    w => !header.headerWords.has(w) && w.text.trim() !== '' && yCenterOf(w) > header.bottomY
  );

  const drafts = reconstructRows(dataWords, header);
  repairWithRunningBalance(drafts);

  const rows: LedgerRow[] = [];
  let sequence = 0;
  let prevDateISO = '';
  for (const draft of drafts) {
    const flags = draft.flags;

    // Date review is structural, not confidence-cosmetic: flag only when the
    // text refuses to parse, a money row has no date at all, or a parsed
    // date breaks the ledger's chronological order.
    const hasMoney = draft.charge.present || draft.payment.present || draft.balance.present;
    if (draft.dateText !== '' && draft.dateISO === null) flags.add('date');
    if (draft.dateText === '' && draft.dateISO === null && hasMoney) flags.add('date');
    if (draft.dateISO !== null && prevDateISO !== '' && draft.dateISO < prevDateISO) {
      flags.add('date');
    }
    if (draft.dateISO !== null) prevDateISO = draft.dateISO;

    // Money review is needed only where neither parsing nor the ledger's own
    // checksum could establish the value.
    if (!draft.mathProven) {
      for (const key of MONEY_KEYS) {
        const cell = draft[key];
        if (!cell.present) continue;
        if (cell.cents === null || cell.uncertain || cell.confidence < VERIFY_THRESHOLD) {
          flags.add(key);
        }
      }
    }

    const classified = classifyTransaction({
      rawDescription: draft.description,
      tooth: draft.tooth,
      chargeCents: draft.charge.cents,
      paymentCents: draft.payment.cents,
    });

    rows.push({
      id: nextRowId(),
      sourceCaptureId: captureId,
      sourceSequence: sequence,
      dateISO: draft.dateISO ?? '',
      tooth: draft.tooth,
      rawDescription: draft.description,
      patientName: draft.patient,
      chargeCents: draft.charge.cents,
      paymentCents: draft.payment.cents,
      balanceCents: draft.balance.cents,
      ocrConfidence: meanConfidence(draft.words),
      patientNameConfidence: draft.patient !== '' ? draft.patientConfidence : undefined,
      corrections: draft.corrections.length > 0 ? draft.corrections : undefined,
      lowConfidenceFields: [...flags],
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
  /** Genuinely distinct patient names — screenshots may span accounts. */
  conflict: boolean;
  /**
   * Rows whose patient cell looks like an OCR artifact of the dominant name
   * (single garbled/low-confidence outlier) — flagged for a targeted look
   * instead of being treated as proof of a second account.
   */
  outlierRowIds: string[];
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, ' ').trim().toLowerCase();
}

/** Small bounded Levenshtein distance (early-exits above `max`). */
function editDistanceAtMost(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array<number>(b.length + 1);
  const curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= b.length; j++) {
      curr[j] = Math.min(
        prev[j] + 1,
        curr[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
      rowMin = Math.min(rowMin, curr[j]);
    }
    if (rowMin > max) return max + 1;
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }
  return prev[b.length];
}

/** One name's tokens all appear inside the other's token list. */
function tokenSubset(a: string, b: string): boolean {
  const ta = a.split(' ');
  const tb = new Set(b.split(' '));
  return ta.every(t => tb.has(t)) || b.split(' ').every(t => new Set(ta).has(t));
}

/** Confidence below which a lone divergent patient cell reads as OCR noise. */
const PATIENT_OUTLIER_CONFIDENCE = 0.75;

/**
 * Infer the patient name AFTER row reconstruction. One normalized name →
 * that name. Multiple names: a single low-confidence/garbled outlier next to
 * a clearly dominant name is an OCR artifact (identified for review, not a
 * conflict); genuinely distinct or repeated second names hard-stop upstream.
 */
export function inferPatientName(rows: LedgerRow[]): PatientNameInference {
  interface NameStat {
    display: string;
    count: number;
    maxConfidence: number;
    rowIds: string[];
  }
  const byNormalized = new Map<string, NameStat>();
  for (const row of rows) {
    const norm = normalizeName(row.patientName);
    if (norm === '') continue;
    const stat = byNormalized.get(norm) ?? {
      display: row.patientName.replace(/\s+/g, ' ').trim(),
      count: 0,
      maxConfidence: 0,
      rowIds: [],
    };
    stat.count += 1;
    stat.maxConfidence = Math.max(stat.maxConfidence, row.patientNameConfidence ?? 1);
    stat.rowIds.push(row.id);
    byNormalized.set(norm, stat);
  }

  const entries = [...byNormalized.entries()];
  if (entries.length === 0) {
    return { name: '', distinctNames: [], conflict: false, outlierRowIds: [] };
  }
  const distinctNames = entries.map(([, s]) => s.display);
  if (entries.length === 1) {
    return { name: entries[0][1].display, distinctNames, conflict: false, outlierRowIds: [] };
  }

  entries.sort((a, b) => b[1].count - a[1].count);
  const [dominantNorm, dominant] = entries[0];
  const runnerUp = entries[1][1];
  if (dominant.count === runnerUp.count) {
    // No clearly dominant name — treat as a real conflict.
    return { name: '', distinctNames, conflict: true, outlierRowIds: [] };
  }

  const outlierRowIds: string[] = [];
  for (const [norm, stat] of entries.slice(1)) {
    const artifact =
      stat.count === 1 &&
      (stat.maxConfidence < PATIENT_OUTLIER_CONFIDENCE ||
        editDistanceAtMost(norm, dominantNorm, 2) <= 2 ||
        tokenSubset(norm, dominantNorm));
    if (!artifact) {
      return { name: '', distinctNames, conflict: true, outlierRowIds: [] };
    }
    outlierRowIds.push(...stat.rowIds);
  }

  return { name: dominant.display, distinctNames, conflict: false, outlierRowIds };
}
