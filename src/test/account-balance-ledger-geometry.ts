/**
 * Synthetic dense-ledger OCR GEOMETRY fixture.
 *
 * COMPLETELY SYNTHETIC AND DE-IDENTIFIED — no real patient, screenshot,
 * name, date, or amount from any real ledger. It reproduces the geometry
 * that broke the original parser on a real, very compact Dentrix capture:
 *
 *   · 33 densely spaced transaction rows (pitch ≈ 1.3× word height) under a
 *     tight header, starting with a balance-forward row
 *   · several words with inflated OCR bounding boxes whose 0.6-word-height
 *     tolerance would have merged adjacent rows in the old generic grouper
 *   · a centered DESCRIPTION header so the first description word's center
 *     falls left of naive header-derived boundaries (the "Bitev in TEETH" bug)
 *   · row-marker glyphs ("*") in the date gutter
 *   · right-aligned CHARGE / PAYMENT / BALANCE numerals
 *   · real tooth numbers mixed with blank tooth cells, long descriptions,
 *     multiple same-day transactions, charges, negative payments, courtesy
 *     credits, and a description continuation line
 *   · a payment printed −$541.00 that OCR read as "541.00" (sign lost)
 *   · a −$20.00 credit that OCR read as "2,000.00" (sign + decimal lost),
 *     with running balances that prove the true movement
 *
 * The synthetic patient is "SAMPLE" on every transaction row and the ledger
 * ends at exactly $266.00.
 */
import type { OcrWord } from '@/lib/schedule-reader/types';

export const ENDING_BALANCE_CENTS = 26600;

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const HEADER_Y = 12;
const ROW_START_Y = 34;
const PITCH = 17; // dense: barely 1.3× the 13px word height
const WORD_H = 13;
const TALL_H = 29; // inflated bbox — 0.6×29 > PITCH would merge rows in the old grouper
const CHAR_W = 9;
const DESC_CHAR_W = 8;
const DESC_GAP = 5;

const X = {
  marker: 6,
  date: 22,
  tooth: 128,
  desc: 168,
  patient: 470,
  chargeRight: 620,
  paymentRight: 712,
  balanceRight: 806,
};

function word(
  text: string,
  x0: number,
  y: number,
  opts: { confidence?: number; h?: number; charW?: number } = {}
): OcrWord {
  const h = opts.h ?? WORD_H;
  const yCenter = y + WORD_H / 2;
  return {
    text,
    bbox: {
      x0,
      y0: yCenter - h / 2,
      x1: x0 + text.length * (opts.charW ?? CHAR_W),
      y1: yCenter + h / 2,
    },
    confidence: opts.confidence ?? 92,
  };
}

/** Right-aligned money numeral (column numerals share a right edge). */
function moneyWord(text: string, rightX: number, y: number, confidence = 92): OcrWord {
  return word(text, rightX - text.length * CHAR_W, y, { confidence });
}

export function denseHeaderWords(): OcrWord[] {
  return [
    word('DATE', X.date, HEADER_Y),
    word('TEETH', 118, HEADER_Y),
    // Centered over its wide column — its left edge sits RIGHT of where
    // description text begins, the trap the old midpoint bands fell into.
    word('DESCRIPTION', 250, HEADER_Y),
    word('PATIENT', X.patient, HEADER_Y),
    moneyWord('CHARGE', X.chargeRight, HEADER_Y),
    moneyWord('PAYMENT', X.paymentRight, HEADER_Y),
    moneyWord('BALANCE', X.balanceRight, HEADER_Y),
  ];
}

// ---------------------------------------------------------------------------
// Row specs — OCR text as "read", expectations as the ledger's truth
// ---------------------------------------------------------------------------

export interface SynLedgerRowSpec {
  date: string;
  tooth?: string;
  desc: string;
  /** Omit for the balance-forward row (Dentrix leaves it blank there). */
  patient?: string;
  charge?: string;
  /** OCR text of the payment cell; token array = OCR split the value. */
  payment?: string | string[];
  balance: string;
  /** Give this row's PATIENT word an inflated bbox (old-grouper bait). */
  tallPatient?: boolean;
  /** Word confidence override for the whole row (0–100). */
  confidence?: number;
  /** Confidence override for the payment word only. */
  paymentConfidence?: number;
  /** A dateless, moneyless wrapped line under this row. */
  continuation?: string;
  expected: {
    dateISO: string;
    tooth: string;
    chargeCents: number | null;
    paymentCents: number | null;
    balanceCents: number;
    /** Field the running-balance checksum must repair, if any. */
    correctedField?: 'charge' | 'payment' | 'balance';
  };
}

