/** Insurance claim → visit allocation, modeled on a real Dentrix ledger shape. */
import { describe, it, expect } from 'vitest';
import { allocateInsuranceClaims, claimBilledCents } from '@/lib/account-balance/claims';
import { buildPatientExplanation } from '@/lib/account-balance/explanation';
import { visitServiceSentence, visitSummaryLabel, friendlyProcedure } from '@/lib/account-balance/procedure-language';
import { buildSmartReview } from '@/lib/account-balance/questions';
import { findBalanceEpisode, reconcileLedger } from '@/lib/account-balance/reconcile';
import type { AnswerMap, LedgerRow } from '@/lib/account-balance/types';
import { makeRow } from './account-balance-fixture';

let n = 0;
const r = (dateISO: string, rawDescription: string, money: { c?: number; p?: number }, balanceCents: number, tooth = '') =>
  makeRow({ id: `r${n++}`, dateISO, rawDescription, tooth, chargeCents: money.c ?? null, paymentCents: money.p ?? null, balanceCents });

/** Synthetic amounts mirroring a real multi-claim account ending at $65.40. */
function ledger(): LedgerRow[] {
  n = 0;
  return [
    r('2025-05-19', "Pr Dental Claim - Rec'd 95.70", {}, 0),
    r('2025-10-16', 'FL Package Adult 1st Visit', { c: 6700 }, 6700),
    r('2025-10-16', 'Periodic oral evaluation', { c: 4130 }, 10830),
    r('2025-10-16', 'Bitewing Four Image', { c: 6770 }, 17600),
    r('2025-10-16', 'Prophylaxis-adult', { c: 9570 }, 27170),
    r('2025-10-30', 'Caries arresting meds-per tooth', { c: 4100 }, 31270, '11'),
    r('2025-10-30', 'Caries arresting meds-per tooth', { c: 4100 }, 35370, '26'),
    r('2025-10-30', 'Caries arresting meds-per tooth', { c: 4100 }, 39470, '27'),
    r('2025-11-21', 'Insurance Payment-Check', { p: -12300 }, 27170),
    r('2025-11-21', "Pr Dental Claim - Rec'd 123.00", {}, 27170),
    r('2026-04-27', 'Periodic oral evaluation', { c: 4130 }, 31300),
    r('2026-04-27', 'Intraoral Periapical Images', { c: 2540 }, 33840),
    r('2026-04-27', 'Bitewing Four Image', { c: 6770 }, 40610),
    r('2026-04-27', 'Prophylaxis-adult', { c: 9570 }, 50180),
    r('2026-05-14', 'Caries arresting meds-per tooth', { c: 4100 }, 54280, '9'),
    r('2026-05-14', 'Resin composite-2s, posterior', { c: 19670 }, 73950, '21'),
    r('2026-05-14', 'VISA/MC/AMEX/DISC Payment', { p: -7934 }, 66016),
    r('2026-05-29', 'Insurance Payment-Check', { p: -15996 }, 50020),
    r('2026-05-29', "Pr Dental Claim - Rec'd 237.70", {}, 50020),
    r('2026-06-08', 'Insurance Payment-Check', { p: -19740 }, 30280),
    r('2026-06-08', 'Insurance Payment-Check', { p: -4130 }, 26150),
    r('2026-06-08', 'In-Office Provider Prod Adj', { c: 860 }, 27010),
    r('2026-06-08', 'Insurance Payment-Check', { p: -12300 }, 14710),
    r('2026-06-08', 'In-Office Provider Prod Adj', { c: 12300 }, 27010),
    r('2026-06-08', "Pr Dental Claim - Rec'd 230.10", {}, 27010),
    r('2026-06-08', "Pr Dental Claim - Rec'd 0.00", {}, 27010),
    r('2026-09-16', 'Insurance Payment-Check', { p: -4130 }, 22880),
    r('2026-09-16', 'Insurance Payment-Check', { p: -16340 }, 6540),
    r('2026-09-16', "Pr Dental Claim - Rec'd 271.70", {}, 6540),
    r('2026-09-21', 'In-Office Provider Payment Adj', { c: 160 }, 6700),
    r('2026-09-21', 'In-Office Provider Payment Adj', { p: -160 }, 6540),
  ];
}

function explain(rows: LedgerRow[], answers: AnswerMap = {}) {
  const reconciliation = reconcileLedger(rows);
  const episode = findBalanceEpisode(rows, reconciliation);
  const review = buildSmartReview({ rows, reconciliation, episode, answers, patientNameConflict: false });
  const explanation = buildPatientExplanation({
    rows, reconciliation, episode, answers, internalBlocks: review.internalBlocks, waiverLinks: review.waiverLinks, claims: review.claims, patientName: 'Sample Patient',
  });
  return { review, explanation: explanation! };
}

