/**
 * Ledger session state — a pure reducer so the workflow logic is testable
 * and the React page stays an orchestrator, not an accountant.
 *
 * HIPAA boundary: this state lives ONLY in a useReducer inside the
 * /account-balance page. It is never serialized, persisted, logged, or sent
 * anywhere; leaving the page (or Start over) destroys it.
 */
import { classifyTransaction } from './classify';
import { mergeCaptureRows, nextRowId } from './parser';
import type {
  AnswerMap,
  BalanceDerivedCorrection,
  LedgerVerifyField,
  LedgerRow,
  LedgerClassification,
} from './types';

export type WorkflowStage = 'capture' | 'verify' | 'review' | 'explanation';

export interface LedgerSessionState {
  rows: LedgerRow[];
  captureCount: number;
  /** Staff-edited patient name; null = infer from the ledger. */
  patientNameOverride: string | null;
  answers: AnswerMap;
  stage: WorkflowStage;
  /** Rows removed as screenshot-boundary overlap on the last capture. */
  lastOverlapRemoved: number | null;
  printed: boolean;
}

export const EMPTY_SESSION: LedgerSessionState = {
  rows: [],
  captureCount: 0,
  patientNameOverride: null,
  answers: {},
  stage: 'capture',
  lastOverlapRemoved: null,
  printed: false,
};

export interface RowPatch {
  dateISO?: string;
  tooth?: string;
  rawDescription?: string;
  patientName?: string;
  chargeCents?: number | null;
  paymentCents?: number | null;
  balanceCents?: number | null;
  classification?: LedgerClassification;
}

export type LedgerSessionAction =
  | { type: 'addCapture'; rows: LedgerRow[] }
  | { type: 'updateRow'; rowId: string; patch: RowPatch }
  | { type: 'markVerified'; rowId: string }
  | { type: 'deleteRow'; rowId: string }
  | { type: 'addRowAfter'; rowId: string | null }
  | { type: 'moveRow'; rowId: string; direction: -1 | 1 }
  | { type: 'setPatientName'; name: string }
  | { type: 'answer'; questionId: string; optionId: string; note?: string }
  | { type: 'clearAnswer'; questionId: string }
  | { type: 'setStage'; stage: WorkflowStage }
  | { type: 'markPrinted' }
  | { type: 'clearAll' };

/** Fields a staff edit verifies (clears the "Please verify" flag for). */
const PATCH_TO_FIELD: Array<[keyof RowPatch, LedgerVerifyField]> = [
  ['dateISO', 'date'],
  ['chargeCents', 'charge'],
  ['paymentCents', 'payment'],
  ['balanceCents', 'balance'],
  ['patientName', 'patient'],
];

/** Money patches that supersede a balance-derived correction on that cell. */
const PATCH_TO_CORRECTION: Array<[keyof RowPatch, BalanceDerivedCorrection['field']]> = [
  ['chargeCents', 'charge'],
  ['paymentCents', 'payment'],
  ['balanceCents', 'balance'],
];

export function ledgerSessionReducer(
  state: LedgerSessionState,
  action: LedgerSessionAction
): LedgerSessionState {
  switch (action.type) {
    case 'addCapture': {
      const { merged, overlapRemoved } = mergeCaptureRows(state.rows, action.rows);
      return {
        ...state,
        rows: merged,
        captureCount: state.captureCount + 1,
        lastOverlapRemoved: overlapRemoved,
      };
    }
    case 'updateRow':
      return {
        ...state,
        rows: state.rows.map(row => {
          if (row.id !== action.rowId) return row;
          const next: LedgerRow = { ...row, ...action.patch, staffVerified: true };
          // Editing a field settles its "Please verify" flag.
          const verified = PATCH_TO_FIELD
            .filter(([key]) => key in action.patch)
            .map(([, field]) => field);
          next.lowConfidenceFields = row.lowConfidenceFields.filter(
            f => !verified.includes(f)
          );
          // A staff-typed money value supersedes the balance-derived
          // correction note for that cell.
          if (next.corrections) {
            const superseded = PATCH_TO_CORRECTION
              .filter(([key]) => key in action.patch)
              .map(([, field]) => field);
            const remaining = next.corrections.filter(c => !superseded.includes(c.field));
            next.corrections = remaining.length > 0 ? remaining : undefined;
          }
          // Re-run the deterministic classifier when the facts changed and
          // the staff did not set the classification themselves.
          const factsChanged =
            action.patch.rawDescription !== undefined ||
            action.patch.tooth !== undefined ||
            action.patch.chargeCents !== undefined ||
            action.patch.paymentCents !== undefined;
          if (factsChanged && action.patch.classification === undefined) {
            const reclassified = classifyTransaction({
              rawDescription: next.rawDescription,
              tooth: next.tooth,
              chargeCents: next.chargeCents,
              paymentCents: next.paymentCents,
            });
            next.classification = reclassified.classification;
            next.classificationConfidence = reclassified.confidence;
          }
          if (action.patch.classification !== undefined) {
            next.classificationConfidence = 1;
          }
          return next;
        }),
      };
    case 'markVerified':
      return {
        ...state,
        rows: state.rows.map(row =>
          row.id === action.rowId
            ? { ...row, staffVerified: true, lowConfidenceFields: [] }
            : row
        ),
      };
    case 'deleteRow':
      return { ...state, rows: state.rows.filter(row => row.id !== action.rowId) };
    case 'addRowAfter': {
      const blank: LedgerRow = {
        id: nextRowId(),
        sourceCaptureId: 'manual',
        sourceSequence: 0,
        dateISO: '',
        tooth: '',
        rawDescription: '',
        patientName: '',
        chargeCents: null,
        paymentCents: null,
        balanceCents: null,
        ocrConfidence: 1,
        lowConfidenceFields: [],
        classification: 'UNKNOWN',
        classificationConfidence: 0,
        staffVerified: true,
      };
      if (action.rowId === null) return { ...state, rows: [...state.rows, blank] };
      const index = state.rows.findIndex(r => r.id === action.rowId);
      const rows = [...state.rows];
      rows.splice(index === -1 ? rows.length : index + 1, 0, blank);
      return { ...state, rows };
    }
    case 'moveRow': {
      const index = state.rows.findIndex(r => r.id === action.rowId);
      const target = index + action.direction;
      if (index === -1 || target < 0 || target >= state.rows.length) return state;
      const rows = [...state.rows];
      [rows[index], rows[target]] = [rows[target], rows[index]];
      return { ...state, rows };
    }
    case 'setPatientName':
      return { ...state, patientNameOverride: action.name };
    case 'answer':
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.questionId]: {
            questionId: action.questionId,
            optionId: action.optionId,
            note: action.note,
          },
        },
      };
    case 'clearAnswer': {
      const answers = { ...state.answers };
      delete answers[action.questionId];
      return { ...state, answers };
    }
    case 'setStage':
      return { ...state, stage: action.stage };
    case 'markPrinted':
      return { ...state, printed: true };
    case 'clearAll':
      return { ...EMPTY_SESSION };
    default:
      return state;
  }
}

/** True when the session holds anything patient-specific. */
export function sessionHasPatientData(state: LedgerSessionState): boolean {
  return (
    state.rows.length > 0 ||
    (state.patientNameOverride ?? '') !== '' ||
    Object.keys(state.answers).length > 0
  );
}