export const SYN_LEDGER_ROWS: SynLedgerRowSpec[] = [
  {
    date: '03/01/2030', desc: 'Patient Balance Forward', balance: '0.00',
    expected: { dateISO: '2030-03-01', tooth: '', chargeCents: null, paymentCents: null, balanceCents: 0 },
  },
  {
    date: '03/05/2030', desc: 'Periodic oral evaluation', patient: 'SAMPLE', charge: '72.00', balance: '72.00',
    expected: { dateISO: '2030-03-05', tooth: '', chargeCents: 7200, paymentCents: null, balanceCents: 7200 },
  },
  {
    date: '03/05/2030', desc: 'Bitewing Four Image', patient: 'SAMPLE', charge: '91.00', balance: '163.00', tallPatient: true,
    expected: { dateISO: '2030-03-05', tooth: '', chargeCents: 9100, paymentCents: null, balanceCents: 16300 },
  },
  {
    date: '03/05/2030', desc: 'Intraoral-periapical each addl', patient: 'SAMPLE', charge: '41.00', balance: '204.00', tallPatient: true,
    expected: { dateISO: '2030-03-05', tooth: '', chargeCents: 4100, paymentCents: null, balanceCents: 20400 },
  },
  {
    date: '03/05/2030', desc: 'Intraoral Periapical Images', patient: 'SAMPLE', charge: '52.00', balance: '256.00',
    expected: { dateISO: '2030-03-05', tooth: '', chargeCents: 5200, paymentCents: null, balanceCents: 25600 },
  },
  {
    date: '03/05/2030', desc: 'Prophylaxis-adult', patient: 'SAMPLE', charge: '137.00', balance: '393.00',
    expected: { dateISO: '2030-03-05', tooth: '', chargeCents: 13700, paymentCents: null, balanceCents: 39300 },
  },
  {
    // Printed −$541.00; OCR lost the minus. The balances prove the sign.
    date: '03/12/2030', desc: 'VISA/MC Card Payment', patient: 'SAMPLE', payment: '541.00', balance: '-148.00',
    expected: { dateISO: '2030-03-12', tooth: '', chargeCents: null, paymentCents: -54100, balanceCents: -14800, correctedField: 'payment' },
  },
  {
    date: '03/12/2030', desc: 'Courtesy Credit', patient: 'SAMPLE', payment: '-38.50', balance: '-186.50',
    expected: { dateISO: '2030-03-12', tooth: '', chargeCents: null, paymentCents: -3850, balanceCents: -18650 },
  },
  {
    // Printed −$20.00; OCR read "2,000.00". The balances move by exactly −$20.
    date: '03/12/2030', desc: 'Courtesy Credit', patient: 'SAMPLE', payment: '2,000.00', balance: '-206.50', paymentConfidence: 88,
    expected: { dateISO: '2030-03-12', tooth: '', chargeCents: null, paymentCents: -2000, balanceCents: -20650, correctedField: 'payment' },
  },
  {
    date: '03/20/2030', tooth: '4', desc: 'Resin composite-2s, posterior', patient: 'SAMPLE', charge: '349.00', balance: '142.50',
    expected: { dateISO: '2030-03-20', tooth: '4', chargeCents: 34900, paymentCents: null, balanceCents: 14250 },
  },
  {
    date: '03/20/2030', tooth: '9', desc: 'Resin-three surfaces, anterior', patient: 'SAMPLE', charge: '351.00', balance: '493.50',
    expected: { dateISO: '2030-03-20', tooth: '9', chargeCents: 35100, paymentCents: null, balanceCents: 49350 },
  },
  {
    date: '03/20/2030', tooth: '12', desc: 'Resin composite-1s, posterior', patient: 'SAMPLE', charge: '248.00', balance: '741.50',
    expected: { dateISO: '2030-03-20', tooth: '12', chargeCents: 24800, paymentCents: null, balanceCents: 74150 },
  },
  {
    date: '03/20/2030', tooth: '20', desc: 'Restoration Adjust Overhang', patient: 'SAMPLE', charge: '0.00', balance: '741.50',
    continuation: 'DUE TO FRACTURE',
    expected: { dateISO: '2030-03-20', tooth: '20', chargeCents: 0, paymentCents: null, balanceCents: 74150 },
  },
  {
    date: '04/01/2030', desc: 'Dental Ins Payment - Acme', patient: 'SAMPLE', payment: '-374.00', balance: '367.50',
    expected: { dateISO: '2030-04-01', tooth: '', chargeCents: null, paymentCents: -37400, balanceCents: 36750 },
  },
  {
    date: '04/05/2030', desc: 'Dental Ins Payment - Acme', patient: 'SAMPLE', payment: '-86.00', balance: '281.50', confidence: 55,
    expected: { dateISO: '2030-04-05', tooth: '', chargeCents: null, paymentCents: -8600, balanceCents: 28150 },
  },
  {
    date: '04/09/2030', desc: 'Dental Ins Payment - Acme', patient: 'SAMPLE', payment: '-63.00', balance: '218.50', confidence: 55,
    expected: { dateISO: '2030-04-09', tooth: '', chargeCents: null, paymentCents: -6300, balanceCents: 21850 },
  },
  {
    date: '04/18/2030', desc: 'Cash Payment - Thank You', patient: 'SAMPLE', payment: '-79.00', balance: '139.50',
    expected: { dateISO: '2030-04-18', tooth: '', chargeCents: null, paymentCents: -7900, balanceCents: 13950 },
  },
  {
    date: '04/20/2030', desc: 'In-Office Provider Payment Adj', patient: 'SAMPLE', payment: '-8.50', balance: '131.00',
    expected: { dateISO: '2030-04-20', tooth: '', chargeCents: null, paymentCents: -850, balanceCents: 13100 },
  },
  {
    date: '04/20/2030', desc: 'In-Office Provider Payment Adj', patient: 'SAMPLE', payment: '-16.50', balance: '114.50',
    expected: { dateISO: '2030-04-20', tooth: '', chargeCents: null, paymentCents: -1650, balanceCents: 11450 },
  },
  {
    date: '04/20/2030', desc: 'In-Office Provider Prod Adj', patient: 'SAMPLE', charge: '15.00', balance: '129.50',
    expected: { dateISO: '2030-04-20', tooth: '', chargeCents: 1500, paymentCents: null, balanceCents: 12950 },
  },
  {
    date: '04/22/2030', desc: 'Cash Payment - Thank You', patient: 'SAMPLE', payment: '-87.50', balance: '42.00',
    expected: { dateISO: '2030-04-22', tooth: '', chargeCents: null, paymentCents: -8750, balanceCents: 4200 },
  },
  {
    date: '05/02/2030', desc: 'Adjunctive pre-diagnostic test', patient: 'SAMPLE', charge: '54.00', balance: '96.00', tallPatient: true,
    expected: { dateISO: '2030-05-02', tooth: '', chargeCents: 5400, paymentCents: null, balanceCents: 9600 },
  },
  {
    date: '05/02/2030', desc: 'Periodic oral evaluation', patient: 'SAMPLE', charge: '72.00', balance: '168.00', tallPatient: true,
    expected: { dateISO: '2030-05-02', tooth: '', chargeCents: 7200, paymentCents: null, balanceCents: 16800 },
  },
  {
    date: '05/02/2030', desc: 'Prophylaxis-adult', patient: 'SAMPLE', charge: '137.00', balance: '305.00',
    expected: { dateISO: '2030-05-02', tooth: '', chargeCents: 13700, paymentCents: null, balanceCents: 30500 },
  },
  {
    // OCR split the minus off the numeral — the tokens must reunite.
    date: '05/10/2030', desc: 'Dental Ins Payment - Acme', patient: 'SAMPLE', payment: ['-', '118.50'], balance: '186.50',
    expected: { dateISO: '2030-05-10', tooth: '', chargeCents: null, paymentCents: -11850, balanceCents: 18650 },
  },
  {
    date: '05/15/2030', desc: 'In-Office Provider Payment Adj', patient: 'SAMPLE', payment: '-29.00', balance: '157.50',
    expected: { dateISO: '2030-05-15', tooth: '', chargeCents: null, paymentCents: -2900, balanceCents: 15750 },
  },
  {
    date: '05/20/2030', desc: 'Periodic oral evaluation', patient: 'SAMPLE', charge: '31.00', balance: '188.50',
    expected: { dateISO: '2030-05-20', tooth: '', chargeCents: 3100, paymentCents: null, balanceCents: 18850 },
  },
  {
    date: '05/20/2030', desc: 'Periodic oral evaluation', patient: 'SAMPLE', charge: '72.00', balance: '260.50',
    expected: { dateISO: '2030-05-20', tooth: '', chargeCents: 7200, paymentCents: null, balanceCents: 26050 },
  },
  {
    date: '05/22/2030', desc: 'Bitewing Four Image', patient: 'SAMPLE', charge: '91.00', balance: '351.50',
    expected: { dateISO: '2030-05-22', tooth: '', chargeCents: 9100, paymentCents: null, balanceCents: 35150 },
  },
  {
    date: '05/22/2030', desc: 'Prophylaxis-adult', patient: 'SAMPLE', charge: '137.00', balance: '488.50',
    expected: { dateISO: '2030-05-22', tooth: '', chargeCents: 13700, paymentCents: null, balanceCents: 48850 },
  },
  {
    date: '06/01/2030', tooth: '20', desc: 'Caries arresting meds-per tooth', patient: 'SAMPLE', charge: '118.00', balance: '606.50',
    expected: { dateISO: '2030-06-01', tooth: '20', chargeCents: 11800, paymentCents: null, balanceCents: 60650 },
  },
  {
    date: '06/05/2030', desc: 'Dental Ins Payment - Acme', patient: 'SAMPLE', payment: '-134.00', balance: '472.50',
    expected: { dateISO: '2030-06-05', tooth: '', chargeCents: null, paymentCents: -13400, balanceCents: 47250 },
  },
  {
    date: '06/10/2030', desc: 'Cash Payment - Thank You', patient: 'SAMPLE', payment: '-206.50', balance: '266.00',
    expected: { dateISO: '2030-06-10', tooth: '', chargeCents: null, paymentCents: -20650, balanceCents: ENDING_BALANCE_CENTS },
  },
];

