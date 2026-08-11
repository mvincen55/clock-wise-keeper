/**
 * Account Balance Explainer — shared types.
 *
 * HIPAA boundary: every type in this module describes patient financial data
 * that exists ONLY in browser memory for the active session. Nothing in this
 * directory (or anything importing these types) may send ledger rows, patient
 * names, staff answers, or generated explanations to Supabase, storage,
 * localStorage/sessionStorage/IndexedDB, URLs, analytics, remote AI, or logs.
 * The ledger screenshot itself is destroyed immediately after local OCR
 * (schedule-reader infrastructure); only these parsed structures remain, and
 * they die with the page.
 */

export type Cents = number;

export type LedgerClassification =
  | 'BALANCE_FORWARD'
  | 'TREATMENT_CHARGE'
  | 'PATIENT_PAYMENT'
  | 'INSURANCE_PAYMENT'
  | 'INSURANCE_CONTRACT_ADJUSTMENT'
  | 'COURTESY_ADJUSTMENT'
  | 'CANCELLATION_OR_NO_SHOW_FEE'
  | 'INTERNAL_PROVIDER_ADJUSTMENT'
  | 'ZERO_DOLLAR_EVENT'
  | 'UNKNOWN';

export const CLASSIFICATION_LABELS: Record<LedgerClassification, string> = {
  BALANCE_FORWARD: 'Balance forward',
  TREATMENT_CHARGE: 'Treatment charge',
  PATIENT_PAYMENT: 'Patient payment',
  INSURANCE_PAYMENT: 'Insurance payment',
  INSURANCE_CONTRACT_ADJUSTMENT: 'Insurance contract adjustment',
  COURTESY_ADJUSTMENT: 'Courtesy adjustment',
  CANCELLATION_OR_NO_SHOW_FEE: 'Cancellation / no-show fee',
  INTERNAL_PROVIDER_ADJUSTMENT: 'Internal Dentrix adjustment',
  ZERO_DOLLAR_EVENT: 'Zero-dollar event',
  UNKNOWN: 'Unknown',
};

/** Fields the Verify UI can flag for targeted human review. */
export type LedgerVerifyField = 'date' | 'charge' | 'payment' | 'balance' | 'patient';

/** @deprecated Original name for {@link LedgerVerifyField}; kept for compatibility. */
export type LedgerMoneyField = LedgerVerifyField;

/**
 * A money cell whose value was corrected or filled from the ledger's own
 * running-balance math (delta = displayed balance − previous balance).
 * The original OCR reading is preserved so staff can see exactly what
 * happened — in session memory only, like every other row field.
 */
export interface BalanceDerivedCorrection {
  field: 'charge' | 'payment' | 'balance';
  /** What OCR read ('' when the cell was blank/unreadable). */
  ocrText: string;
  /** What that reading parsed to (null when unparseable/blank). */
  ocrCents: Cents | null;
  /** The value the running balances mathematically require. */
  correctedCents: Cents;
}

/** One reconstructed ledger transaction. In-memory only. */
export interface LedgerRow {
  id: string;
  /** Which capture this row came from (for retake/debug UI, never persisted). */
  sourceCaptureId: string;
  /** Row order within its capture. */
  sourceSequence: number;
  /** ISO yyyy-mm-dd, or '' when the date could not be read. */
  dateISO: string;
  tooth: string;
  /** The raw Dentrix wording, kept for staff review during the session. */
  rawDescription: string;
  /** PATIENT column value as read (Dentrix repeats the patient name here). */
  patientName: string;
  /** null = blank cell. Charges are positive. */
  chargeCents: Cents | null;
  /** null = blank cell. Dentrix prints payments/credits as negative numbers. */
  paymentCents: Cents | null;
  /** Displayed running balance, null when the column was blank/unreadable. */
  balanceCents: Cents | null;
  /** 0–1 mean OCR confidence for the source line. */
  ocrConfidence: number;
  /** 0–1 mean OCR confidence of the PATIENT cell (absent = no cell read). */
  patientNameConfidence?: number;
  /** Money cells repaired/filled from the running-balance checksum. */
  corrections?: BalanceDerivedCorrection[];
  /**
   * Fields needing targeted human review — only what neither OCR confidence
   * nor the running-balance math could settle. The UI shows "Please verify".
   */
  lowConfidenceFields: LedgerVerifyField[];
  classification: LedgerClassification;
  /** 0–1 — how confidently the deterministic rules classified this row. */
  classificationConfidence: number;
  /** Staff explicitly confirmed/edited this row. */
  staffVerified: boolean;
}

/** Result of parsing one capture. Images are already destroyed by now. */
export interface ParsedLedgerCapture {
  captureId: string;
  rows: LedgerRow[];
  headerFound: boolean;
  /** 0–1 mean confidence across all words in the crop. */
  meanConfidence: number;
}

// ---------------------------------------------------------------------------
// Reconciliation
// ---------------------------------------------------------------------------

export interface RowReconciliation {
  rowId: string;
  /** Balance the math expects after this row. */
  expectedBalanceCents: Cents;
  /** False when a displayed balance disagrees with the math. */
  matches: boolean;
  /**
   * False only when THIS row's charge+payment disagrees with how the
   * displayed balances actually moved around it. Unlike `matches` (which
   * cascades once the running total diverges), this pinpoints culprit rows,
   * so the UI can highlight the actual problem instead of everything after it.
   */
  deltaMatches: boolean;
}

