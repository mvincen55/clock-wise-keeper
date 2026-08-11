/**
 * Regression tests for the dense-Dentrix-ledger parsing failure:
 * merged rows, dropped first transactions, description prefixes in TEETH,
 * neighbor text in PATIENT, $20.00 read as $2,000.00, sign-dropped payments,
 * fake multi-patient conflicts, and verify-everything noise.
 *
 * Everything here runs against the COMPLETELY SYNTHETIC geometry fixture in
 * account-balance-ledger-geometry.ts — no real patient data.
 */
import { describe, it, expect } from 'vitest';
import { parseLedgerWords, plausibleMisread, inferPatientName } from '@/lib/account-balance/parser';
import { reconcileLedger } from '@/lib/account-balance/reconcile';
import {
  ENDING_BALANCE_CENTS,
  SYN_LEDGER_ROWS,
  buildDenseLedgerWords,
} from './account-balance-ledger-geometry';
import { makeRow } from './account-balance-fixture';

function parseFixture() {
  return parseLedgerWords(buildDenseLedgerWords(), 'cap-dense');
}

describe('dense ledger row reconstruction', () => {
  it('1. all 33 synthetic transactions survive — including the first rows', () => {
    const { rows, headerFound } = parseFixture();
    expect(headerFound).toBe(true);
    expect(rows).toHaveLength(SYN_LEDGER_ROWS.length);
    expect(rows).toHaveLength(33);
    // The very first source rows used to be dropped/merged into the header.
    expect(rows[0].rawDescription).toBe('Patient Balance Forward');
    expect(rows[0].dateISO).toBe('2030-03-01');
    expect(rows[0].classification).toBe('BALANCE_FORWARD');
    expect(rows[1].rawDescription).toBe('Periodic oral evaluation');
  });

  it('2. no two dated transactions merge — every row keeps its own date', () => {
    const { rows } = parseFixture();
    expect(rows.map(r => r.dateISO)).toEqual(SYN_LEDGER_ROWS.map(s => s.expected.dateISO));
    // Dense-row bait: the tall-bbox rows stayed separate with intact cells.
    expect(rows[2].chargeCents).toBe(9100);
    expect(rows[3].chargeCents).toBe(4100);
    expect(rows[21].chargeCents).toBe(5400);
    expect(rows[22].chargeCents).toBe(7200);
  });

  it('3. no description prefix lands in TEETH; real tooth numbers stay', () => {
    const { rows } = parseFixture();
    expect(rows.map(r => r.tooth)).toEqual(SYN_LEDGER_ROWS.map(s => s.expected.tooth));
    // "Bitewing" starts left of the naive header-midpoint boundary — it must
    // be description, never a tooth value.
    expect(rows[2].tooth).toBe('');
    expect(rows[2].rawDescription).toBe('Bitewing Four Image');
    expect(rows[9].tooth).toBe('4');
    expect(rows[11].tooth).toBe('12');
  });

  it('4. the PATIENT cell never receives text from a neighboring row', () => {
    const { rows } = parseFixture();
    for (const row of rows.slice(1)) {
      expect(row.patientName).toBe('SAMPLE');
    }
    expect(rows[0].patientName).toBe(''); // balance-forward row has no patient cell
    const inference = inferPatientName(rows);
    expect(inference.conflict).toBe(false);
    expect(inference.name).toBe('SAMPLE');
    expect(inference.outlierRowIds).toEqual([]);
  });

  it('5. $20.00 cannot silently become $2,000.00 against the running balance', () => {
    const { rows } = parseFixture();
    const misread = rows[8];
    expect(misread.paymentCents).toBe(-2000);
    // The repair is recorded, not silent — original OCR text preserved.
    expect(misread.corrections).toEqual([
      { field: 'payment', ocrText: '2,000.00', ocrCents: 200000, correctedCents: -2000 },
    ]);
    // The sign-dropped −$541.00 payment is likewise repaired from the ledger math.
    const signDropped = rows[6];
    expect(signDropped.paymentCents).toBe(-54100);
    expect(signDropped.corrections?.[0]).toMatchObject({
      field: 'payment',
      ocrText: '541.00',
      correctedCents: -54100,
    });
  });

  it('6. payments preserve their negative Dentrix sign — no double flipping', () => {
    const { rows } = parseFixture();
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].paymentCents).toBe(SYN_LEDGER_ROWS[i].expected.paymentCents);
      expect(rows[i].chargeCents).toBe(SYN_LEDGER_ROWS[i].expected.chargeCents);
    }
    // A correctly-negative value passes through untouched (no correction).
    expect(rows[7].paymentCents).toBe(-3850);
    expect(rows[7].corrections).toBeUndefined();
    // Split "-" + "118.50" tokens reunite into one negative amount.
    expect(rows[24].paymentCents).toBe(-11850);
    expect(rows[24].corrections).toBeUndefined();
  });

  it('7. a description continuation attaches to the correct preceding row', () => {
    const { rows } = parseFixture();
    expect(rows[12].rawDescription).toBe('Restoration Adjust Overhang DUE TO FRACTURE');
    // …and never bleeds into the next transaction.
    expect(rows[13].rawDescription).toBe('Dental Ins Payment - Acme');
  });

  it('10. reconciliation reaches the exact displayed ending balance', () => {
    const { rows } = parseFixture();
    for (let i = 0; i < rows.length; i++) {
      expect(rows[i].balanceCents).toBe(SYN_LEDGER_ROWS[i].expected.balanceCents);
    }
    const result = reconcileLedger(rows);
    expect(result.reconciled).toBe(true);
    expect(result.displayedEndingBalanceCents).toBe(ENDING_BALANCE_CENTS);
    expect(result.reconstructedEndingBalanceCents).toBe(ENDING_BALANCE_CENTS);
    expect(result.differenceCents).toBe(0);
    expect(result.firstMismatchRowId).toBeNull();
    expect(result.rowResults.every(r => r.matches && r.deltaMatches)).toBe(true);
  });

  it('review is targeted: math-proven rows carry no "Please verify" flags', () => {
    const { rows } = parseFixture();
    // Even the deliberately low-confidence rows (55%) are proven by the
    // running balance — they need no human verification.
    const flagged = rows.filter(r => r.lowConfidenceFields.length > 0);
    expect(flagged).toEqual([]);
  });

  it('records which balance-derived corrections happened, and only those', () => {
    const { rows } = parseFixture();
    const corrected = rows
      .map((r, i) => ({ i, corrections: r.corrections ?? [] }))
      .filter(r => r.corrections.length > 0);
    const expectedIndexes = SYN_LEDGER_ROWS
      .map((s, i) => ({ i, field: s.expected.correctedField }))
      .filter(s => s.field !== undefined);
    expect(corrected.map(c => c.i)).toEqual(expectedIndexes.map(e => e.i));
    for (const { i, corrections } of corrected) {
      expect(corrections).toHaveLength(1);
      expect(corrections[0].field).toBe(SYN_LEDGER_ROWS[i].expected.correctedField);
    }
  });
});