/** Build the OcrWord[] for the full synthetic dense capture. */
export function buildDenseLedgerWords(): OcrWord[] {
  const words: OcrWord[] = [...denseHeaderWords()];
  let line = 0;
  for (const spec of SYN_LEDGER_ROWS) {
    const y = ROW_START_Y + line * PITCH;
    const conf = spec.confidence ?? 92;

    words.push(word('*', X.marker, y, { confidence: 70 })); // row marker in the date gutter
    words.push(word(spec.date, X.date, y, { confidence: conf }));
    if (spec.tooth) words.push(word(spec.tooth, X.tooth, y, { confidence: conf }));

    let dx = X.desc;
    for (const token of spec.desc.split(' ')) {
      words.push(word(token, dx, y, { confidence: conf, charW: DESC_CHAR_W }));
      dx += token.length * DESC_CHAR_W + DESC_GAP;
    }

    if (spec.patient) {
      words.push(
        word(spec.patient, X.patient, y, {
          confidence: conf,
          h: spec.tallPatient ? TALL_H : WORD_H,
        })
      );
    }

    if (spec.charge) words.push(moneyWord(spec.charge, X.chargeRight, y, conf));
    if (spec.payment) {
      const tokens = Array.isArray(spec.payment) ? spec.payment : [spec.payment];
      // Lay tokens right-to-left so the numeral right-aligns at the column.
      let right = X.paymentRight;
      for (const token of [...tokens].reverse()) {
        const w = word(token, right - token.length * CHAR_W, y, {
          confidence: spec.paymentConfidence ?? conf,
        });
        words.push(w);
        right = w.bbox.x0 - 6;
      }
    }
    words.push(moneyWord(spec.balance, X.balanceRight, y, conf));

    line += 1;
    if (spec.continuation) {
      const cy = ROW_START_Y + line * PITCH;
      let cx = X.desc;
      for (const token of spec.continuation.split(' ')) {
        words.push(word(token, cx, cy, { confidence: conf, charW: DESC_CHAR_W }));
        cx += token.length * DESC_CHAR_W + DESC_GAP;
      }
      line += 1;
    }
  }
  return words;
}
