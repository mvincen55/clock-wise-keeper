/**
 * Schedule Reader — shared types.
 *
 * The Schedule Reader turns a privacy-view schedule screenshot into sanitized
 * operational metrics, entirely on this device. Nothing in this directory may
 * upload an image, raw OCR text, or schedule notes anywhere — not to Supabase,
 * not to an AI gateway, not to logs. The only things that ever leave this
 * pipeline are the structured, aggregate metric objects defined here, and
 * every one of them is checked by the deterministic Metrics Referee first.
 */

/** Error codes — the ONLY diagnostic detail errors may carry. Never text from the screenshot. */
export type ScheduleReaderErrorCode =
  | 'CAPTURE_PERMISSION_DENIED'
  | 'CAPTURE_UNSUPPORTED'
  | 'CAPTURE_FAILED'
  | 'OCR_ASSETS_MISSING'
  | 'OCR_FAILED'
  | 'PRIVACY_CHECK_FAILED'
  | 'LAYOUT_NOT_RECOGNIZED'
  | 'LOW_CONFIDENCE'
  | 'METRIC_VALIDATION_FAILED'
  | 'PROCESSING_CANCELLED';

export class ScheduleReaderError extends Error {
  readonly code: ScheduleReaderErrorCode;
  /** Machine-readable details only (counts, field names). NEVER screenshot content. */
  readonly detail?: Record<string, number | string | boolean>;

  constructor(code: ScheduleReaderErrorCode, detail?: Record<string, number | string | boolean>) {
    // The code is the whole message on purpose — see the module header.
    super(code);
    this.name = 'ScheduleReaderError';
    this.code = code;
    this.detail = detail;
  }
}

// ---------------------------------------------------------------------------
// OCR geometry (in-memory only — never persisted, never sent anywhere)
// ---------------------------------------------------------------------------

export interface OcrBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface OcrWord {
  text: string;
  bbox: OcrBox;
  confidence: number; // 0–100 (tesseract convention)
}

/** A transient frame under processing. Exists only in memory. */
export interface CaptureFrame {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
  /** Object URLs created for this frame, revoked by destroyCapture. */
  objectUrls: string[];
  /** Media tracks that produced the frame, stopped immediately after grab. */
  tracks: MediaStreamTrack[];
}

// ---------------------------------------------------------------------------
// Layout profiles (the sanitized calibration output — safe to store)
// ---------------------------------------------------------------------------

export type ColumnKind = 'provider' | 'overflow' | 'non_clinical';

export interface LayoutColumn {
  /** Relative horizontal position of the column, 0–1 of image width. */
  xStart: number;
  xEnd: number;
  kind: ColumnKind;
  /** Provider label the office assigned (a provider/room name — staff, not patients). */
  providerLabel: string | null;
  providerRole: OperationalRole | null;
  department: Department | null;
  /** Linked employee, when the office mapped the column to a person. */
  employeeId: string | null;
}

export type ScheduleStatus =
  | 'scheduled'
  | 'completed'
  | 'cancelled'
  | 'no_show'
  | 'moved'
  | 'blocked'
  | 'open';

export interface StatusLegendEntry {
  status: ScheduleStatus;
  /** Representative color, sRGB 0–255. */
  r: number;
  g: number;
  b: number;
  /** Max per-channel distance for a match. */
  tolerance: number;
}

export interface TimeGridConfig {
  /** Minutes represented by one grid row (5/10/15 are common). */
  minutesPerRow: number;
  /** Relative y of the first bookable row, 0–1 of image height. */
  yStart: number;
  yEnd: number;
  /** Visible working-day range, minutes from midnight local. */
  dayStartMinutes: number;
  dayEndMinutes: number;
}

/**
 * The sanitized layout profile. This is the ONLY calibration output that may
 * be stored. It may never contain screenshots, OCR text, patient text, or
 * appointment descriptions.
 */
export interface LayoutSignature {
  columns: LayoutColumn[];
  timeGrid: TimeGridConfig;
  /** Whether cancelled appointments remain visible on the grid in this PMS. */
  cancelledRemainVisible: boolean;
  /** How lunch/admin blocks render: solid blocks vs labeled notes. */
  blockStyle: 'solid' | 'labeled' | 'mixed';
}

