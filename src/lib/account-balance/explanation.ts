/**
 * Patient explanation builder — turns the reconciled ledger + staff answers
 * into the printable model. Pure derivation:
 *
 *   · nothing is allocated unless the ledger proves it or staff confirmed it
 *   · unconfirmed payments stay "Payment received" / "General account payment"
 *   · zero-net internal Dentrix adjustment blocks never reach the patient
 *   · a ledger that does not reconcile produces NO explanation at all
 */
import { formatCents, formatDateLong, formatDateShort } from './money';
import { friendlyProcedure, summaryLabelFor } from './procedure-language';
import { answerResolves, extractCarrierNames } from './questions';
import { rowDeltaCents, type CancellationWaiverLink } from './reconcile';
import type {
  AnswerMap,
  BalanceEpisode,
  Cents,
  ExplanationAdjustmentLine,
  ExplanationSection,
  InternalAdjustmentBlock,
  LedgerRow,
  PatientExplanation,
  ReadinessItem,
  ReadinessReport,
  ReconciliationResult,
  SmartQuestion,
} from './types';

export interface ExplanationInput {
  rows: LedgerRow[];
  reconciliation: ReconciliationResult;
  episode: BalanceEpisode;
  answers: AnswerMap;
  internalBlocks: InternalAdjustmentBlock[];
  waiverLinks: CancellationWaiverLink[];
  patientName: string;
}

/** Staff-confirmed insurance wording. Deterministic — one sentence per answer. */
export function insuranceStoryWording(optionId: string, carrier: string | null): string | null {
  const c = carrier?.trim() || '';
  switch (optionId) {
    case 'no_active':
      return c
        ? `${c} coverage was not active when this treatment was provided, so no ${c} insurance payment or insurance contract adjustment was applied.`
        : 'Insurance coverage was not active on this date of service, so no insurance payment or insurance contract adjustment was applied.';
    case 'active_later':
      return 'Insurance coverage became active after these services, so no insurance payment or insurance contract adjustment was applied to them.';
    case 'not_submitted':
      return 'An insurance claim has not been submitted for these services.';
    case 'denied':
      return 'The insurance claim for these services was denied, so no insurance payment was applied.';
    case 'not_covered':
      return 'These services were not covered by the dental plan, so no insurance payment was applied.';
    case 'exhausted':
      return 'Plan benefits had been used up before these services, so no insurance payment was applied.';
    case 'chose_not':
      return 'Insurance was not used for these services at the patient\'s request.';
    case 'pending':
      return 'The insurance claim for these services is still being processed.';
    default:
      return null;
  }
}

function waiverFeeTitle(feeRow: LedgerRow | undefined): string {
  if (feeRow && /no[\s-]?show/i.test(feeRow.rawDescription)) return 'No-show fee';
  return 'Late cancellation fee';
}

/**
 * Build the printable explanation. Returns null when the ledger does not
 * reconcile — a reconciliation failure may never hide behind a pretty page.
 */