describe('plausibleMisread — repairs are digit-anchored, never invented', () => {
  it('accepts sign loss, dropped decimals, and punctuation loss', () => {
    expect(plausibleMisread('500.00', -50000)).toBe(true); // sign lost
    expect(plausibleMisread('2,000.00', -2000)).toBe(true); // decimal + sign lost
    expect(plausibleMisread('119 00', 11900)).toBe(true); // decimal read as space
    expect(plausibleMisread('20.00', 200000)).toBe(true); // decimal shifted the other way
  });

  it('rejects unrelated numbers — no repair from vibes', () => {
    expect(plausibleMisread('500.00', -49900)).toBe(false);
    expect(plausibleMisread('65.00', 8500)).toBe(false);
    expect(plausibleMisread('', -2000)).toBe(false);
  });
});

describe('patient-name conflicts after reliable row reconstruction', () => {
  it('8. a truly different patient name still creates an account conflict', () => {
    const rows = [
      makeRow({ id: 'a', patientName: 'SAMPLE' }),
      makeRow({ id: 'b', patientName: 'SAMPLE' }),
      makeRow({ id: 'c', patientName: 'DIFFERENT' }),
      makeRow({ id: 'd', patientName: 'DIFFERENT' }),
    ];
    const inference = inferPatientName(rows);
    expect(inference.conflict).toBe(true);
    expect(inference.name).toBe('');
  });

  it('8b. even a single high-confidence distinct name hard-stops', () => {
    const rows = [
      makeRow({ id: 'a', patientName: 'SAMPLE' }),
      makeRow({ id: 'b', patientName: 'SAMPLE' }),
      makeRow({ id: 'c', patientName: 'SAMPLE' }),
      makeRow({ id: 'd', patientName: 'WHOLLY OTHER', patientNameConfidence: 0.97 }),
    ];
    expect(inferPatientName(rows).conflict).toBe(true);
  });

  it('9. one malformed low-confidence patient cell is NOT a second account', () => {
    const rows = [
      makeRow({ id: 'a', patientName: 'SAMPLE' }),
      makeRow({ id: 'b', patientName: 'SAMPLE' }),
      makeRow({ id: 'c', patientName: 'SAMPLE' }),
      makeRow({ id: 'd', patientName: 'SAMPIE', patientNameConfidence: 0.4 }),
    ];
    const inference = inferPatientName(rows);
    expect(inference.conflict).toBe(false);
    expect(inference.name).toBe('SAMPLE');
    // The specific questionable cell is identified for review.
    expect(inference.outlierRowIds).toEqual(['d']);
  });

  it('9b. a garbled near-duplicate outlier is an artifact even at high confidence', () => {
    const rows = [
      makeRow({ id: 'a', patientName: 'SAMPLE' }),
      makeRow({ id: 'b', patientName: 'SAMPLE' }),
      makeRow({ id: 'c', patientName: 'SAMPLE SAMPLE', patientNameConfidence: 0.9 }),
    ];
    const inference = inferPatientName(rows);
    expect(inference.conflict).toBe(false);
    expect(inference.name).toBe('SAMPLE');
    expect(inference.outlierRowIds).toEqual(['c']);
  });
});
