/**
 * Payment-policy defaults and (de)serialisation.
 *
 * IMPORTANT: the values here are the NEUTRAL product defaults, not any one
 * office's rules. An organization with no configuration keeps `enabled:false`
 * and therefore keeps its legacy schedule untouched. Harelick Dental's
 * confirmed policy is seeded for its own organization row only (see
 * supabase/migrations/*_fof_payment_policy_harelick_seed.sql).
 */

import {
  MILESTONE_KINDS,
  TREATMENT_CLASSES,
  type MilestoneKind,
  type PaymentPolicy,
  type RoundingMode,
  type TierStrategy,
  type TreatmentClass,
} from './types';

export const DEFAULT_MILESTONE_LABELS: Record<MilestoneKind, string> = {
  work_up: 'At the Work-Up Appointment',
  schedule: 'Upon Scheduling',
  prep: 'At the Prep / Impression Appointment',
  surgery: 'At Surgery',
  impression_or_tryin: 'At Impressions or Try-In',
  treatment: 'On the Day of Treatment',
  delivery: 'On Delivery',
};

/**
 * Product-neutral starting strategies. Every office can change every row;
 * nothing here is treated as more authoritative than an office's own setting.
 */
export const DEFAULT_STRATEGIES: Record<TreatmentClass, TierStrategy> = {
  work_up: { atOrAbove: ['work_up'], below: ['work_up'] },
  implant_surgical: { atOrAbove: ['schedule', 'surgery'], below: ['schedule', 'surgery'] },
  restorative_lab: {
    atOrAbove: ['schedule', 'prep', 'delivery'],
    below: ['prep', 'delivery'],
  },
  denture_partial: {
    atOrAbove: ['schedule', 'impression_or_tryin', 'delivery'],
    below: ['impression_or_tryin', 'delivery'],
  },
  other_no_delivery: { atOrAbove: ['schedule', 'treatment'], below: ['treatment'] },
  zero_fee_marker: { atOrAbove: [], below: [] },
};

export const DEFAULT_PAYMENT_POLICY: PaymentPolicy = {
  enabled: false,
  thresholdCents: 100_000,
  thresholdInclusive: true,
  workUpCodes: [],
  implantAdvanceException: true,
  strategies: DEFAULT_STRATEGIES,
  impressionMilestone: 'first_of_impression_or_tryin',
  combineMode: 'linked_events',
  mixedGroupTierUplift: true,
  rounding: 'last',
  labels: DEFAULT_MILESTONE_LABELS,
};

function isMilestoneKind(value: unknown): value is MilestoneKind {
  return typeof value === 'string' && (MILESTONE_KINDS as string[]).includes(value);
}

function parseKinds(value: unknown, fallback: MilestoneKind[]): MilestoneKind[] {
  if (!Array.isArray(value)) return fallback;
  const kinds = value.filter(isMilestoneKind);
  // A configured-but-empty list is meaningful ("no payment at this tier"),
  // but a malformed one falls back to the default rather than losing money.
  return value.length === kinds.length ? kinds : fallback;
}

/** Read the stored jsonb strategy map defensively. */
export function parseStrategies(raw: unknown): Record<TreatmentClass, TierStrategy> {
  const source = (raw ?? {}) as Record<string, { atOrAbove?: unknown; below?: unknown }>;
  const out = {} as Record<TreatmentClass, TierStrategy>;
  for (const cls of TREATMENT_CLASSES) {
    const fallback = DEFAULT_STRATEGIES[cls];
    const entry = source[cls];
    out[cls] = entry
      ? {
          atOrAbove: parseKinds(entry.atOrAbove, fallback.atOrAbove),
          below: parseKinds(entry.below, fallback.below),
        }
      : fallback;
  }
  return out;
}

export function parseLabels(raw: unknown): Record<MilestoneKind, string> {
  const source = (raw ?? {}) as Record<string, unknown>;
  const out = {} as Record<MilestoneKind, string>;
  for (const kind of MILESTONE_KINDS) {
    const value = source[kind];
    out[kind] =
      typeof value === 'string' && value.trim() !== ''
        ? value.trim()
        : DEFAULT_MILESTONE_LABELS[kind];
  }
  return out;
}

export interface PaymentPolicyRow {
  payment_policy_enabled?: boolean | null;
  payment_threshold_cents?: number | null;
  payment_threshold_inclusive?: boolean | null;
  payment_work_up_codes?: string[] | null;
  payment_implant_advance_exception?: boolean | null;
  payment_strategies?: unknown;
  payment_combine_mode?: string | null;
  payment_mixed_group_uplift?: boolean | null;
  payment_rounding?: string | null;
  payment_milestone_labels?: unknown;
}

/** Map an org's stored settings row into the engine's policy shape. */
export function policyFromRow(row: PaymentPolicyRow | null | undefined): PaymentPolicy {
  if (!row) return DEFAULT_PAYMENT_POLICY;
  return {
    enabled: row.payment_policy_enabled ?? false,
    thresholdCents: row.payment_threshold_cents ?? DEFAULT_PAYMENT_POLICY.thresholdCents,
    thresholdInclusive: row.payment_threshold_inclusive ?? true,
    workUpCodes: (row.payment_work_up_codes ?? [])
      .map((c) => String(c).trim().toUpperCase())
      .filter((c) => c !== ''),
    implantAdvanceException: row.payment_implant_advance_exception ?? true,
    strategies: parseStrategies(row.payment_strategies),
    impressionMilestone: 'first_of_impression_or_tryin',
    combineMode: row.payment_combine_mode === 'never' ? 'never' : 'linked_events',
    mixedGroupTierUplift: row.payment_mixed_group_uplift ?? true,
    rounding: (row.payment_rounding === 'first' ? 'first' : 'last') as RoundingMode,
    labels: parseLabels(row.payment_milestone_labels),
  };
}