export interface LayoutProfile {
  id: string | null;
  name: string;
  pmsName: string | null;
  signature: LayoutSignature;
  statusLegend: StatusLegendEntry[];
}

export interface LayoutMatch {
  profile: LayoutProfile;
  /** 0–1 — how confidently the frame matched the saved profile. */
  confidence: number;
  /** Columns detected in THIS frame (absolute pixel geometry). */
  frameColumns: Array<LayoutColumn & { pxStart: number; pxEnd: number }>;
  needsColumnConfirmation: boolean;
}

// ---------------------------------------------------------------------------
// Privacy detection
// ---------------------------------------------------------------------------

export type PrivacyViolationKind =
  | 'full_name'
  | 'initials_with_context'
  | 'phone_number'
  | 'date_of_birth'
  | 'email_address'
  | 'account_number'
  | 'insurance_identifier'
  | 'long_free_text'
  | 'clinical_narrative'
  | 'street_address';

/** Counts only. The matched text itself must never leave the detector. */
export interface PrivacyCheckResult {
  passed: boolean;
  violations: Array<{ kind: PrivacyViolationKind; count: number }>;
}

// ---------------------------------------------------------------------------
// Note classification
// ---------------------------------------------------------------------------

export type BlockCode =
  | 'PROVIDER_OUT_EARLY'
  | 'PROVIDER_STARTS_LATE'
  | 'PROVIDER_OFF'
  | 'LUNCH_BLOCK'
  | 'MEETING_BLOCK'
  | 'TRAINING_BLOCK'
  | 'ADMIN_BLOCK'
  | 'EMERGENCY_RESERVE'
  | 'EQUIPMENT_UNAVAILABLE'
  | 'STAFFING_LIMITATION'
  | 'OFFICE_CLOSED'
  | 'OTHER_OPERATIONAL_BLOCK'
  | 'UNCLASSIFIED';

export const BLOCK_CODES: readonly BlockCode[] = [
  'PROVIDER_OUT_EARLY',
  'PROVIDER_STARTS_LATE',
  'PROVIDER_OFF',
  'LUNCH_BLOCK',
  'MEETING_BLOCK',
  'TRAINING_BLOCK',
  'ADMIN_BLOCK',
  'EMERGENCY_RESERVE',
  'EQUIPMENT_UNAVAILABLE',
  'STAFFING_LIMITATION',
  'OFFICE_CLOSED',
  'OTHER_OPERATIONAL_BLOCK',
  'UNCLASSIFIED',
] as const;

/** Codes whose minutes are intentionally unavailable (excluded from net bookable). */
export const INTENTIONAL_CODES: readonly BlockCode[] = [
  'PROVIDER_OUT_EARLY',
  'PROVIDER_STARTS_LATE',
  'PROVIDER_OFF',
  'LUNCH_BLOCK',
  'MEETING_BLOCK',
  'TRAINING_BLOCK',
  'ADMIN_BLOCK',
  'EMERGENCY_RESERVE',
  'EQUIPMENT_UNAVAILABLE',
  'STAFFING_LIMITATION',
  'OFFICE_CLOSED',
  'OTHER_OPERATIONAL_BLOCK',
] as const;

/**
 * A classified operational block. Stores the code and minutes — the original
 * wording never leaves the classifier.
 */
export interface ClassifiedBlock {
  code: BlockCode;
  minutes: number;
  providerLabel: string | null;
  department: Department | null;
  /** 0–1 classifier confidence. */
  confidence: number;
  userConfirmed: boolean;
}

/** A manager-configured phrase rule: short generic office phrase → code. */
export interface PhraseRule {
  phrase: string;
  code: Exclude<BlockCode, 'UNCLASSIFIED'>;
}

// ---------------------------------------------------------------------------
// Departments & operational roles
// ---------------------------------------------------------------------------

export type Department = 'hygiene' | 'doctor' | 'front_desk' | 'other';

export type OperationalRole =
  | 'dentist'
  | 'hygienist'
  | 'dental_assistant'
  | 'front_desk'
  | 'office_manager'
  | 'sterilization'
  | 'floater'
  | 'other';

export const OPERATIONAL_ROLES: readonly OperationalRole[] = [
  'dentist',
  'hygienist',
  'dental_assistant',
  'front_desk',
  'office_manager',
  'sterilization',
  'floater',
  'other',
] as const;

