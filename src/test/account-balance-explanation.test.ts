/** Patient explanation builder + readiness — including the $639 golden case. */
import { describe, it, expect } from 'vitest';
import { buildPatientExplanation, buildReadiness, insuranceStoryWording } from '@/lib/account-balance/explanation';
import { friendlyProcedure } from '@/lib/account-balance/procedure-language';
import { buildSmartReview } from '@/lib/account-balance/questions';
import { findBalanceEpisode, reconcileLedger } from '@/lib/account-balance/reconcile';
import type { AnswerMap, LedgerRow } from '@/lib/account-balance/types';
import { goldenAnswers, goldenRows, GOLDEN_QUESTION_IDS, makeRow } from './account-balance-fixture';

function derive(rows: LedgerRow[], answers: AnswerMap, patientName = 'Taylor Sample') {
  const reconciliation = reconcileLedger(rows);
  const episode = findBalanceEpisode(rows, reconciliation);
  const { questions, internalBlocks, waiverLinks } = buildSmartReview({
    rows, reconciliation, episode, answers, patientNameConflict: false,
  });
  const explanation = buildPatientExplanation({
    rows, reconciliation, episode, answers, internalBlocks, waiverLinks, patientName,
  });
  return { reconciliation, episode, questions, internalBlocks, waiverLinks, explanation };
}

describe('the synthetic $639 golden case', () => {
  it('produces the exact expected patient explanation', () => {
    const { explanation } = derive(goldenRows(), goldenAnswers());
    expect(explanation).not.toBeNull();
    const e = explanation!;

    expect(e.currentBalanceCents).toBe(63900);
    expect(e.patientName).toBe('Taylor Sample');
    expect(e.broughtForward).toBeNull();

    // Two cards: the preventive visit and the filling.
    expect(e.sections).toHaveLength(2);

    const visit = e.sections[0];
    expect(visit.title).toBe('Dental visit');
    expect(visit.dateLabel).toBe('February 12, 2026');
    expect(visit.services.map(s => s.label)).toEqual([
      'Routine dental exam',
      'Adult cleaning',
      'Bitewing X-rays, 4 images',
      'Additional periapical X-ray',
      'Periapical X-ray',
    ]);
    expect(visit.servicesTotalCents).toBe(36300);
    expect(visit.insuranceAppliedCents).toBe(0);
    expect(visit.remainingCents).toBe(36300);

    const filling = e.sections[1];
    expect(filling.title).toBe('3-surface tooth-colored filling, tooth #29');
    expect(filling.servicesTotalCents).toBe(39500);
    expect(filling.adjustments).toEqual([
      { label: 'Estimated copay/deductible collected', amountCents: -11900 },
    ]);
    expect(filling.remainingCents).toBe(27600);

    // $363 + $276 = $639, matching Dentrix to the penny.
    expect(e.calculation.map(l => l.amountCents)).toEqual([36300, 27600]);
    expect(e.calculationTotalCents).toBe(63900);
    expect(e.reconciled).toBe(true);

    // Confirmed insurance story, phrased with the ledger's carrier.
    expect(visit.contextNote).toBe(
      'Altus coverage was not active when this treatment was provided, so no Altus insurance payment or insurance contract adjustment was applied.'
    );
    expect(filling.contextNote).toBe(visit.contextNote);

    // The waived cancellation fee is "other activity" at $0.
    expect(e.otherActivity).toHaveLength(1);
    expect(e.otherActivity[0].title).toBe('Late cancellation fee');
    expect(e.otherActivity[0].lines).toEqual([
      { label: 'Late cancellation fee', amountCents: 7500 },
      { label: 'Courtesy adjustment', amountCents: -7500 },
    ]);
    expect(e.otherActivity[0].netCents).toBe(0);

    // No general credits — everything is allocated or historical.
    expect(e.generalCredits).toEqual([]);
    expect(e.statementThroughDateISO).toBe('2026-07-15');
  });

  it('never leaks internal Dentrix noise or mechanics to the patient model', () => {
    const { explanation } = derive(goldenRows(), goldenAnswers());
    const text = JSON.stringify(explanation);
    expect(text).not.toContain('Prod Adj');
    expect(text).not.toContain('Provider Payment Adj');
    expect(text).not.toMatch(/write-?off/i);
    expect(text).not.toMatch(/denied/i);
    expect(text).not.toContain('UNKNOWN');
  });

  it('is READY FOR PATIENT with the golden answers', () => {
    const rows = goldenRows();
    const { reconciliation, questions, explanation } = derive(rows, goldenAnswers());
    const readiness = buildReadiness({
      rows, reconciliation, questions, answers: goldenAnswers(),
      patientName: 'Taylor Sample', patientNameConflict: false, explanation,
    });
    expect(readiness.unresolvedQuestionCount).toBe(0);
    expect(readiness.ready).toBe(true);
  });
});