describe('claimBilledCents', () => {
  it("reads the billed total off Dentrix's claim row", () => {
    expect(claimBilledCents(makeRow({ id: 'a', rawDescription: "Pr Dental Claim - Rec'd 271.70" }))).toBe(27170);
    expect(claimBilledCents(makeRow({ id: 'b', rawDescription: "PrDental Claim - Rec'd 0.00" }))).toBe(0);
    // OCR sometimes drops the space before the amount.
    expect(claimBilledCents(makeRow({ id: 'd', rawDescription: "Pr Dental Claim - Rec'd271.70" }))).toBe(27170);
    expect(claimBilledCents(makeRow({ id: 'c', rawDescription: 'Insurance Payment-Check', paymentCents: -100 }))).toBeNull();
  });
});

describe('allocateInsuranceClaims', () => {
  it('matches each claim to the visit whose charges it billed', () => {
    const rows = ledger();
    const claims = allocateInsuranceClaims(rows.slice(1));
    expect(Object.fromEntries(claims.insuranceByDate)).toEqual({
      '2025-10-30': -12300,
      '2026-05-14': -15996,
      '2026-04-27': -23010, // $238.70 paid less the $8.60 fee correction
      '2025-10-16': -20470,
    });
    expect(claims.paymentDatesByDate.get('2025-10-16')).toEqual(['2026-09-16']);
  });

  it('hides a payment immediately offset by an equal fee adjustment', () => {
    const rows = ledger();
    const claims = allocateInsuranceClaims(rows.slice(1));
    const hidden = rows.filter(row => claims.hiddenRowIds.has(row.id)).map(row => rowDelta(row));
    expect(hidden).toEqual([-12300, 12300]);
  });

  it('treats a not-yet-named charge billed on a claim as part of the visit', () => {
    const rows = ledger();
    const claims = allocateInsuranceClaims(rows.slice(1));
    expect(claims.claimedChargeRowIds.has(rows[1].id)).toBe(true); // FL package
  });

  it('lets a secondary claim settle a visit primary already paid', () => {
    n = 0;
    const rows = [
      r('2026-01-05', 'Periodic oral evaluation', { c: 10000 }, 10000),
      r('2026-02-01', 'Insurance Payment-Check', { p: -6000 }, 4000),
      r('2026-02-01', "Pr Dental Claim - Rec'd 100.00", {}, 4000),
      r('2026-03-01', 'Insurance Payment-Check', { p: -3000 }, 1000),
      r('2026-03-01', "Pr Dental Claim - Rec'd 100.00", {}, 1000),
    ];
    const claims = allocateInsuranceClaims(rows);
    expect(claims.insuranceByDate.get('2026-01-05')).toBe(-9000);
    expect(claims.paymentDatesByDate.get('2026-01-05')).toEqual(['2026-02-01', '2026-03-01']);
    expect(claims.allocatedRowIds.size).toBe(2);
  });

  it('never applies more insurance to a visit than was billed', () => {
    n = 0;
    const rows = [
      r('2026-01-05', 'Periodic oral evaluation', { c: 10000 }, 10000),
      r('2026-02-01', 'Insurance Payment-Check', { p: -6000 }, 4000),
      r('2026-02-01', "Pr Dental Claim - Rec'd 100.00", {}, 4000),
      r('2026-03-01', 'Insurance Payment-Check', { p: -6000 }, -2000),
      r('2026-03-01', "Pr Dental Claim - Rec'd 100.00", {}, -2000),
    ];
    const claims = allocateInsuranceClaims(rows);
    expect(claims.insuranceByDate.get('2026-01-05')).toBe(-6000);
    expect(claims.allocatedRowIds.size).toBe(1);
  });

  it('settles identical-fee visits in visit order', () => {
    n = 0;
    // An older open exam keeps the balance off zero, so every visit is in play.
    const rows = [
      r('2025-12-01', 'Periodic oral evaluation', { c: 4130 }, 4130),
      r('2026-01-05', 'Prophylaxis-adult', { c: 9570 }, 13700),
      r('2026-07-05', 'Prophylaxis-adult', { c: 9570 }, 23270),
      r('2026-08-01', 'Insurance Payment-Check', { p: -9570 }, 13700),
      r('2026-08-01', "Pr Dental Claim - Rec'd 95.70", {}, 13700),
      r('2026-09-01', 'Insurance Payment-Check', { p: -9570 }, 4130),
      r('2026-09-01', "Pr Dental Claim - Rec'd 95.70", {}, 4130),
    ];
    const claims = allocateInsuranceClaims(rows);
    expect(claims.insuranceByDate.get('2026-01-05')).toBe(-9570);
    expect(claims.insuranceByDate.get('2026-07-05')).toBe(-9570);
    // The first claim could have paid either visit; the second had one left.
    expect([...claims.dateUncertainVisits]).toEqual(['2026-01-05']);

    // The sheet keeps the amounts and withholds only the uncertain date.
    const { explanation } = explain(rows);
    expect(explanation.sections.map(s => s.insurancePaymentDatesISO)).toEqual([[], [], ['2026-09-01']]);
    expect(explanation.sections.map(s => s.remainingCents)).toEqual([4130, 0, 0]);
    expect(explanation.reconciled).toBe(true);
  });

  it('leaves payments unallocated when no visit matches the billed total', () => {
    n = 0;
    const rows = [
      r('2026-01-05', 'Periodic oral evaluation', { c: 5000 }, 5000),
      r('2026-02-01', 'Insurance Payment-Check', { p: -4000 }, 1000),
      r('2026-02-01', "Pr Dental Claim - Rec'd 99.00", {}, 1000),
    ];
    const claims = allocateInsuranceClaims(rows);
    expect(claims.insuranceByDate.size).toBe(0);
    expect(claims.allocatedRowIds.size).toBe(0);
  });
});

