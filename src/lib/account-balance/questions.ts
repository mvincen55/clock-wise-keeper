/**
 * Smart Review question engine — the heart of the feature.
 *
 * The ledger math is deterministic; the intelligence here is asking the
 * RIGHT question when the ledger cannot establish an answer, and never
 * concluding anything the staff did not confirm. Questions are generated
 * from ledger facts only, collapse across rows when one answer covers them,
 * and are limited to things that materially change the patient explanation.
 */
import { formatCents } from './money';
import { friendlyProcedure } from './procedure-language';
import {
  findCancellationWaivers,
  findInternalAdjustmentBlocks,
  rowDeltaCents,
  type CancellationWaiverLink,
} from './reconcile';
import type {
  AnswerMap,
  BalanceEpisode,
  InternalAdjustmentBlock,
  LedgerRow,
  ReconciliationResult,
  SmartQuestion,
  SmartQuestionOption,
} from './types';

const OPT = (id: string, label: string): SmartQuestionOption => ({ id, label });

export const INVESTIGATE_OPTION = OPT('investigate', 'I need to investigate');

const PAYMENT_ALLOCATION_BASE: SmartQuestionOption[] = [
  OPT('older_balance', 'Payment toward an older balance'),
  OPT('general', 'General account payment'),
  OPT('other', 'Other'),
  INVESTIGATE_OPTION,
];

export const INSURANCE_MISSING_OPTIONS: SmartQuestionOption[] = [
  OPT('no_active', 'Patient had no active dental insurance on the date of service'),
  OPT('active_later', 'Insurance became active later'),
  OPT('not_submitted', 'Claim was never submitted'),
  OPT('denied', 'Claim was denied'),
  OPT('not_covered', 'Service was not covered'),
  OPT('exhausted', 'Benefits were exhausted'),
  OPT('chose_not', 'Patient chose not to use insurance'),
  OPT('pending', 'Claim is still pending'),
  OPT('different_carrier', 'Different insurance should have been billed'),
  OPT('other', 'Other'),
  INVESTIGATE_OPTION,
];

const FULL_FEE_OPTIONS: SmartQuestionOption[] = [
  OPT('yes', 'Yes'),
  OPT('no_adjustment', 'No, another adjustment applies'),
  INVESTIGATE_OPTION,
];

const UNKNOWN_OPTIONS: SmartQuestionOption[] = [
  OPT('treatment', 'This is a treatment charge'),
  OPT('fee', 'A fee or charge (describe it below)'),
  OPT('credit', 'A payment or credit (describe it below)'),
  INVESTIGATE_OPTION,
];

const INTERNAL_NONZERO_OPTIONS: SmartQuestionOption[] = [
  OPT('patient_charge', 'A charge the patient owes (describe it below)'),
  OPT('patient_credit', 'A credit or adjustment for the patient (describe it below)'),
  INVESTIGATE_OPTION,
];

const WAIVER_OPTIONS: SmartQuestionOption[] = [
  OPT('yes', 'Yes — the fee was waived'),
  OPT('no', 'No — they are unrelated'),
  INVESTIGATE_OPTION,
];

const ZERO_POSTING_OPTIONS: SmartQuestionOption[] = [
  OPT('processed_zero', 'Claim processed — nothing was payable'),
  OPT('denied', 'Claim was denied'),
  OPT('record_only', 'Record-keeping posting only'),
  OPT('other', 'Other'),
  INVESTIGATE_OPTION,
];

function questionId(kind: string, rowIds: string[]): string {
  return `q:${kind}:${[...rowIds].sort().join(',')}`;
}

/**
 * Options whose selection needs a staff note to count as resolved
 * ("Other"/describe-below answers).
 */
const NOTE_REQUIRED_OPTIONS = new Set(['other', 'fee', 'credit', 'patient_charge', 'patient_credit']);

/** An answer resolves its question unless it is "investigate" or an empty "describe". */
export function answerResolves(answers: AnswerMap, id: string): boolean {
  const answer = answers[id];
  if (!answer) return false;
  if (answer.optionId === 'investigate') return false;
  if (NOTE_REQUIRED_OPTIONS.has(answer.optionId) && !(answer.note ?? '').trim()) return false;
  return true;
}

/**
 * Pull carrier names the ledger itself mentions ("Dental Ins Payment - Altus",
 * "Altus Write-Off"). Used ONLY to phrase a suggestion question — never to
 * conclude coverage.
 */
export function extractCarrierNames(rows: LedgerRow[]): string[] {
  const names = new Set<string>();
  for (const row of rows) {
    if (row.classification === 'INSURANCE_PAYMENT') {
      const m = row.rawDescription.match(/ins(?:urance)?\.?\s+(?:payment|pmt|check|ck)\s*[-–—:]\s*([A-Za-z][A-Za-z& ]{1,30})/i);
      if (m) names.add(m[1].trim());
    }
    if (row.classification === 'INSURANCE_CONTRACT_ADJUSTMENT') {
      const m = row.rawDescription.match(/^([A-Za-z][A-Za-z& ]{1,30}?)\s+write[\s-]?off/i);
      if (m) names.add(m[1].trim());
    }
  }
  return [...names];
}