describe('safety gates', () => {
  it('a ledger that does not reconcile produces NO explanation', () => {
    const rows = [
      makeRow({ id: 'a', dateISO: '2026-01-01', rawDescription: 'Periodic oral evaluation', chargeCents: 6500, balanceCents: 6500 }),
      makeRow({ id: 'b', dateISO: '2026-01-02', rawDescription: 'VISA Payment', paymentCents: -1000, balanceCents: 9999 }),
    ];
    const { explanation } = derive(rows, {});
    expect(explanation).toBeNull();
  });

  it('an ending-balance mismatch blocks print readiness', () => {
    const rows = [
      makeRow({ id: 'a', dateISO: '2026-01-01', rawDescription: 'Periodic oral evaluation', chargeCents: 6500, balanceCents: 6500 }),
      makeRow({ id: 'b', dateISO: '2026-01-02', rawDescription: 'VISA Payment', paymentCents: -1000, balanceCents: 9999 }),
    ];
    const { reconciliation, questions, explanation } = derive(rows, {});
    const readiness = buildReadiness({
      rows, reconciliation, questions, answers: {},
      patientName: 'Taylor Sample', patientNameConflict: false, explanation,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.items.find(i => i.key === 'reconciled')!.passed).toBe(false);
  });

  it('multiple patient names block readiness', () => {
    const rows = goldenRows();
    const { reconciliation, questions, explanation } = derive(rows, goldenAnswers());
    const readiness = buildReadiness({
      rows, reconciliation, questions, answers: goldenAnswers(),
      patientName: '', patientNameConflict: true, explanation,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.items.find(i => i.key === 'single_patient')!.passed).toBe(false);
  });

  it('unverified "Please verify" rows block readiness', () => {
    const rows = goldenRows().map(r =>
      r.id === 'filling' ? { ...r, lowConfidenceFields: ['charge' as const] } : r
    );
    const { reconciliation, questions, explanation } = derive(rows, goldenAnswers());
    const readiness = buildReadiness({
      rows, reconciliation, questions, answers: goldenAnswers(),
      patientName: 'Taylor Sample', patientNameConflict: false, explanation,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.items.find(i => i.key === 'ocr_verified')!.passed).toBe(false);
  });

  it('an unanswered insurance question blocks readiness', () => {
    const rows = goldenRows();
    const answers = goldenAnswers();
    delete answers[GOLDEN_QUESTION_IDS.insuranceMissing];
    delete answers[GOLDEN_QUESTION_IDS.insuranceFullFee];
    const { reconciliation, questions, explanation } = derive(rows, answers);
    const readiness = buildReadiness({
      rows, reconciliation, questions, answers,
      patientName: 'Taylor Sample', patientNameConflict: false, explanation,
    });
    expect(readiness.ready).toBe(false);
    expect(readiness.unresolvedQuestionCount).toBeGreaterThan(0);
  });
});

describe('wording rules', () => {
  it('an unallocated payment stays "Payment received" — no invented copay', () => {
    const answers = goldenAnswers();
    delete answers[GOLDEN_QUESTION_IDS.allocation];
    const { explanation } = derive(goldenRows(), answers);
    const e = explanation!;
    const filling = e.sections[1];
    expect(filling.adjustments).toEqual([]);
    expect(filling.remainingCents).toBe(39500);
    expect(e.generalCredits).toEqual([{ label: 'Payment received', amountCents: -11900 }]);
    // Still adds up to $639 with the payment as a general credit.
    expect(e.calculationTotalCents).toBe(63900);
    expect(e.reconciled).toBe(true);
  });

  it('an unconfirmed waiver keeps the fee and credit visible and unlinked', () => {
    const answers = goldenAnswers();
    delete answers[GOLDEN_QUESTION_IDS.waiver];
    const { explanation } = derive(goldenRows(), answers);
    const e = explanation!;
    expect(e.otherActivity).toEqual([]);
    expect(e.sections.some(s => s.title === 'Late cancellation fee')).toBe(true);
    expect(e.generalCredits).toEqual([{ label: 'Courtesy adjustment', amountCents: -7500 }]);
    expect(e.calculationTotalCents).toBe(63900);
  });

  it('never says "denied" unless staff explicitly confirmed a denial', () => {
    expect(insuranceStoryWording('no_active', 'Altus')).not.toMatch(/denied/i);
    expect(insuranceStoryWording('pending', null)).not.toMatch(/denied/i);
    expect(insuranceStoryWording('denied', null)).toMatch(/denied/);
  });

  it('uses "brought forward" honestly when the import has no zero anchor', () => {
    const rows = [
      makeRow({ id: 'bf', dateISO: '2026-03-01', rawDescription: 'Balance Forward', balanceCents: 20000 }),
      makeRow({ id: 'c', dateISO: '2026-03-10', rawDescription: 'Periodic oral evaluation', chargeCents: 6500, balanceCents: 26500 }),
    ];
    const answers: AnswerMap = {
      'q:ins-missing:c': { questionId: 'q:ins-missing:c', optionId: 'chose_not' },
    };
    const { explanation } = derive(rows, answers);
    const e = explanation!;
    expect(e.broughtForward).toEqual({ amountCents: 20000, beforeDateISO: '2026-03-01' });
    expect(e.calculation[0].label).toContain('brought forward');
    expect(e.calculation[0].label).toContain('3/1/2026');
    expect(e.calculationTotalCents).toBe(26500);
    expect(e.reconciled).toBe(true);
  });
});

describe('procedure wording', () => {
  it('translates known Dentrix descriptions deterministically', () => {
    expect(friendlyProcedure('Periodic oral evaluation').label).toBe('Routine dental exam');
    expect(friendlyProcedure('Prophylaxis-adult').label).toBe('Adult cleaning');
    expect(friendlyProcedure('Bitewing Four Image').label).toBe('Bitewing X-rays, 4 images');
    expect(friendlyProcedure('Intraoral-periapical first image').label).toBe('Periapical X-ray');
    expect(friendlyProcedure('Intraoral-periapical each add').label).toBe('Additional periapical X-ray');
    expect(friendlyProcedure('Resin-Three surfaces, posterior', '29').label).toBe(
      '3-surface tooth-colored filling, tooth #29'
    );
    expect(friendlyProcedure('Resin-Four surfaces, anterior').label).toBe('4-surface tooth-colored filling');
    expect(friendlyProcedure('Resin-Two surfaces, anterior').label).toBe('2-surface tooth-colored filling');
    expect(friendlyProcedure('Crown porcelain/ceramic').label).toBe('Porcelain/ceramic crown');
    expect(friendlyProcedure('Core buildup, including any pins').label).toBe('Core buildup');
  });

  it('does not hallucinate a friendly name for unknown descriptions', () => {
    const unknown = friendlyProcedure('ZYGOMATIC FRAMMISTAT PROTOCOL');
    expect(unknown.known).toBe(false);
    // Conservative cleanup only: same words, fixed capitalization.
    expect(unknown.label).toBe('Zygomatic frammistat protocol');
  });
});