export function buildPatientExplanation(input: ExplanationInput): PatientExplanation | null {
  const { rows, reconciliation, episode, answers, internalBlocks, waiverLinks, patientName } = input;
  if (!reconciliation.reconciled) return null;

  const rowById = new Map(rows.map(r => [r.id, r]));
  const episodeRows = episode.rows;

  // Rows the patient never sees: zero-net internal adjustment blocks and
  // both halves of a confirmed fee waiver (those become "other activity").
  const hiddenInternal = new Set(
    internalBlocks.filter(b => b.netsToZero).flatMap(b => b.rowIds)
  );
  const confirmedWaivers = waiverLinks.filter(link => {
    if (link.certain) return true;
    const qid = `q:waiver:${[link.feeRowId, link.creditRowId].sort().join(',')}`;
    return answers[qid]?.optionId === 'yes';
  });
  const waiverRowIds = new Set(confirmedWaivers.flatMap(l => [l.feeRowId, l.creditRowId]));

  // Insurance story confirmed for the episode's treatments (if asked).
  const episodeTreatmentIds = episodeRows
    .filter(r => r.classification === 'TREATMENT_CHARGE')
    .map(r => r.id);
  const insMissingId = `q:ins-missing:${[...episodeTreatmentIds].sort().join(',')}`;
  const insAnswer = answers[insMissingId];
  const carriers = extractCarrierNames(rows);
  const insuranceStory = insAnswer
    ? insAnswer.optionId === 'other' && (insAnswer.note ?? '').trim()
      ? (insAnswer.note ?? '').trim()
      : insuranceStoryWording(insAnswer.optionId, carriers.length === 1 ? carriers[0] : null)
    : null;

  // ---- sections -----------------------------------------------------------
  const sections: ExplanationSection[] = [];
  const generalCredits: ExplanationAdjustmentLine[] = [];
  const otherActivity: PatientExplanation['otherActivity'] = [];
  const insuranceNotes: string[] = [];
  let broughtForwardCents = episode.hasZeroAnchor ? 0 : episode.broughtForwardCents;

  // Treatment charges grouped by date of service (plus staff-confirmed
  // unknown treatments). One section per date, in ledger order.
  interface Group { dateISO: string; rows: LedgerRow[] }
  const groups: Group[] = [];
  const groupFor = (dateISO: string): Group => {
    let g = groups.find(x => x.dateISO === dateISO);
    if (!g) {
      g = { dateISO, rows: [] };
      groups.push(g);
    }
    return g;
  };

  for (const row of episodeRows) {
    if (hiddenInternal.has(row.id) || waiverRowIds.has(row.id)) continue;
    const delta = rowDeltaCents(row);
    const answer = answers[`q:unknown:${row.id}`];

    switch (row.classification) {
      case 'TREATMENT_CHARGE':
        if ((row.chargeCents ?? 0) !== 0) groupFor(row.dateISO).rows.push(row);
        break;
      case 'BALANCE_FORWARD':
        if (delta !== 0) broughtForwardCents += delta;
        break;
      case 'UNKNOWN':
        if (delta === 0) break;
        if (answer?.optionId === 'treatment') {
          groupFor(row.dateISO).rows.push(row);
        } else if (answer?.optionId === 'fee' && (answer.note ?? '').trim()) {
          sections.push(simpleSection(row.dateISO, (answer.note ?? '').trim(), delta));
        } else if (answer?.optionId === 'credit' && (answer.note ?? '').trim()) {
          generalCredits.push({ label: (answer.note ?? '').trim(), amountCents: delta });
        }
        // Unresolved UNKNOWN rows keep readiness red; nothing is invented.
        break;
      case 'CANCELLATION_OR_NO_SHOW_FEE':
        if (delta !== 0) {
          sections.push(simpleSection(row.dateISO, waiverFeeTitle(row), delta));
        }
        break;
      case 'PATIENT_PAYMENT': {
        if (delta === 0) break;
        const alloc = answers[`q:allocation:${row.id}`];
        // A confirmed copay attaches to the same-date treatment section
        // below — but only when such a section exists, so no cent can vanish.
        if (
          alloc?.optionId === 'copay' &&
          episodeRows.some(
            t => t.classification === 'TREATMENT_CHARGE' && t.dateISO === row.dateISO
          )
        ) {
          break;
        }
        const label =
          alloc?.optionId === 'general'
            ? 'General account payment'
            : alloc?.optionId === 'older_balance'
              ? 'Payment toward an older balance'
              : alloc?.optionId === 'other' && (alloc.note ?? '').trim()
                ? (alloc.note ?? '').trim()
                : 'Payment received';
        generalCredits.push({ label, amountCents: delta });
        break;
      }
      case 'INSURANCE_PAYMENT':
        // $0 postings say nothing and print nothing; real payments are
        // account-level credits (never allocated by proximity).
        if (delta !== 0) generalCredits.push({ label: 'Insurance payment received', amountCents: delta });
        break;
      case 'INSURANCE_CONTRACT_ADJUSTMENT':
        if (delta !== 0) generalCredits.push({ label: 'Insurance contract adjustment', amountCents: delta });
        break;
      case 'COURTESY_ADJUSTMENT':
        if (delta !== 0) generalCredits.push({ label: 'Courtesy adjustment', amountCents: delta });
        break;
      case 'INTERNAL_PROVIDER_ADJUSTMENT': {
        // Only rows from a NON-zero block reach here (zero blocks are hidden).
        const block = internalBlocks.find(b => !b.netsToZero && b.rowIds.includes(row.id));
        if (!block || block.rowIds[block.rowIds.length - 1] !== row.id) break; // emit once, at block end
        const qid = `q:internal:${[...block.rowIds].sort().join(',')}`;
        const blockAnswer = answers[qid];
        if (blockAnswer?.optionId === 'patient_charge' && (blockAnswer.note ?? '').trim()) {
          sections.push(simpleSection(row.dateISO, (blockAnswer.note ?? '').trim(), block.netCents));
        } else if (blockAnswer?.optionId === 'patient_credit' && (blockAnswer.note ?? '').trim()) {
          generalCredits.push({ label: (blockAnswer.note ?? '').trim(), amountCents: block.netCents });
        }
        break;
      }
      default:
        break; // ZERO_DOLLAR_EVENT — narrative rows print nothing
    }
  }

  // Materialize treatment groups into cards (in ledger order relative to
  // the simple sections already pushed — order by first date).
  for (const group of groups) {
    const services = group.rows.map(r => {
      const wording = friendlyProcedure(r.rawDescription, r.tooth);
      return { label: wording.label, amountCents: r.chargeCents ?? 0, wording, tooth: r.tooth };
    });
    const servicesTotalCents = services.reduce((s, l) => s + l.amountCents, 0);

    // Staff-confirmed copays whose payment shares the section's date.
    const adjustments: ExplanationAdjustmentLine[] = [];
    for (const row of episodeRows) {
      if (row.classification !== 'PATIENT_PAYMENT') continue;
      const alloc = answers[`q:allocation:${row.id}`];
      if (alloc?.optionId === 'copay' && row.dateISO === group.dateISO) {
        adjustments.push({
          label: 'Estimated copay/deductible collected',
          amountCents: rowDeltaCents(row),
        });
      }
    }

    const single = services.length === 1 ? services[0] : null;
    const remainingCents =
      servicesTotalCents + adjustments.reduce((s, a) => s + a.amountCents, 0);
    sections.push({
      dateLabel: group.dateISO ? formatDateLong(group.dateISO) : 'Date not read',
      title: single ? single.label : 'Dental visit',
      summaryLabel: single ? summaryLabelFor(single.wording, single.tooth) : 'Dental visit',
      services: services.map(({ label, amountCents }) => ({ label, amountCents })),
      servicesTotalCents,
      adjustments,
      insuranceAppliedCents: insuranceStory !== null ? 0 : null,
      remainingCents,
      contextNote: insuranceStory ?? '',
      // Keep ledger ordering: groups were created in ledger order but simple
      // sections may already sit in the list; sorted below by date.
    });
  }
  sections.sort((a, b) => sectionDateKey(a) - sectionDateKey(b));

  // Confirmed waivers → "Other account activity".
  for (const link of confirmedWaivers) {
    const feeRow = rowById.get(link.feeRowId);
    const title = waiverFeeTitle(feeRow);
    otherActivity.push({
      title,
      lines: [
        { label: title, amountCents: link.amountCents },
        { label: 'Courtesy adjustment', amountCents: -link.amountCents },
      ],
      netCents: 0,
      note: 'Amount due from this fee: $0.00',
    });
  }

  // A confirmed denial on a $0 posting earns a patient-facing sentence.
  for (const row of episodeRows) {
    if (row.classification !== 'INSURANCE_PAYMENT' || rowDeltaCents(row) !== 0) continue;
    const zeroAnswer = answers[`q:zero-ins:${row.id}`];
    if (zeroAnswer?.optionId === 'denied') {
      insuranceNotes.push('An insurance claim on this account was denied.');
    }
  }

  // ---- calculation --------------------------------------------------------
  const calculation: PatientExplanation['calculation'] = [];
  if (broughtForwardCents !== 0) {
    calculation.push({
      label: `Balance brought forward from activity before ${episode.firstImportedDateISO ? formatDateShort(episode.firstImportedDateISO) : 'the imported ledger'}`,
      amountCents: broughtForwardCents,
    });
  }
  // Disambiguate duplicate summary labels with their dates.
  const labelCounts = new Map<string, number>();
  for (const s of sections) labelCounts.set(s.summaryLabel, (labelCounts.get(s.summaryLabel) ?? 0) + 1);
  for (const s of sections) {
    const label =
      (labelCounts.get(s.summaryLabel) ?? 0) > 1 && s.dateLabel !== ''
        ? `${s.summaryLabel} (${s.dateLabel})`
        : s.summaryLabel;
    calculation.push({ label, amountCents: s.remainingCents });
  }
  for (const credit of generalCredits) {
    calculation.push({ label: credit.label, amountCents: credit.amountCents });
  }

  const calculationTotalCents = calculation.reduce((s, l) => s + l.amountCents, 0);
  const currentBalanceCents = reconciliation.displayedEndingBalanceCents ?? 0;

  const statementThroughDateISO = rows.reduce(
    (max, r) => (r.dateISO > max ? r.dateISO : max),
    ''
  );

  return {
    patientName,
    statementThroughDateISO,
    currentBalanceCents,
    broughtForward:
      broughtForwardCents !== 0
        ? { amountCents: broughtForwardCents, beforeDateISO: episode.firstImportedDateISO }
        : null,
    sections,
    generalCredits,
    otherActivity,
    insuranceNotes,
    calculation,
    calculationTotalCents,
    reconciled: calculationTotalCents === currentBalanceCents,
  };
}