describe('patient explanation with claim allocation', () => {
  it('sorts the account into visits that each show charges, insurance, payment and balance', () => {
    const { explanation: e, review } = explain(ledger());
    expect(e.reconciled).toBe(true);
    expect(e.currentBalanceCents).toBe(6540);
    expect(e.generalCredits).toEqual([]);
    expect(
      e.sections.map(s => [s.dateISO, s.servicesTotalCents, s.insurancePaidCents, s.patientPaidCents, s.remainingCents])
    ).toEqual([
      ['2025-10-16', 27170, -20470, 0, 6700],
      ['2025-10-30', 12300, -12300, 0, 0],
      ['2026-04-27', 23010, -23010, 0, 0],
      ['2026-05-14', 23770, -15996, -7934, -160],
    ]);
    // Nothing the claims prove is asked about.
    expect(review.questions.map(q => q.kind)).toEqual(['payment_allocation']);
  });
});

describe('smart review with claim allocation', () => {
  it('asks about only the unexplained part of an adjustment block', () => {
    // An offset pair ($123 in / $123 fee) hides; the $8.60 beside it is still
    // open because the claim run billed two totals and cannot be placed.
    n = 0;
    const rows = [
      r('2026-01-05', 'Periodic oral evaluation', { c: 4130 }, 4130),
      r('2026-02-01', 'Insurance Payment-Check', { p: -12300 }, -8170),
      r('2026-02-01', 'In-Office Provider Prod Adj', { c: 12300 }, 4130),
      r('2026-02-01', 'In-Office Provider Prod Adj', { c: 860 }, 4990),
      r('2026-02-01', "Pr Dental Claim - Rec'd 41.30", {}, 4990),
      r('2026-02-01', "Pr Dental Claim - Rec'd 50.00", {}, 4990),
    ];
    const { review } = explain(rows);
    const block = review.questions.find(q => q.kind === 'internal_adjustment_nonzero')!;
    expect(block.amountCents).toBe(860);
    expect(block.rowIds).toEqual([rows[3].id]);
    expect(review.internalBlocks).toEqual([{ rowIds: [rows[3].id], netCents: 860, netsToZero: false }]);

    // Answered, only the $8.60 reaches the patient — the hidden $123 pair never does.
    const { explanation } = explain(rows, {
      [block.id]: { questionId: block.id, optionId: 'patient_charge', note: 'Fee correction' },
    });
    expect(explanation.sections.map(s => s.remainingCents)).toEqual([4130, 860]);
    expect(explanation.reconciled).toBe(true);
  });

  it('does not attach a same-day payment larger than the visit to that visit', () => {
    n = 0;
    const rows = [
      r('2026-01-05', 'Periodic oral evaluation', { c: 9500 }, 9500),
      r('2026-01-05', 'VISA Payment', { p: -50000 }, -40500),
    ];
    const { explanation } = explain(rows);
    expect(explanation.sections[0].patientPaidCents).toBe(0);
    expect(explanation.generalCredits).toEqual([{ label: 'Payment received', amountCents: -50000 }]);
    expect(explanation.reconciled).toBe(true);
  });
});

describe('visit wording', () => {
  const svc = (raw: string, tooth = '') => ({ wording: friendlyProcedure(raw, tooth), tooth });

  it('titles a visit by its treatment families', () => {
    expect(visitSummaryLabel([svc('Periodic oral evaluation'), svc('Bitewing Four Image'), svc('Prophylaxis-adult')]))
      .toBe('Exam, X-rays + cleaning');
  });

  it('collapses repeated procedures with their teeth', () => {
    expect(
      visitServiceSentence([
        svc('Caries arresting meds-per tooth', '11'),
        svc('Caries arresting meds-per tooth', '26'),
        svc('Resin composite-2s, posterior', '21'),
      ])
    ).toBe('Cavity-arresting medication on 2 teeth (#11, #26) and 2-surface tooth-colored filling, tooth #21.');
  });
});

function rowDelta(row: LedgerRow): number {
  return (row.chargeCents ?? 0) + (row.paymentCents ?? 0);
}
