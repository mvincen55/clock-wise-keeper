/** Smart Review question engine — asks the right question, concludes nothing. */
import { describe, it, expect } from 'vitest';
import { buildSmartReview, answerResolves, extractCarrierNames } from '@/lib/account-balance/questions';
import { findBalanceEpisode, reconcileLedger } from '@/lib/account-balance/reconcile';
import type { AnswerMap, LedgerRow } from '@/lib/account-balance/types';
import { goldenRows, goldenAnswers, GOLDEN_QUESTION_IDS, makeRow } from './account-balance-fixture';

function review(rows: LedgerRow[], answers: AnswerMap = {}, patientNameConflict = false) {
  const reconciliation = reconcileLedger(rows);
  const episode = findBalanceEpisode(rows, reconciliation);
  return buildSmartReview({ rows, reconciliation, episode, answers, patientNameConflict });
}

describe('golden ledger questions', () => {
  it('asks exactly the right questions, in priority order', () => {
    const { questions } = review(goldenRows());
    const kinds = questions.map(q => q.kind);
    expect(kinds).toEqual(['payment_allocation', 'insurance_missing', 'courtesy_waiver']);
  });

  it('collapses the insurance question across all uninsured treatment charges', () => {
    const { questions } = review(goldenRows());
    const ins = questions.find(q => q.kind === 'insurance_missing')!;
    expect(ins.amountCents).toBe(36300 + 39500);
    expect(ins.rowIds).toHaveLength(6);
    expect(ins.required).toBe(true);
  });

  it('suggests the carrier the ledger itself references — as a question, not a conclusion', () => {
    const { questions } = review(goldenRows());
    const ins = questions.find(q => q.kind === 'insurance_missing')!;
    expect(ins.prompt).toContain('Altus');
    expect(ins.prompt).toContain('?');
    expect(ins.prompt).not.toMatch(/denied/i);
  });

  it('phrases the payment-allocation question from the same-date filling', () => {
    const { questions } = review(goldenRows());
    const alloc = questions.find(q => q.kind === 'payment_allocation')!;
    expect(alloc.id).toBe(GOLDEN_QUESTION_IDS.allocation);
    expect(alloc.prompt).toContain('$119.00');
    expect(alloc.prompt.toLowerCase()).toContain('tooth #29');
    expect(alloc.options.map(o => o.id)).toContain('copay');
  });

  it('adds the full-fee follow-up only after coverage is confirmed inactive', () => {
    const before = review(goldenRows());
    expect(before.questions.some(q => q.kind === 'insurance_full_fee')).toBe(false);

    const answers: AnswerMap = {
      [GOLDEN_QUESTION_IDS.insuranceMissing]: {
        questionId: GOLDEN_QUESTION_IDS.insuranceMissing,
        optionId: 'no_active',
      },
    };
    const after = review(goldenRows(), answers);
    const followUp = after.questions.find(q => q.kind === 'insurance_full_fee');
    expect(followUp).toBeDefined();
    expect(followUp!.followUpOf).toBe(GOLDEN_QUESTION_IDS.insuranceMissing);
  });

  it('does not ask about the zero-net internal adjustment block', () => {
    const { questions, internalBlocks } = review(goldenRows());
    expect(internalBlocks.some(b => b.netsToZero)).toBe(true);
    expect(questions.some(q => q.kind === 'internal_adjustment_nonzero')).toBe(false);
  });

  it('does not interrogate the $0 insurance postings when the insurance question covers them', () => {
    const { questions } = review(goldenRows());
    expect(questions.some(q => q.kind === 'zero_insurance_posting')).toBe(false);
  });

  it('resolves fully with the golden answers', () => {
    const { questions } = review(goldenRows(), goldenAnswers());
    const answers = goldenAnswers();
    for (const q of questions.filter(x => x.required)) {
      expect(answerResolves(answers, q.id)).toBe(true);
    }
  });
});

