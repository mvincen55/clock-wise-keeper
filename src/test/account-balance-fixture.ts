/**
 * Synthetic golden test fixture for the Account Balance Explainer.
 *
 * COMPLETELY SYNTHETIC — no real patient, no real screenshot, no real ledger.
 * Reproduces the reference accounting shape: a $318.55 prior balance cleared
 * to a $0.00 anchor, a $363.00 preventive visit, a $119.00 card payment and
 * same-date $395.00 filling, a zero-net internal adjustment block, a waived
 * $75.00 cancellation fee, two intentionally identical $0.00 insurance
 * postings, and a $639.00 ending balance.
 */
import { classifyTransaction } from '@/lib/account-balance/classify';
import type { AnswerMap, LedgerRow } from '@/lib/account-balance/types';

let seq = 0;

export function makeRow(partial: Partial<LedgerRow> & { id: string }): LedgerRow {
  const base: LedgerRow = {
    id: partial.id,
    sourceCaptureId: partial.sourceCaptureId ?? 'cap-1',
    sourceSequence: seq++,
    dateISO: partial.dateISO ?? '',
    tooth: partial.tooth ?? '',
    rawDescription: partial.rawDescription ?? '',
    patientName: partial.patientName ?? 'Taylor Sample',
    chargeCents: partial.chargeCents ?? null,
    paymentCents: partial.paymentCents ?? null,
    balanceCents: partial.balanceCents ?? null,
    ocrConfidence: partial.ocrConfidence ?? 0.95,
    patientNameConfidence: partial.patientNameConfidence ?? 0.95,
    corrections: partial.corrections,
    lowConfidenceFields: partial.lowConfidenceFields ?? [],
    classification: 'UNKNOWN',
    classificationConfidence: 0,
    staffVerified: partial.staffVerified ?? false,
  };
  const classified = classifyTransaction({
    rawDescription: base.rawDescription,
    tooth: base.tooth,
    chargeCents: base.chargeCents,
    paymentCents: base.paymentCents,
  });
  base.classification = partial.classification ?? classified.classification;
  base.classificationConfidence =
    partial.classificationConfidence ?? classified.confidence;
  return base;
}

/** The synthetic $639 golden ledger, already merged and in order. */
export function goldenRows(): LedgerRow[] {
  seq = 0;
  return [
    // Historical era — ends at a clean $0.00 anchor.
    makeRow({ id: 'bf', dateISO: '2026-01-05', rawDescription: 'Balance Forward', balanceCents: 31855 }),
    makeRow({ id: 'oldpay', dateISO: '2026-01-12', rawDescription: 'VISA Payment', paymentCents: -38555, balanceCents: -6700 }),
    makeRow({ id: 'oldchg', dateISO: '2026-01-20', rawDescription: 'ACCOUNT ADJUSTMENT', chargeCents: 6700, balanceCents: 0 }),

    // Preventive visit — $363.00 of services.
    makeRow({ id: 'exam', dateISO: '2026-02-12', rawDescription: 'Periodic oral evaluation', chargeCents: 6500, balanceCents: 6500 }),
    makeRow({ id: 'prophy', dateISO: '2026-02-12', rawDescription: 'Prophylaxis-adult', chargeCents: 12900, balanceCents: 19400 }),
    makeRow({ id: 'bw', dateISO: '2026-02-12', rawDescription: 'Bitewing Four Image', chargeCents: 8500, balanceCents: 27900 }),
    makeRow({ id: 'paAdd', dateISO: '2026-02-12', rawDescription: 'Intraoral-periapical each add', chargeCents: 3700, balanceCents: 31600 }),
    makeRow({ id: 'paFirst', dateISO: '2026-02-12', rawDescription: 'Intraoral-periapical first image', chargeCents: 4700, balanceCents: 36300 }),

    // Card payment and same-date filling.
    makeRow({ id: 'copay', dateISO: '2026-06-10', rawDescription: 'VISA Payment', paymentCents: -11900, balanceCents: 24400 }),
    makeRow({ id: 'filling', dateISO: '2026-06-10', tooth: '29', rawDescription: 'Resin-Three surfaces, posterior', chargeCents: 39500, balanceCents: 63900 }),

    // Internal provider adjustment block — nets to exactly $0.00.
    makeRow({ id: 'adj1', dateISO: '2026-06-11', rawDescription: 'In-Office Provider Prod Adj', chargeCents: 11900, balanceCents: 75800 }),
    makeRow({ id: 'adj2', dateISO: '2026-06-11', rawDescription: 'In-Office Provider Payment Adj', paymentCents: -9770, balanceCents: 66030 }),
    makeRow({ id: 'adj3', dateISO: '2026-06-11', rawDescription: 'In-Office Provider Payment Adj', paymentCents: -2130, balanceCents: 63900 }),

    // Cancellation fee, waived days later by an exact courtesy credit.
    makeRow({ id: 'cancel', dateISO: '2026-06-24', rawDescription: 'CANCELLATION W/OUT NOTICE', chargeCents: 7500, balanceCents: 71400 }),
    makeRow({ id: 'courtesy', dateISO: '2026-06-27', rawDescription: 'Courtesy Credit', paymentCents: -7500, balanceCents: 63900 }),

    // Two intentionally identical $0.00 insurance postings.
    makeRow({ id: 'ins0a', dateISO: '2026-07-08', rawDescription: 'Dental Ins Payment - Altus', paymentCents: 0, balanceCents: 63900 }),
    makeRow({ id: 'ins0b', dateISO: '2026-07-08', rawDescription: 'Dental Ins Payment - Altus', paymentCents: 0, balanceCents: 63900 }),

    // A later narrative row.
    makeRow({ id: 'note', dateISO: '2026-07-15', rawDescription: 'PT RESCHEDULED DUE TO OFFICE', balanceCents: 63900 }),
  ];
}

export const GOLDEN_TREATMENT_IDS = ['exam', 'prophy', 'bw', 'paAdd', 'paFirst', 'filling'];

/** Question ids the golden ledger produces (mirrors questions.ts derivation). */
export const GOLDEN_QUESTION_IDS = {
  allocation: 'q:allocation:copay',
  insuranceMissing: `q:ins-missing:${[...GOLDEN_TREATMENT_IDS].sort().join(',')}`,
  insuranceFullFee: `q:ins-missing:${[...GOLDEN_TREATMENT_IDS].sort().join(',')}:fullfee`,
  waiver: `q:waiver:${['cancel', 'courtesy'].sort().join(',')}`,
};

/** The staff-review answers for the golden walkthrough. */
export function goldenAnswers(): AnswerMap {
  return {
    [GOLDEN_QUESTION_IDS.allocation]: {
      questionId: GOLDEN_QUESTION_IDS.allocation,
      optionId: 'copay',
    },
    [GOLDEN_QUESTION_IDS.insuranceMissing]: {
      questionId: GOLDEN_QUESTION_IDS.insuranceMissing,
      optionId: 'no_active',
    },
    [GOLDEN_QUESTION_IDS.insuranceFullFee]: {
      questionId: GOLDEN_QUESTION_IDS.insuranceFullFee,
      optionId: 'yes',
    },
    [GOLDEN_QUESTION_IDS.waiver]: {
      questionId: GOLDEN_QUESTION_IDS.waiver,
      optionId: 'yes',
    },
  };
}
