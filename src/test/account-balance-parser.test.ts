/** Ledger parser: geometry-based columns, overlap dedupe, name inference. */
import { describe, it, expect } from 'vitest';
import {
  detectHeaderColumns,
  groupWordsIntoLines,
  inferPatientName,
  mergeCaptureRows,
  parseLedgerWords,
  rowFingerprint,
} from '@/lib/account-balance/parser';
import type { OcrWord } from '@/lib/schedule-reader/types';
import { goldenRows, makeRow } from './account-balance-fixture';

/** Synthetic OCR word at a grid position. */
function word(text: string, x: number, y: number, confidence = 95): OcrWord {
  return {
    text,
    bbox: { x0: x, y0: y, x1: x + Math.max(20, text.length * 9), y1: y + 14 },
    confidence,
  };
}

/** Column x anchors used across the synthetic screenshots. */
const X = { date: 10, tooth: 110, desc: 170, patient: 430, charge: 560, payment: 650, balance: 750 };

function headerWords(y = 10): OcrWord[] {
  return [
    word('DATE', X.date, y),
    word('TEETH', X.tooth, y),
    word('DESCRIPTION', X.desc, y),
    word('PATIENT', X.patient, y),
    word('CHARGE', X.charge, y),
    word('PAYMENT', X.payment, y),
    word('BALANCE', X.balance, y),
  ];
}

interface RowSpec {
  date?: string;
  tooth?: string;
  desc?: string[];
  patient?: string;
  charge?: string;
  payment?: string;
  balance?: string;
  confidence?: number;
}

function rowWords(spec: RowSpec, y: number): OcrWord[] {
  const words: OcrWord[] = [];
  const c = spec.confidence ?? 95;
  if (spec.date) words.push(word(spec.date, X.date, y, c));
  if (spec.tooth) words.push(word(spec.tooth, X.tooth, y, c));
  (spec.desc ?? []).forEach((t, i) => words.push(word(t, X.desc + i * 62, y, c)));
  if (spec.patient) words.push(word(spec.patient, X.patient, y, c));
  if (spec.charge) words.push(word(spec.charge, X.charge, y, c));
  if (spec.payment) words.push(word(spec.payment, X.payment, y, c));
  if (spec.balance) words.push(word(spec.balance, X.balance, y, c));
  return words;
}

function screenshot(rows: RowSpec[]): OcrWord[] {
  const words = [...headerWords()];
  rows.forEach((r, i) => words.push(...rowWords(r, 40 + i * 24)));
  return words;
}

describe('detectHeaderColumns', () => {
  it('locates header columns from word geometry', () => {
    const lines = groupWordsIntoLines(headerWords());
    const header = detectHeaderColumns(lines);
    expect(header).not.toBeNull();
    expect(header!.columns.map(col => col.key)).toEqual([
      'date', 'tooth', 'description', 'patient', 'charge', 'payment', 'balance',
    ]);
  });

  it('returns null without a trustworthy header', () => {
    const lines = groupWordsIntoLines([word('Random', 10, 10), word('Text', 100, 10)]);
    expect(detectHeaderColumns(lines)).toBeNull();
  });
});

describe('parseLedgerWords', () => {
  it('reconstructs rows by horizontal position, not text order', () => {
    const words = screenshot([
      { date: '02/12/2026', desc: ['Periodic', 'oral', 'evaluation'], patient: 'Taylor', charge: '65.00', balance: '65.00' },
      { date: '06/10/2026', tooth: '29', desc: ['Resin-Three', 'surfaces,', 'posterior'], patient: 'Taylor', charge: '395.00', balance: '460.00' },
      { date: '06/10/2026', desc: ['VISA', 'Payment'], patient: 'Taylor', payment: '-119.00', balance: '341.00' },
    ]);
    const { rows, headerFound } = parseLedgerWords(words, 'cap-1');
    expect(headerFound).toBe(true);
    expect(rows).toHaveLength(3);

    expect(rows[0].dateISO).toBe('2026-02-12');
    expect(rows[0].rawDescription).toBe('Periodic oral evaluation');
    expect(rows[0].chargeCents).toBe(6500);
    expect(rows[0].paymentCents).toBeNull();
    expect(rows[0].classification).toBe('TREATMENT_CHARGE');

    expect(rows[1].tooth).toBe('29');
    expect(rows[1].chargeCents).toBe(39500);

    expect(rows[2].paymentCents).toBe(-11900);
    expect(rows[2].balanceCents).toBe(34100);
    expect(rows[2].classification).toBe('PATIENT_PAYMENT');
  });

  it('flags low-confidence money cells for verification instead of fixing them', () => {
    const words = screenshot([
      { date: '02/12/2026', desc: ['Prophylaxis-adult'], charge: '129.00', balance: '129.00', confidence: 40 },
    ]);
    const { rows } = parseLedgerWords(words, 'cap-1');
    expect(rows[0].lowConfidenceFields).toContain('charge');
    expect(rows[0].lowConfidenceFields).toContain('balance');
    expect(rows[0].staffVerified).toBe(false);
  });

  it('appends dateless money-less lines to the previous description', () => {
    const words = screenshot([
      { date: '07/15/2026', desc: ['PT', 'RESCHEDULED'], balance: '639.00' },
      { desc: ['DUE', 'TO', 'OFFICE'] },
    ]);
    const { rows } = parseLedgerWords(words, 'cap-1');
    expect(rows).toHaveLength(1);
    expect(rows[0].rawDescription).toBe('PT RESCHEDULED DUE TO OFFICE');
  });
});

