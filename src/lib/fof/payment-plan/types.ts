/**
 * Organization-driven payment-plan engine — shared types.
 *
 * HIPAA boundary: everything here describes either de-identified office
 * CONFIGURATION (policy, classifications, wording) or per-plan amounts that
 * exist ONLY in browser memory. Nothing in this module may be persisted,
 * logged, put in a URL, or sent over the network.
 *
 * The engine deliberately separates four concerns so no layer can quietly
 * decide another layer's business:
 *   1. procedure financial responsibility (out-of-pocket per procedure),
 *   2. clinical appointments and treatment groups,
 *   3. organization payment policy,
 *   4. collection milestones and their allocations.
 *
 * Human-readable labels NEVER drive behaviour. Milestones and collection
 * events are matched by stable identity only.
 */

import type { Cents } from '../types';

/**
 * How a treatment group is paid for. This is a PAYMENT classification and is
 * intentionally independent of the insurance category on the same line
 * (a work-up procedure can be "major" for benefits and still be paid in full
 * at the work-up appointment).
 */
export type TreatmentClass =
  | 'work_up'
  | 'implant_surgical'
  | 'restorative_lab'
  | 'denture_partial'
  | 'other_no_delivery'
  | 'zero_fee_marker';

export const TREATMENT_CLASSES: TreatmentClass[] = [
  'work_up',
  'implant_surgical',
  'restorative_lab',
  'denture_partial',
  'other_no_delivery',
  'zero_fee_marker',
];

export const TREATMENT_CLASS_LABELS: Record<TreatmentClass, string> = {
  work_up: 'Work-up (paid at the work-up appointment)',
  implant_surgical: 'Implant placement / surgical phase',
  restorative_lab: 'Crown, bridge, implant abutment/crown',
  denture_partial: 'Denture or partial',
  other_no_delivery: 'Other treatment (no delivery appointment)',
  zero_fee_marker: 'Zero-fee appointment marker',
};

/** Stable milestone kinds. Wording is configurable; these identities are not. */
export type MilestoneKind =
  | 'work_up'
  | 'schedule'
  | 'prep'
  | 'surgery'
  | 'impression_or_tryin'
  | 'treatment'
  | 'delivery';

export const MILESTONE_KINDS: MilestoneKind[] = [
  'work_up',
  'schedule',
  'prep',
  'surgery',
  'impression_or_tryin',
  'treatment',
  'delivery',
];

/** Milestone order within a treatment group. Lower runs first. */
export const MILESTONE_ORDER: Record<MilestoneKind, number> = {
  work_up: 0,
  schedule: 1,
  surgery: 2,
  prep: 2,
  impression_or_tryin: 2,
  treatment: 2,
  delivery: 3,
};

export type RoundingMode = 'last' | 'first';

/** Milestone sequence used for a treatment class at one side of the threshold. */
export interface TierStrategy {
  /** At or above the threshold (inclusive boundary is configurable). */
  atOrAbove: MilestoneKind[];
  /** Below the threshold. */
  below: MilestoneKind[];
}

/**
 * One office's payment policy. Persisted per organization on `fof_settings`;
 * never global, never keyed off an office name.
 */
export interface PaymentPolicy {
  /** Master switch. Off = the office keeps the legacy visit-ahead schedule. */
  enabled: boolean;
  thresholdCents: Cents;
  /** true = an amount exactly equal to the threshold belongs to the higher tier. */
  thresholdInclusive: boolean;
  /** Codes this office always pays at the work-up appointment. */
  workUpCodes: string[];
  /** Implant surgical phase is always halves, even below the threshold. */
  implantAdvanceException: boolean;
  strategies: Record<TreatmentClass, TierStrategy>;
  /** Which appointment the denture/partial middle payment attaches to. */
  impressionMilestone: 'first_of_impression_or_tryin';
  /**
   * 'linked_events' = payments combine ONLY when their milestones resolve to
   * the same real collection event. 'never' = every group prints separately.
   */
  combineMode: 'linked_events' | 'never';
  /**
   * When treatment joins a combined arrangement (its appointment is shared
   * with other paying treatment), the below-threshold standalone allowance
   * stops applying — an $800 extraction prepped alongside a crown cannot be
   * left to "just pay it that day".
   */
  mixedGroupTierUplift: boolean;
  /** Where the balancing cents land after an exact split. */
  rounding: RoundingMode;
  labels: Record<MilestoneKind, string>;
}

/**
 * A procedure as the engine sees it: its own out-of-pocket responsibility,
 * its payment classification, the treatment group it belongs to, and the
 * real appointments it touches.
 */
export interface PlanProcedure {
  /** Stable within one plan; overrides key off milestone ids built from it. */
  id: string;
  code: string;
  treatmentClass: TreatmentClass;
  /** Treatment group id — related work prepared together shares one group. */
  groupId: string;
  /** Patient responsibility for this procedure, in integer cents. */
  oopCents: Cents;
  /** Identity of the appointment where the work happens. */
  appointmentId: string;
  /** Ordering key for that appointment (earlier = smaller). */
  appointmentOrder: number;
  /** Identity of the delivery/seat appointment when it is a separate visit. */
  deliveryAppointmentId?: string;
  deliveryAppointmentOrder?: number;
  /** Explicitly recorded as already paid — excluded from future milestones. */
  alreadyPaid?: boolean;
  /** Display wording for the group; never used for matching. */
  label?: string;
}

export interface PaymentPlanInput {
  policy: PaymentPolicy;
  procedures: PlanProcedure[];
  /**
   * Explicit collection-event links, keyed by milestone id. Used when the
   * office books a later phase during an earlier appointment (e.g. the
   * restorative booking taken at implant surgery).
   */
  eventLinks?: Record<string, string>;
  /**
   * A global discount or credit with no defined allocation across groups.
   * Non-zero means the schedule is NOT printable until staff allocate it.
   */
  unallocatedAdjustmentCents?: Cents;
  overrides?: {
    /** milestone-row id → amount in cents. */
    amounts?: Record<string, Cents>;
    /** milestone-row id → label. */
    labels?: Record<string, string>;
  };
}

/** One procedure's contribution to one payment row. */
export interface Allocation {
  procedureId: string;
  groupId: string;
  code: string;
  milestoneId: string;
  kind: MilestoneKind;
  amountCents: Cents;
}

export interface PaymentRow {
  /** Stable id: the collection event this money is due at. */
  id: string;
  label: string;
  amountCents: Cents;
  /** Computed amount before any manual override. */
  computedCents: Cents;
  overridden: boolean;
  labelOverridden: boolean;
  order: number;
  kinds: MilestoneKind[];
  allocations: Allocation[];
}

export type PaymentPlanIssueCode =
  | 'unallocated_adjustment'
  | 'stale_amount_override'
  | 'stale_label_override'
  | 'override_total_mismatch'
  | 'negative_amount'
  | 'unclassified_procedure';

export interface PaymentPlanIssue {
  code: PaymentPlanIssueCode;
  message: string;
  /** true = the form must not print until staff resolve it. */
  blocksPrint: boolean;
  /** Milestone/row id the issue is about, when it has one. */
  rowId?: string;
}

export interface PaymentPlanResult {
  rows: PaymentRow[];
  /** Sum of all scheduled rows. */
  scheduledCents: Cents;
  /** Explicitly recorded prior payments, excluded from the rows above. */
  priorPaidCents: Cents;
  /** Prior payments + scheduled rows = the full patient obligation. */
  obligationCents: Cents;
  issues: PaymentPlanIssue[];
  /** Convenience: any issue that must stop printing. */
  blocksPrint: boolean;
}