function simpleSection(dateISO: string, title: string, amountCents: Cents): ExplanationSection {
  return {
    dateLabel: dateISO ? formatDateLong(dateISO) : 'Date not read',
    title,
    summaryLabel: title,
    services: [{ label: title, amountCents }],
    servicesTotalCents: amountCents,
    adjustments: [],
    insuranceAppliedCents: null,
    remainingCents: amountCents,
    contextNote: '',
  };
}

function sectionDateKey(section: ExplanationSection): number {
  // dateLabel is "February 12, 2026" — recover a sortable key from it.
  const parsed = Date.parse(section.dateLabel);
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface ReadinessInput {
  rows: LedgerRow[];
  reconciliation: ReconciliationResult;
  questions: SmartQuestion[];
  answers: AnswerMap;
  patientName: string;
  patientNameConflict: boolean;
  explanation: PatientExplanation | null;
}

export function buildReadiness(input: ReadinessInput): ReadinessReport {
  const { rows, reconciliation, questions, answers, patientName, patientNameConflict, explanation } = input;

  const unresolvedRequired = questions.filter(
    q => q.required && q.options.length > 0 && !answerResolves(answers, q.id)
  );
  const unverifiedUncertain = rows.filter(
    r => r.lowConfidenceFields.length > 0 && !r.staffVerified
  );

  const items: ReadinessItem[] = [
    {
      key: 'rows',
      label: 'Ledger rows read',
      passed: rows.length > 0,
      detail: rows.length === 0 ? 'Capture at least one ledger screenshot.' : '',
    },
    {
      key: 'reconciled',
      label: 'Financial reconciliation passed',
      passed: reconciliation.reconciled,
      detail: reconciliation.reconciled
        ? ''
        : reconciliation.firstMismatchRowId
          ? 'The running balance stops matching — correct the highlighted row in Verify.'
          : 'This ledger does not reconcile yet.',
    },
    {
      key: 'single_patient',
      label: 'One patient account',
      passed: !patientNameConflict && patientName.trim() !== '',
      detail: patientNameConflict
        ? 'Multiple patient names were detected. Make sure these screenshots belong to one account.'
        : patientName.trim() === ''
          ? 'Confirm the patient name in Verify.'
          : '',
    },
    {
      key: 'ocr_verified',
      label: 'No unverified reads',
      passed: unverifiedUncertain.length === 0,
      detail:
        unverifiedUncertain.length > 0
          ? `${unverifiedUncertain.length} row${unverifiedUncertain.length === 1 ? '' : 's'} marked "Please verify" still need${unverifiedUncertain.length === 1 ? 's' : ''} a look.`
          : '',
    },
    {
      key: 'questions',
      label: 'Required staff context complete',
      passed: unresolvedRequired.length === 0,
      detail:
        unresolvedRequired.length > 0
          ? `${unresolvedRequired.length} Smart Review question${unresolvedRequired.length === 1 ? '' : 's'} still need${unresolvedRequired.length === 1 ? 's' : ''} an answer.`
          : '',
    },
    {
      key: 'matches',
      label: 'Patient explanation matches the Dentrix ending balance',
      passed: explanation !== null && explanation.reconciled,
      detail:
        explanation === null
          ? 'The explanation is generated once the ledger reconciles.'
          : explanation.reconciled
            ? ''
            : `The explanation totals ${formatCents(explanation.calculationTotalCents)} but Dentrix shows ${formatCents(explanation.currentBalanceCents)}.`,
    },
  ];

  return {
    ready: items.every(i => i.passed),
    items,
    unresolvedQuestionCount: unresolvedRequired.length,
  };
}