describe('question triggers', () => {
  it('a reconciliation failure is the first, blocking question', () => {
    const rows = [
      makeRow({ id: 'a', dateISO: '2026-01-01', rawDescription: 'Periodic oral evaluation', chargeCents: 6500, balanceCents: 6500 }),
      makeRow({ id: 'b', dateISO: '2026-01-02', rawDescription: 'VISA Payment', paymentCents: -1000, balanceCents: 9999 }),
    ];
    const { questions } = review(rows);
    expect(questions[0].kind).toBe('reconciliation_failure');
    expect(questions[0].required).toBe(true);
    expect(questions[0].rowIds).toEqual(['b']);
  });

  it('multiple patient names block with a hard-stop question', () => {
    const { questions } = review(goldenRows(), {}, true);
    expect(questions.some(q => q.kind === 'multiple_patient_names' && q.required)).toBe(true);
  });

  it('an unknown monetary transaction inside the episode requires an answer', () => {
    const rows = [
      makeRow({ id: 'm', dateISO: '2026-01-05', rawDescription: 'MISC 1234', chargeCents: 5000, balanceCents: 5000 }),
    ];
    const { questions } = review(rows);
    const unknown = questions.find(q => q.kind === 'unknown_transaction');
    expect(unknown).toBeDefined();
    expect(unknown!.required).toBe(true);
  });

  it('an unknown transaction BEFORE the zero anchor asks nothing', () => {
    // The golden ledger's historical ACCOUNT ADJUSTMENT is unknown but paid off.
    const { questions } = review(goldenRows());
    expect(questions.some(q => q.kind === 'unknown_transaction')).toBe(false);
  });

  it('an internal adjustment block that does not net to zero requires review', () => {
    const rows = [
      makeRow({ id: 'a1', dateISO: '2026-01-01', rawDescription: 'In-Office Provider Prod Adj', chargeCents: 11900, balanceCents: 11900 }),
      makeRow({ id: 'a2', dateISO: '2026-01-01', rawDescription: 'In-Office Provider Payment Adj', paymentCents: -9770, balanceCents: 2130 }),
    ];
    const { questions } = review(rows);
    const q = questions.find(x => x.kind === 'internal_adjustment_nonzero');
    expect(q).toBeDefined();
    expect(q!.required).toBe(true);
    expect(q!.prompt).toContain('$21.30');
  });

  it('a $0 insurance posting is questioned when nothing else explains it', () => {
    // No treatment charges → no insurance-missing question → the lone $0
    // posting stands out and must be explained.
    const rows = [
      makeRow({ id: 'fee', dateISO: '2026-01-05', rawDescription: 'CANCELLATION W/OUT NOTICE', chargeCents: 7500, balanceCents: 7500 }),
      makeRow({ id: 'z', dateISO: '2026-01-08', rawDescription: 'Dental Ins Payment - Altus', paymentCents: 0, balanceCents: 7500 }),
    ];
    const { questions } = review(rows);
    const zero = questions.find(q => q.kind === 'zero_insurance_posting');
    expect(zero).toBeDefined();
    expect(zero!.options.some(o => o.id === 'denied')).toBe(true);
    // The question never presumes the answer.
    expect(zero!.prompt).not.toMatch(/denied/i);
  });

  it('answering "investigate" does not resolve a required question', () => {
    const answers: AnswerMap = {
      q1: { questionId: 'q1', optionId: 'investigate' },
      q2: { questionId: 'q2', optionId: 'other', note: '' },
      q3: { questionId: 'q3', optionId: 'other', note: 'Records fee' },
    };
    expect(answerResolves(answers, 'q1')).toBe(false);
    expect(answerResolves(answers, 'q2')).toBe(false);
    expect(answerResolves(answers, 'q3')).toBe(true);
  });
});

describe('extractCarrierNames', () => {
  it('finds carrier names from payment and write-off wording', () => {
    const rows = [
      makeRow({ id: 'p', dateISO: '2026-01-01', rawDescription: 'Dental Ins Payment - Altus', paymentCents: -100 }),
      makeRow({ id: 'w', dateISO: '2026-01-02', rawDescription: 'Altus Write-Off', paymentCents: -50 }),
    ];
    expect(extractCarrierNames(rows)).toEqual(['Altus']);
  });
});