describe('mergeCaptureRows — screenshot-boundary overlap only', () => {
  it('removes a convincing suffix/prefix sequence overlap', () => {
    const words1 = screenshot([
      { date: '02/12/2026', desc: ['Periodic', 'oral', 'evaluation'], charge: '65.00', balance: '65.00' },
      { date: '02/12/2026', desc: ['Prophylaxis-adult'], charge: '129.00', balance: '194.00' },
      { date: '02/12/2026', desc: ['Bitewing', 'Four', 'Image'], charge: '85.00', balance: '279.00' },
      { date: '02/12/2026', desc: ['Intraoral-periapical', 'first', 'image'], charge: '47.00', balance: '326.00' },
    ]);
    // Screenshot 2 repeats the final 4 rows of screenshot 1, then continues.
    const words2 = screenshot([
      { date: '02/12/2026', desc: ['Periodic', 'oral', 'evaluation'], charge: '65.00', balance: '65.00' },
      { date: '02/12/2026', desc: ['Prophylaxis-adult'], charge: '129.00', balance: '194.00' },
      { date: '02/12/2026', desc: ['Bitewing', 'Four', 'Image'], charge: '85.00', balance: '279.00' },
      { date: '02/12/2026', desc: ['Intraoral-periapical', 'first', 'image'], charge: '47.00', balance: '326.00' },
      { date: '06/10/2026', desc: ['VISA', 'Payment'], payment: '-119.00', balance: '207.00' },
    ]);
    const cap1 = parseLedgerWords(words1, 'cap-1');
    const cap2 = parseLedgerWords(words2, 'cap-2');
    const { merged, overlapRemoved } = mergeCaptureRows(cap1.rows, cap2.rows);
    expect(overlapRemoved).toBe(4);
    expect(merged).toHaveLength(5);
    expect(merged[4].rawDescription).toBe('VISA Payment');
  });

  it('NEVER globally collapses legitimate identical transactions', () => {
    // Two intentionally identical $0.00 insurance postings inside ONE capture,
    // away from any screenshot boundary.
    const rows = goldenRows();
    const a = rows.find(r => r.id === 'ins0a')!;
    const b = rows.find(r => r.id === 'ins0b')!;
    expect(rowFingerprint(a)).toBe(rowFingerprint(b));

    // Splitting the golden ledger between the two postings must keep both:
    // the 1-row "overlap" is not convincing, and nothing else matches.
    const first = rows.slice(0, 16); // …through ins0a
    const second = rows.slice(16); // ins0b, note
    expect(first[first.length - 1].id).toBe('ins0a');
    expect(second[0].id).toBe('ins0b');
    const { merged, overlapRemoved } = mergeCaptureRows(first, second);
    expect(overlapRemoved).toBe(0);
    expect(merged).toHaveLength(rows.length);
    expect(merged.filter(r => r.rawDescription === 'Dental Ins Payment - Altus')).toHaveLength(2);
  });

  it('deduplicates a real overlap that ENDS with the twin $0 rows', () => {
    const rows = goldenRows();
    // Capture 1 ends with [ins0a, ins0b]; capture 2 re-shows both then the note.
    const first = rows.slice(0, 17);
    const second = rows.slice(15); // ins0a, ins0b, note
    const { merged, overlapRemoved } = mergeCaptureRows(first, second);
    expect(overlapRemoved).toBe(2);
    expect(merged).toHaveLength(rows.length);
    expect(merged.filter(r => r.rawDescription === 'Dental Ins Payment - Altus')).toHaveLength(2);
  });
});

describe('inferPatientName', () => {
  it('infers the single consistent name, normalizing spacing/case', () => {
    const rows = [
      makeRow({ id: 'a', patientName: 'Taylor Sample' }),
      makeRow({ id: 'b', patientName: ' taylor  sample ' }),
      makeRow({ id: 'c', patientName: '' }),
    ];
    const inferred = inferPatientName(rows);
    expect(inferred.conflict).toBe(false);
    expect(inferred.name).toBe('Taylor Sample');
  });

  it('reports a conflict when multiple distinct names appear', () => {
    const rows = [
      makeRow({ id: 'a', patientName: 'Taylor Sample' }),
      makeRow({ id: 'b', patientName: 'Jordan Other' }),
    ];
    const inferred = inferPatientName(rows);
    expect(inferred.conflict).toBe(true);
    expect(inferred.name).toBe('');
    expect(inferred.distinctNames).toHaveLength(2);
  });
});