// ---------------------------------------------------------------------------
// Provider metrics — the sanitized output of the whole pipeline
// ---------------------------------------------------------------------------

export type WorkloadClass = 'light' | 'steady' | 'full' | 'compressed' | 'overloaded';

export type ReviewStatus = 'auto_accepted' | 'user_confirmed' | 'needs_review';

/**
 * Aggregate, per-provider, per-day metrics. Minutes, counts, and ratios only.
 * No appointment records, no patient information, no schedule text.
 */
export interface ProviderDayMetrics {
  providerLabel: string;
  providerRole: OperationalRole;
  department: Department;
  employeeId: string | null;
  businessDate: string; // YYYY-MM-DD

  grossAvailableMinutes: number;
  intentionalUnavailableMinutes: number;
  netBookableMinutes: number;
  scheduledMinutes: number;
  trueOpenMinutes: number;

  cancellationCount: number;
  cancellationOpenMinutes: number;
  noShowCount: number;
  noShowOpenMinutes: number;
  otherOpenMinutes: number;
  unclassifiedMinutes: number;

  recoveredMinutes: number | null;
  recoveredOpenPct: number | null;
  sameDayAdditions: number | null;
  overlapMinutes: number | null;
  longestBookedStretchMinutes: number | null;
  continuousWithoutBufferMinutes: number | null;

  activeColumns: number;
  simultaneousColumnMinutes: number | null;
  scheduleDensity: number | null; // scheduled / net bookable, 0–1
  scheduleVolatility: number | null; // (cancellations + no-shows + same-day adds) / booked slots proxy, 0–1

  supportStaffAssigned: number | null;
  staffingToColumnRatio: number | null;

  automatedWorkloadClass: WorkloadClass | null;
  confidence: number; // 0–1
  reviewStatus: ReviewStatus;
}

/** Practice- and department-level rollups, derived from provider metrics. */
export interface DayMetricsRollup {
  byDepartment: Record<Department, DepartmentTotals>;
  practice: DepartmentTotals;
}

export interface DepartmentTotals {
  netBookableMinutes: number;
  scheduledMinutes: number;
  trueOpenMinutes: number;
  cancellationCount: number;
  cancellationOpenMinutes: number;
  noShowCount: number;
  noShowOpenMinutes: number;
  unclassifiedMinutes: number;
}

/** One reduced grid row for a provider: a status category, never text. */
export interface ReducedRow {
  category: ScheduleStatus | null;
  scheduledColumns: number;
}

/** The full, validated result handed to the review UI. */
export interface ScheduleAnalysis {
  businessDate: string;
  layoutConfidence: number;
  privacy: PrivacyCheckResult;
  providers: ProviderDayMetrics[];
  blocks: ClassifiedBlock[];
  rollup: DayMetricsRollup;
  /**
   * Sanitized status rows per provider label (categories only — no text).
   * Kept so the review UI can rebuild metrics after the closer resolves
   * unclassified blocks, without ever touching the destroyed frame.
   */
  providerRows: Record<string, ReducedRow[]>;
  minutesPerRow: number;
  /** Set when any provider is below the confidence threshold. */
  needsReview: boolean;
}

// ---------------------------------------------------------------------------
// Referee
// ---------------------------------------------------------------------------

export interface RefereeError {
  code:
    | 'NEGATIVE_MINUTES'
    | 'IDENTITY_VIOLATION'
    | 'DOUBLE_COUNTING'
    | 'COUNT_MINUTES_MISMATCH'
    | 'ROLLUP_MISMATCH'
    | 'CONFIDENCE_BELOW_THRESHOLD'
    | 'INVALID_RATIO'
    | 'INVALID_CLASSIFICATION'
    | 'EXCEEDS_DAY_WINDOW'
    | 'INVALID_GOAL_PROGRESS';
  /** Dot path of the offending field, e.g. "providers[0].netBookableMinutes". */
  field: string;
  /** Machine detail — numbers and field names only. */
  detail?: Record<string, number | string>;
}

export type RefereeResult =
  | { ok: true }
  | { ok: false; errors: RefereeError[] };

/** Default minimum confidence for auto-acceptance; below it, the closer must confirm. */
export const CONFIDENCE_THRESHOLD = 0.75;
