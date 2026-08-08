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