describe('parseLedgerWords — Dentrix signed-Amount layout', () => {
  // Date · To… · Surface · Check # · Code · * · Description · N R D M · Amount · Prov · Ins · Balance
  const A = {
    date: 5, tooth: 75, surface: 115, check: 200, code: 310, star: 365, desc: 385,
    n: 645, r: 680, d: 705, m: 730, amount: 790, prov: 850, ins: 895, balance: 930,
  };

  function amountHeader(y = 5): OcrWord[] {
    return [
      word('Date', A.date, y),
      word('To...', A.tooth, y),
      word('Surface', A.surface, y),
      word('Check', A.check, y),
      word('#', A.check + 50, y),
      word('Code', A.code, y),
      word('*', A.star, y),
      word('Description', A.desc, y),
      word('N', A.n, y),
      word('R', A.r, y),
      word('D', A.d, y),
      word('M', A.m, y),
      word('Amount', A.amount, y),
      word('Prov', A.prov, y),
      word('Ins', A.ins, y),
      word('Balance', A.balance, y),
    ];
  }

  interface AmountRow {
    date: string; tooth?: string; surface?: string; check?: string; code?: string;
    desc: string[]; flag?: string; amount?: string; prov?: string; ins?: string; balance: string;
  }

  function amountRow(r: AmountRow, y: number): OcrWord[] {
    const w: OcrWord[] = [word(r.date, A.date, y), word('I', A.tooth - 8, y), word('*', A.star, y)];
    if (r.tooth) w.push(word(r.tooth, A.tooth + 15, y));
    if (r.surface) w.push(word(r.surface, A.surface, y));
    if (r.check) w.push(word(r.check, A.check, y));
    if (r.code) w.push(word(r.code, A.code, y));
    r.desc.forEach((t, i) => w.push(word(t, A.desc + i * 70, y)));
    if (r.flag) w.push(word(r.flag, A.n, y));
    if (r.amount) w.push(word(r.amount, A.amount, y));
    if (r.prov) w.push(word(r.prov, A.prov, y));
    if (r.ins) w.push(word(r.ins, A.ins, y));
    w.push(word(r.balance, A.balance, y));
    return w;
  }

  it('finds the header and splits the signed Amount into charge/payment', () => {
    const rows: AmountRow[] = [
      { date: '10/08/2024', code: 'CC Pay', desc: ['VISA/MC/AMEX/DISC', 'Payment'], amount: '-49.97', prov: 'DR02', balance: '94.00' },
      { date: '10/24/2024', check: '30655057', code: 'Pay', desc: ['Insurance', 'Payment-Check'], amount: '0.00', prov: 'HDA1', balance: '49.97' },
      { date: '10/24/2024', code: 'Ins', desc: ['Pr', 'Dental', 'Claim', "Rec'd", '94.00'], balance: '49.97' },
      { date: '04/22/2025', code: 'D1110', desc: ['Prophylaxis-adult'], amount: '95.70', prov: 'HY10', balance: '95.70' },
      { date: '10/30/2025', tooth: '11', code: 'D1354', desc: ['Caries', 'arresting', 'meds-per', 'tooth'], amount: '41.00', prov: 'DR02', balance: '136.70' },
      { date: '04/27/2026', code: '1207', desc: ['Follow-up', 'fluoride', 'varnish'], amount: '0.00', prov: 'HY10', ins: 'No', balance: '136.70' },
      { date: '06/08/2026', code: 'Adj', desc: ['In-Office', 'Provider', 'Prod', 'Adj'], flag: 'J', amount: '8.60', prov: 'HY10', balance: '145.30' },
    ];
    const words = [...amountHeader()];
    rows.forEach((r, i) => words.push(...amountRow(r, 30 + i * 16)));

    const parsed = parseLedgerWords(words, 'cap-amt');
    expect(parsed.headerFound).toBe(true);
    expect(parsed.rows).toHaveLength(7);
    const [cc, ins0, claim, prophy, caries, fl, adj] = parsed.rows;

    expect(cc.rawDescription).toBe('VISA/MC/AMEX/DISC Payment');
    expect(cc.paymentCents).toBe(-4997);
    expect(cc.chargeCents).toBeNull();
    expect(cc.balanceCents).toBe(9400);
    expect(cc.classification).toBe('PATIENT_PAYMENT');

    expect(ins0.paymentCents).toBe(0);
    expect(ins0.chargeCents).toBeNull();
    expect(ins0.classification).toBe('INSURANCE_PAYMENT');

    expect(claim.chargeCents).toBeNull();
    expect(claim.paymentCents).toBeNull();
    expect(claim.balanceCents).toBe(4997);
    expect(claim.classification).toBe('ZERO_DOLLAR_EVENT');

    expect(prophy.chargeCents).toBe(9570);
    expect(prophy.tooth).toBe('');
    expect(prophy.classification).toBe('TREATMENT_CHARGE');

    expect(caries.tooth).toBe('11');
    expect(caries.chargeCents).toBe(4100);

    expect(fl.chargeCents).toBe(0);
    expect(fl.balanceCents).toBe(13670);

    expect(adj.chargeCents).toBe(860);
    expect(adj.classification).toBe('INTERNAL_PROVIDER_ADJUSTMENT');
    expect(adj.lowConfidenceFields).toEqual([]);
  });
});
