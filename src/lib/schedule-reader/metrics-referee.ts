/**
 * Metrics Referee — deterministic validation of schedule metrics.
 *
 * The referee is plain code, not a model. It either accepts a set of
 * structured metrics or returns exact validation errors. It generates no
 * prose, calls no network, and holds no state. Every metric object headed
 * for persistence or for the Office Coach passes through here first.
 */
import {
  BLOCK_CODES,
  CONFIDENCE_THRESHOLD,
  type BlockCode,
  type ClassifiedBlock,
  type DayMetricsRollup,
  type Department,
  type DepartmentTotals,
  type ProviderDayMetrics,
  type RefereeError,
  type RefereeResult,
} from './types';

const DAY_MINUTES = 24 * 60;

const EMPTY_TOTALS: DepartmentTotals = {
  netBookableMinutes: 0,
  scheduledMinutes: 0,
  trueOpenMinutes: 0,
  cancellationCount: 0,
  cancellationOpenMinutes: 0,
  noShowCount: 0,
  noShowOpenMinutes: 0,
  unclassifiedMinutes: 0,
};

function addTotals(a: DepartmentTotals, p: ProviderDayMetrics): DepartmentTotals {
  return {
    netBookableMinutes: a.netBookableMinutes + p.netBookableMinutes,
    scheduledMinutes: a.scheduledMinutes + p.scheduledMinutes,
    trueOpenMinutes: a.trueOpenMinutes + p.trueOpenMinutes,
    cancellationCount: a.cancellationCount + p.cancellationCount,
    cancellationOpenMinutes: a.cancellationOpenMinutes + p.cancellationOpenMinutes,
    noShowCount: a.noShowCount + p.noShowCount,
    noShowOpenMinutes: a.noShowOpenMinutes + p.noShowOpenMinutes,
    unclassifiedMinutes: a.unclassifiedMinutes + p.unclassifiedMinutes,
  };
}

/** Recompute rollups from provider rows — the reference the stored rollup must match. */
export function computeRollup(providers: ProviderDayMetrics[]): DayMetricsRollup {
  const byDepartment: Record<Department, DepartmentTotals> = {
    hygiene: { ...EMPTY_TOTALS },
    doctor: { ...EMPTY_TOTALS },
    front_desk: { ...EMPTY_TOTALS },
    other: { ...EMPTY_TOTALS },
  };
  let practice = { ...EMPTY_TOTALS };
  for (const p of providers) {
    byDepartment[p.department] = addTotals(byDepartment[p.department], p);
    practice = addTotals(practice, p);
  }
  return { byDepartment, practice };
}

type NumericField = keyof Pick<
  ProviderDayMetrics,
  | 'grossAvailableMinutes'
  | 'intentionalUnavailableMinutes'
  | 'netBookableMinutes'
  | 'scheduledMinutes'
  | 'trueOpenMinutes'
  | 'cancellationCount'
  | 'cancellationOpenMinutes'
  | 'noShowCount'
  | 'noShowOpenMinutes'
  | 'otherOpenMinutes'
  | 'unclassifiedMinutes'
  | 'activeColumns'
>;

const REQUIRED_NON_NEGATIVE: NumericField[] = [
  'grossAvailableMinutes',
  'intentionalUnavailableMinutes',
  'netBookableMinutes',
  'scheduledMinutes',
  'trueOpenMinutes',
  'cancellationCount',
  'cancellationOpenMinutes',
  'noShowCount',
  'noShowOpenMinutes',
  'otherOpenMinutes',
  'unclassifiedMinutes',
  'activeColumns',
];

const OPTIONAL_NON_NEGATIVE: Array<
  keyof Pick<
    ProviderDayMetrics,
    | 'recoveredMinutes'
    | 'sameDayAdditions'
    | 'overlapMinutes'
    | 'longestBookedStretchMinutes'
    | 'continuousWithoutBufferMinutes'
    | 'simultaneousColumnMinutes'
    | 'supportStaffAssigned'
  >