export interface ReconciliationResult {
  /** True when every displayed running balance agrees with the math. */
  reconciled: boolean;
  rowResults: RowReconciliation[];
  /** First row whose displayed balance stops matching, if any. */
  firstMismatchRowId: string | null;
  /** Last displayed running balance in the ledger (Dentrix's ending balance). */
  displayedEndingBalanceCents: Cents | null;
  /** Purple Envelope's independently reconstructed ending balance. */
  reconstructedEndingBalanceCents: Cents;
  /** displayed − reconstructed (0 when reconciled). */
  differenceCents: Cents;
  /** Balance implied before the first imported row. */
  openingBalanceCents: Cents;
}

/** The slice of ledger history that actually creates the current balance. */
export interface BalanceEpisode {
  /** Index into the merged row list where the episode starts. */
  startIndex: number;
  /** Rows from the most recent $0.00 anchor forward. */
  rows: LedgerRow[];
  /** True when a $0.00 running balance anchors the episode. */
  hasZeroAnchor: boolean;
  /**
   * Balance carried into the episode when there is no zero anchor
   * ("Balance brought forward from activity before [first date]").
   */
  broughtForwardCents: Cents;
  /** First imported date, for the brought-forward wording. */
  firstImportedDateISO: string;
}

/** A contiguous run of internal Dentrix adjustments. */
export interface InternalAdjustmentBlock {
  rowIds: string[];
  netCents: Cents;
  /** Net exactly $0.00 — provably financial noise, hidden from the patient. */
  netsToZero: boolean;
}

// ---------------------------------------------------------------------------
// Smart Review questions
// ---------------------------------------------------------------------------

export type SmartQuestionKind =
  | 'reconciliation_failure'
  | 'unknown_transaction'
  | 'internal_adjustment_nonzero'
  | 'payment_allocation'
  | 'insurance_missing'
  | 'insurance_full_fee'
  | 'zero_insurance_posting'
  | 'courtesy_waiver'
  | 'multiple_patient_names';

export interface SmartQuestionOption {
  id: string;
  label: string;
}

export interface SmartQuestion {
  /** Stable id derived from kind + involved rows, so answers survive re-derivation. */
  id: string;
  kind: SmartQuestionKind;
  /** Lower number = asked first (spec priority order). */
  priority: number;
  /** Required questions block READY FOR PATIENT until answered. */
  required: boolean;
  prompt: string;
  options: SmartQuestionOption[];
  /** Rows this question is about. */
  rowIds: string[];
  /** Dollar amount at stake, when one exists. */
  amountCents?: Cents;
  /** Set when this question only exists because of an earlier answer. */
  followUpOf?: string;
}

export interface SmartAnswer {
  questionId: string;
  optionId: string;
  /** Optional staff note (e.g. wording for an "Other" answer). Memory only. */
  note?: string;
}

export type AnswerMap = Record<string, SmartAnswer>;

// ---------------------------------------------------------------------------
// Patient explanation (the derived, printable model)
// ---------------------------------------------------------------------------

export interface ExplanationServiceLine {
  /** Patient-friendly wording (deterministic mapping; staff-verified if unknown). */
  label: string;
  amountCents: Cents;
}

export interface ExplanationAdjustmentLine {
  label: string;
  /** Negative for credits. */
  amountCents: Cents;
}

/** One card in "WHY YOU OWE THIS AMOUNT". */
export interface ExplanationSection {
  /** e.g. "February 12, 2026". */
  dateLabel: string;
  /** Card heading, e.g. "Dental visit" or "3-surface tooth-colored filling, tooth #29". */
  title: string;
  /** Short label for the balance calculation, e.g. "Tooth #29 filling". */
  summaryLabel: string;
  services: ExplanationServiceLine[];
  servicesTotalCents: Cents;
  /** Confirmed allocations/credits (negative amounts). */
  adjustments: ExplanationAdjustmentLine[];
  /** "Insurance applied: $0.00" line shown when staff confirmed the story. */
  insuranceAppliedCents: Cents | null;
  remainingCents: Cents;
  /** Small staff-confirmed context sentence under the card. */
  contextNote: string;
}

export interface ExplanationActivityItem {
  title: string;
  lines: ExplanationAdjustmentLine[];
  netCents: Cents;
  note: string;
}

export interface ExplanationCalcLine {
  label: string;
  amountCents: Cents;
}

export interface PatientExplanation {
  patientName: string;
  statementThroughDateISO: string;
  currentBalanceCents: Cents;
  /** Non-null when the balance includes pre-import history. */
  broughtForward: { amountCents: Cents; beforeDateISO: string } | null;
  sections: ExplanationSection[];
  /** Account-level payments/credits not allocated to a section. */
  generalCredits: ExplanationAdjustmentLine[];
  /** "Other account activity" — fee-and-waiver stories etc. */
  otherActivity: ExplanationActivityItem[];
  /** Staff-confirmed insurance sentences. */
  insuranceNotes: string[];
  calculation: ExplanationCalcLine[];
  /** Sum of calculation lines — must equal currentBalanceCents. */
  calculationTotalCents: Cents;
  /** True when the calculation reproduces the Dentrix ending balance. */
  reconciled: boolean;
}

// ---------------------------------------------------------------------------
// Readiness
// ---------------------------------------------------------------------------

export interface ReadinessItem {
  key: string;
  label: string;
  passed: boolean;
  /** Staff-useful detail when not passed. */
  detail: string;
}

export interface ReadinessReport {
  ready: boolean;
  items: ReadinessItem[];
  unresolvedQuestionCount: number;
}