export interface SmartReviewInput {
  rows: LedgerRow[];
  reconciliation: ReconciliationResult;
  episode: BalanceEpisode;
  answers: AnswerMap;
  /** More than one distinct patient name detected. */
  patientNameConflict: boolean;
}

export interface SmartReviewDerived {
  questions: SmartQuestion[];
  internalBlocks: InternalAdjustmentBlock[];
  waiverLinks: CancellationWaiverLink[];
}

export function buildSmartReview(input: SmartReviewInput): SmartReviewDerived {
  const { rows, reconciliation, episode, answers, patientNameConflict } = input;
  const questions: SmartQuestion[] = [];
  const rowById = new Map(rows.map(r => [r.id, r]));

  // 1 — ledger/reconciliation failure. Not answerable with options; it
  // resolves only by correcting the read in Verify.
  if (rows.length > 0 && !reconciliation.reconciled) {
    const mismatchRow = reconciliation.firstMismatchRowId
      ? rowById.get(reconciliation.firstMismatchRowId)
      : undefined;
    questions.push({
      id: questionId('reconcile', [reconciliation.firstMismatchRowId ?? 'ending']),
      kind: 'reconciliation_failure',
      priority: 1,
      required: true,
      prompt: mismatchRow
        ? `The running balance stops matching at the ${mismatchRow.dateISO || 'undated'} row "${mismatchRow.rawDescription || '(no description)'}". Correct the read in Verify before continuing.`
        : 'This ledger does not reconcile yet. Correct the read in Verify before continuing.',
      options: [],
      rowIds: reconciliation.firstMismatchRowId ? [reconciliation.firstMismatchRowId] : [],
      amountCents: Math.abs(reconciliation.differenceCents),
    });
  }

  // 1 — multiple patient names is a hard stop too.
  if (patientNameConflict) {
    questions.push({
      id: questionId('names', ['all']),
      kind: 'multiple_patient_names',
      priority: 1,
      required: true,
      prompt:
        'Multiple patient names were detected. Make sure these screenshots belong to one account, then fix the Patient column in Verify.',
      options: [],
      rowIds: [],
    });
  }

  const episodeRows = episode.rows;

  // 2 — unknown monetary transactions inside the episode.
  for (const row of episodeRows) {
    if (row.classification !== 'UNKNOWN') continue;
    const amount = rowDeltaCents(row);
    if (amount === 0) continue;
    questions.push({
      id: questionId('unknown', [row.id]),
      kind: 'unknown_transaction',
      priority: 2,
      required: true,
      prompt: `${row.dateISO ? `On ${row.dateISO}, ` : ''}"${row.rawDescription || '(no description)'}" moved ${formatCents(amount)} but Purple Envelope can't tell what it is. What does it represent?`,
      options: UNKNOWN_OPTIONS,
      rowIds: [row.id],
      amountCents: amount,
    });
  }

  // 3 — internal adjustment blocks that do not net to zero.
  const internalBlocks = findInternalAdjustmentBlocks(rows);
  for (const block of internalBlocks) {
    if (block.netsToZero) continue;
    // Only blocks that touch the episode can affect the current balance.
    const inEpisode = block.rowIds.some(id => episodeRows.some(r => r.id === id));
    if (!inEpisode) continue;
    questions.push({
      id: questionId('internal', block.rowIds),
      kind: 'internal_adjustment_nonzero',
      priority: 3,
      required: true,
      prompt: `These internal Dentrix adjustments do not cancel out. What does the remaining ${formatCents(block.netCents)} represent?`,
      options: INTERNAL_NONZERO_OPTIONS,
      rowIds: block.rowIds,
      amountCents: block.netCents,
    });
  }

  // 4 — ambiguous patient-payment allocation. Chronology is not proof:
  // Purple Envelope may suggest, staff must confirm.
  const episodeTreatments = episodeRows.filter(r => r.classification === 'TREATMENT_CHARGE');
  for (const row of episodeRows) {
    if (row.classification !== 'PATIENT_PAYMENT') continue;
    const amount = rowDeltaCents(row);
    if (amount === 0) continue;
    if (episodeTreatments.length === 0) continue;
    const sameDate = episodeTreatments.filter(t => t.dateISO !== '' && t.dateISO === row.dateISO);
    const sameDateLabel =
      sameDate.length === 1
        ? friendlyProcedure(sameDate[0].rawDescription, sameDate[0].tooth).label
        : sameDate.length > 1
          ? 'the dental visit'
          : '';
    const options = sameDate.length > 0
      ? [OPT('copay', 'Estimated copay/deductible for this treatment'), ...PAYMENT_ALLOCATION_BASE]
      : PAYMENT_ALLOCATION_BASE;
    questions.push({
      id: questionId('allocation', [row.id]),
      kind: 'payment_allocation',
      priority: 4,
      required: false,
      prompt: sameDateLabel
        ? `${formatCents(Math.abs(amount))} was collected on the date of ${sameDateLabel === 'the dental visit' ? sameDateLabel : `the ${lowerFirst(sameDateLabel)}`}. What was this payment for?`
        : `${formatCents(Math.abs(amount))} was collected${row.dateISO ? ` on ${row.dateISO}` : ''}. What was this payment for?`,
      options,
      rowIds: [row.id],
      amountCents: amount,
    });
  }

  // 5 — treatment with no insurance participation. One collapsed question
  // for the whole episode, not one per charge.
  const insuranceAppliedCents = episodeRows
    .filter(
      r =>
        r.classification === 'INSURANCE_PAYMENT' ||
        r.classification === 'INSURANCE_CONTRACT_ADJUSTMENT'
    )
    .reduce((s, r) => s + rowDeltaCents(r), 0);
  const treatmentTotal = episodeTreatments.reduce((s, r) => s + (r.chargeCents ?? 0), 0);
  let insuranceMissingId: string | null = null;
  if (episodeTreatments.length > 0 && insuranceAppliedCents === 0) {
    const carriers = extractCarrierNames(rows);
    const suggestion =
      carriers.length === 1
        ? ` Later account activity references ${carriers[0]}. Was ${carriers[0]} expected to cover these services?`
        : '';
    insuranceMissingId = questionId('ins-missing', episodeTreatments.map(r => r.id));
    questions.push({
      id: insuranceMissingId,
      kind: 'insurance_missing',
      priority: 5,
      required: true,
      prompt: `No insurance payment or insurance contract adjustment appears for ${formatCents(treatmentTotal)} of treatment. Why wasn't insurance applied?${suggestion}`,
      options: INSURANCE_MISSING_OPTIONS,
      rowIds: episodeTreatments.map(r => r.id),
      amountCents: treatmentTotal,
    });

    // Follow-up once coverage is confirmed inactive: should the full office
    // fee remain patient responsibility?
    const parentAnswer = answers[insuranceMissingId];
    if (parentAnswer && (parentAnswer.optionId === 'no_active' || parentAnswer.optionId === 'active_later')) {
      questions.push({
        id: `${insuranceMissingId}:fullfee`,
        kind: 'insurance_full_fee',
        priority: 5,
        required: true,
        prompt:
          'Since coverage was not active, should the full office fee remain the patient\'s responsibility with no insurance contract adjustment?',
        options: FULL_FEE_OPTIONS,
        rowIds: episodeTreatments.map(r => r.id),
        amountCents: treatmentTotal,
        followUpOf: insuranceMissingId,
      });
    }
  }

  // 6 — a $0.00 insurance posting that nothing else explains. When the
  // insurance-missing question already covers the episode's insurance story,
  // the $0 posting is part of that story and is not asked about twice.
  if (insuranceMissingId === null) {
    for (const row of episodeRows) {
      if (row.classification !== 'INSURANCE_PAYMENT') continue;
      if (rowDeltaCents(row) !== 0) continue;
      questions.push({
        id: questionId('zero-ins', [row.id]),
        kind: 'zero_insurance_posting',
        priority: 6,
        required: true,
        prompt: `Insurance posted $0.00${row.dateISO ? ` on ${row.dateISO}` : ''} ("${row.rawDescription}"). What happened with this claim?`,
        options: ZERO_POSTING_OPTIONS,
        rowIds: [row.id],
        amountCents: 0,
      });
    }
  }

  // 7 — courtesy credit / cancellation fee relationships that are not
  // certain from the ledger itself.
  const waiverLinks = findCancellationWaivers(rows);
  for (const link of waiverLinks) {
    if (link.certain) continue;
    const fee = rowById.get(link.feeRowId);
    const inEpisode = episodeRows.some(r => r.id === link.feeRowId || r.id === link.creditRowId);
    if (!inEpisode) continue;
    questions.push({
      id: questionId('waiver', [link.feeRowId, link.creditRowId]),
      kind: 'courtesy_waiver',
      priority: 7,
      required: false,
      prompt: `Was the ${formatCents(link.amountCents)} courtesy credit used to waive the ${fee && /no[\s-]?show/i.test(fee.rawDescription) ? 'no-show' : 'cancellation'} fee?`,
      options: WAIVER_OPTIONS,
      rowIds: [link.feeRowId, link.creditRowId],
      amountCents: link.amountCents,
    });
  }

  questions.sort((a, b) => a.priority - b.priority);
  return { questions, internalBlocks, waiverLinks };
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