> = [
  'recoveredMinutes',
  'sameDayAdditions',
  'overlapMinutes',
  'longestBookedStretchMinutes',
  'continuousWithoutBufferMinutes',
  'simultaneousColumnMinutes',
  'supportStaffAssigned',
];

function validateProvider(p: ProviderDayMetrics, i: number): RefereeError[] {
  const errors: RefereeError[] = [];
  const at = (f: string) => `providers[${i}].${f}`;

  for (const field of REQUIRED_NON_NEGATIVE) {
    const v = p[field];
    if (!Number.isFinite(v) || v < 0 || !Number.isInteger(v)) {
      errors.push({ code: 'NEGATIVE_MINUTES', field: at(field), detail: { value: v } });
    }
  }
  for (const field of OPTIONAL_NON_NEGATIVE) {
    const v = p[field];
    if (v !== null && (!Number.isFinite(v) || v < 0)) {
      errors.push({ code: 'NEGATIVE_MINUTES', field: at(field), detail: { value: v } });
    }
  }
  // Anything below here divides or compares; bail on malformed numbers.
  if (errors.length > 0) return errors;

  if (p.grossAvailableMinutes > DAY_MINUTES) {
    errors.push({
      code: 'EXCEEDS_DAY_WINDOW',
      field: at('grossAvailableMinutes'),
      detail: { value: p.grossAvailableMinutes, max: DAY_MINUTES },
    });
  }

  if (p.intentionalUnavailableMinutes > p.grossAvailableMinutes) {
    errors.push({
      code: 'IDENTITY_VIOLATION',
      field: at('intentionalUnavailableMinutes'),
      detail: {
        intentional: p.intentionalUnavailableMinutes,
        gross: p.grossAvailableMinutes,
      },
    });
  }

  // net = gross − intentional, exactly.
  if (p.netBookableMinutes !== p.grossAvailableMinutes - p.intentionalUnavailableMinutes) {
    errors.push({
      code: 'IDENTITY_VIOLATION',
      field: at('netBookableMinutes'),
      detail: {
        expected: p.grossAvailableMinutes - p.intentionalUnavailableMinutes,
        actual: p.netBookableMinutes,
      },
    });
  }

  // true open = its three parts, exactly. Unclassified is NOT true open.
  const openParts = p.cancellationOpenMinutes + p.noShowOpenMinutes + p.otherOpenMinutes;
  if (p.trueOpenMinutes !== openParts) {
    errors.push({
      code: 'DOUBLE_COUNTING',
      field: at('trueOpenMinutes'),
      detail: { expected: openParts, actual: p.trueOpenMinutes },
    });
  }

  // The bookable window partitions exactly: scheduled + true open + unclassified.
  // Overlap (double-column booking) is the one legitimate excess, tracked explicitly.
  const overlap = p.overlapMinutes ?? 0;
  const partition = p.scheduledMinutes - overlap + p.trueOpenMinutes + p.unclassifiedMinutes;
  if (partition !== p.netBookableMinutes) {
    errors.push({
      code: 'IDENTITY_VIOLATION',
      field: at('scheduledMinutes'),
      detail: {
        scheduled: p.scheduledMinutes,
        overlap,
        trueOpen: p.trueOpenMinutes,
        unclassified: p.unclassifiedMinutes,
        netBookable: p.netBookableMinutes,
      },
    });
  }

  // A category with zero events cannot carry open minutes.
  if (p.cancellationCount === 0 && p.cancellationOpenMinutes > 0) {
    errors.push({
      code: 'COUNT_MINUTES_MISMATCH',
      field: at('cancellationOpenMinutes'),
      detail: { count: p.cancellationCount, minutes: p.cancellationOpenMinutes },
    });
  }
  if (p.noShowCount === 0 && p.noShowOpenMinutes > 0) {
    errors.push({
      code: 'COUNT_MINUTES_MISMATCH',
      field: at('noShowOpenMinutes'),
      detail: { count: p.noShowCount, minutes: p.noShowOpenMinutes },
    });
  }

  // Recovered minutes are scheduled minutes that were once disruption-created —
  // they can never exceed what is scheduled, and the percentage must agree.
  if (p.recoveredMinutes !== null) {
    if (p.recoveredMinutes > p.scheduledMinutes) {
      errors.push({
        code: 'DOUBLE_COUNTING',
        field: at('recoveredMinutes'),
        detail: { recovered: p.recoveredMinutes, scheduled: p.scheduledMinutes },
      });
    }
    const denom = p.recoveredMinutes + p.cancellationOpenMinutes + p.noShowOpenMinutes;
    const expectedPct = denom === 0 ? null : round4(p.recoveredMinutes / denom);
    if (expectedPct !== null && p.recoveredOpenPct !== null && round4(p.recoveredOpenPct) !== expectedPct) {
      errors.push({
        code: 'IDENTITY_VIOLATION',
        field: at('recoveredOpenPct'),
        detail: { expected: expectedPct, actual: p.recoveredOpenPct },
      });
    }
  } else if (p.recoveredOpenPct !== null) {
    errors.push({
      code: 'IDENTITY_VIOLATION',
      field: at('recoveredOpenPct'),
      detail: { reason: 'pct_without_recovered_minutes' },
    });
  }

  if (p.activeColumns < 1) {
    errors.push({ code: 'INVALID_RATIO', field: at('activeColumns'), detail: { value: p.activeColumns } });
  }
  if (
    p.simultaneousColumnMinutes !== null &&
    p.activeColumns >= 1 &&
    p.simultaneousColumnMinutes > p.activeColumns * Math.max(p.netBookableMinutes, 0)
  ) {
    errors.push({
      code: 'INVALID_RATIO',
      field: at('simultaneousColumnMinutes'),
      detail: {
        value: p.simultaneousColumnMinutes,
        max: p.activeColumns * Math.max(p.netBookableMinutes, 0),
      },
    });
  }

  if (p.scheduleDensity !== null) {
    const expected = p.netBookableMinutes === 0 ? 0 : round4(p.scheduledMinutes / p.netBookableMinutes);
    if (round4(p.scheduleDensity) !== expected) {
      errors.push({
        code: 'IDENTITY_VIOLATION',
        field: at('scheduleDensity'),
        detail: { expected, actual: p.scheduleDensity },
      });
    }
  }

  if (p.staffingToColumnRatio !== null) {
    if (p.supportStaffAssigned === null) {
      errors.push({
        code: 'INVALID_RATIO',
        field: at('staffingToColumnRatio'),
        detail: { reason: 'ratio_without_support_count' },
      });
    } else {
      const expected = round4(p.supportStaffAssigned / p.activeColumns);
      if (round4(p.staffingToColumnRatio) !== expected) {
        errors.push({
          code: 'INVALID_RATIO',
          field: at('staffingToColumnRatio'),
          detail: { expected, actual: p.staffingToColumnRatio },
        });
      }
    }
  }

  if (p.confidence < 0 || p.confidence > 1 || !Number.isFinite(p.confidence)) {
    errors.push({
      code: 'CONFIDENCE_BELOW_THRESHOLD',
      field: at('confidence'),
      detail: { value: p.confidence },
    });
  } else if (p.confidence < CONFIDENCE_THRESHOLD && p.reviewStatus === 'auto_accepted') {
    // Low-confidence metrics may pass ONLY as needs_review or user_confirmed.
    errors.push({
      code: 'CONFIDENCE_BELOW_THRESHOLD',
      field: at('reviewStatus'),
      detail: { confidence: p.confidence, threshold: CONFIDENCE_THRESHOLD },
    });
  }

  return errors;
}

function validateBlocks(blocks: ClassifiedBlock[]): RefereeError[] {
  const errors: RefereeError[] = [];
  const known = new Set<BlockCode>(BLOCK_CODES);
  blocks.forEach((b, i) => {
    if (!known.has(b.code)) {
      errors.push({ code: 'INVALID_CLASSIFICATION', field: `blocks[${i}].code` });
    }
    if (!Number.isInteger(b.minutes) || b.minutes < 0 || b.minutes > DAY_MINUTES) {
      errors.push({
        code: 'NEGATIVE_MINUTES',
        field: `blocks[${i}].minutes`,
        detail: { value: b.minutes },
      });
    }
    if (!Number.isFinite(b.confidence) || b.confidence < 0 || b.confidence > 1) {
      errors.push({
        code: 'CONFIDENCE_BELOW_THRESHOLD',
        field: `blocks[${i}].confidence`,
        detail: { value: b.confidence },
      });
    }
    // An unconfirmed UNCLASSIFIED block may exist, but a *confirmed* one is a
    // contradiction — confirming means the closer picked a category.
    if (b.code === 'UNCLASSIFIED' && b.userConfirmed) {
      errors.push({ code: 'INVALID_CLASSIFICATION', field: `blocks[${i}].userConfirmed` });
    }
  });
  return errors;
}

function totalsEqual(a: DepartmentTotals, b: DepartmentTotals): boolean {
  return (Object.keys(EMPTY_TOTALS) as Array<keyof DepartmentTotals>).every(k => a[k] === b[k]);
}

/**
 * Validate provider metrics, classified blocks, and the rollup as one unit.
 * Duplicate provider labels are double counting; rollups must recompute exactly.
 */
export function refereeMetrics(input: {
  providers: ProviderDayMetrics[];
  blocks: ClassifiedBlock[];
  rollup: DayMetricsRollup;
}): RefereeResult {
  const errors: RefereeError[] = [];

  const seen = new Set<string>();
  input.providers.forEach((p, i) => {
    const key = `${p.providerLabel.toLowerCase()}|${p.businessDate}`;
    if (seen.has(key)) {
      errors.push({ code: 'DOUBLE_COUNTING', field: `providers[${i}].providerLabel` });
    }
    seen.add(key);
    errors.push(...validateProvider(p, i));
  });

  errors.push(...validateBlocks(input.blocks));

  const expected = computeRollup(input.providers);
  (['hygiene', 'doctor', 'front_desk', 'other'] as const).forEach(dept => {
    if (!totalsEqual(expected.byDepartment[dept], input.rollup.byDepartment[dept])) {
      errors.push({ code: 'ROLLUP_MISMATCH', field: `rollup.byDepartment.${dept}` });
    }
  });
  if (!totalsEqual(expected.practice, input.rollup.practice)) {
    errors.push({ code: 'ROLLUP_MISMATCH', field: 'rollup.practice' });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

// ---------------------------------------------------------------------------
// Goal progress — deterministic, referee-owned
// ---------------------------------------------------------------------------

export interface MeasurableGoalSpec {
  /** Direction the office wants the metric to move. */
  direction: 'decrease' | 'increase';
  baseline: number;
  target: number;
}

/**
 * Progress toward a measurable goal, 0–1, clamped. Returns validation errors
 * instead of a number when the spec is incoherent (target equal to baseline,
 * or pointing the wrong way).
 */
export function goalProgress(
  spec: MeasurableGoalSpec,
  current: number
): { ok: true; progress: number } | { ok: false; error: RefereeError } {
  const bad = (detail: Record<string, number | string>): { ok: false; error: RefereeError } => ({
    ok: false,
    error: { code: 'INVALID_GOAL_PROGRESS', field: 'goal', detail },
  });

  if (![spec.baseline, spec.target, current].every(Number.isFinite)) {
    return bad({ reason: 'non_finite' });
  }
  if (spec.direction === 'decrease' && spec.target >= spec.baseline) {
    return bad({ reason: 'target_not_below_baseline', baseline: spec.baseline, target: spec.target });
  }
  if (spec.direction === 'increase' && spec.target <= spec.baseline) {
    return bad({ reason: 'target_not_above_baseline', baseline: spec.baseline, target: spec.target });
  }

  const span = spec.target - spec.baseline;
  const moved = current - spec.baseline;
  const raw = moved / span;
  return { ok: true, progress: round4(Math.min(1, Math.max(0, raw))) };
}

export function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
