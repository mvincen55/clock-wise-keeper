import { describe, expect, it } from 'vitest';
import {
  computeRollup,
  goalProgress,
  refereeMetrics,
} from '@/lib/schedule-reader/metrics-referee';
import type { ClassifiedBlock, ProviderDayMetrics } from '@/lib/schedule-reader/types';

// The Metrics Referee is deterministic code: it accepts structured metrics or
// returns exact validation errors. These tests pin its arithmetic identities.

function validProvider(overrides: Partial<ProviderDayMetrics> = {}): ProviderDayMetrics {
  return {
    providerLabel: 'Hyg 1',
    providerRole: 'hygienist',
    department: 'hygiene',
    employeeId: null,
    businessDate: '2026-07-30',
    grossAvailableMinutes: 540,
    intentionalUnavailableMinutes: 60,
    netBookableMinutes: 480,
    scheduledMinutes: 380,
    trueOpenMinutes: 80,
    cancellationCount: 1,
    cancellationOpenMinutes: 50,
    noShowCount: 1,
    noShowOpenMinutes: 30,
    otherOpenMinutes: 0,
    unclassifiedMinutes: 20,
    recoveredMinutes: null,
    recoveredOpenPct: null,
    sameDayAdditions: null,
    overlapMinutes: 0,
    longestBookedStretchMinutes: 120,
    continuousWithoutBufferMinutes: 120,
    activeColumns: 1,
    simultaneousColumnMinutes: 0,
    scheduleDensity: 380 / 480,
    scheduleVolatility: null,
    supportStaffAssigned: null,
    staffingToColumnRatio: null,
    automatedWorkloadClass: 'full',
    confidence: 0.9,
    reviewStatus: 'auto_accepted',
    ...overrides,
  };
}

const noBlocks: ClassifiedBlock[] = [];

function run(providers: ProviderDayMetrics[], blocks: ClassifiedBlock[] = noBlocks) {
  return refereeMetrics({ providers, blocks, rollup: computeRollup(providers) });
}

describe('metrics referee', () => {
  it('accepts coherent metrics', () => {
    expect(run([validProvider()]).ok).toBe(true);
  });

  it('rejects negative minutes', () => {
    const result = run([validProvider({ scheduledMinutes: -10 })]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some(e => e.code === 'NEGATIVE_MINUTES')).toBe(true);
    }
  });

  it('rejects net ≠ gross − intentional', () => {
    const result = run([validProvider({ netBookableMinutes: 500 })]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some(e => e.field.includes('netBookableMinutes'))).toBe(true);
    }
  });

  it('rejects true open that does not equal its three parts', () => {
    const result = run([validProvider({ trueOpenMinutes: 200 })]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some(e => e.code === 'DOUBLE_COUNTING')).toBe(true);
    }
  });

  it('rejects a bookable window that does not partition exactly', () => {
    // scheduled + trueOpen + unclassified must equal net (minus overlap).
    const result = run([validProvider({ unclassifiedMinutes: 0 })]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some(e => e.code === 'IDENTITY_VIOLATION')).toBe(true);
    }
  });

  it('unclassified minutes are never counted as true open', () => {
    // Move the unclassified 20m into otherOpen: partition still sums, but the
    // referee only accepts it as OPEN time, meaning the pipeline must have
    // classified it. This documents the boundary between the two.
    const asOpen = validProvider({
      otherOpenMinutes: 20,
      trueOpenMinutes: 100,
      unclassifiedMinutes: 0,
    });
    expect(run([asOpen]).ok).toBe(true);
    const both = validProvider({ otherOpenMinutes: 20, unclassifiedMinutes: 20 });
    expect(run([both]).ok).toBe(false); // double counted — sums exceed net
  });

  it('rejects open minutes with a zero event count', () => {
    const result = run([
      validProvider({ cancellationCount: 0 }),
    ]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some(e => e.code === 'COUNT_MINUTES_MISMATCH')).toBe(true);
    }
  });

  it('rejects duplicate provider labels (double counting)', () => {
    const result = run([validProvider(), validProvider()]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some(e => e.code === 'DOUBLE_COUNTING')).toBe(true);
    }
  });

  it('rejects low confidence rows that claim auto acceptance', () => {
    const result = run([validProvider({ confidence: 0.5, reviewStatus: 'auto_accepted' })]);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some(e => e.code === 'CONFIDENCE_BELOW_THRESHOLD')).toBe(true);
    }
    // The same numbers pass once a human confirmed them.
    expect(run([validProvider({ confidence: 0.5, reviewStatus: 'user_confirmed' })]).ok).toBe(true);
  });

  it('rejects a tampered rollup', () => {
    const providers = [validProvider()];
    const rollup = computeRollup(providers);
    rollup.practice.trueOpenMinutes += 10;
    const result = refereeMetrics({ providers, blocks: noBlocks, rollup });
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some(e => e.code === 'ROLLUP_MISMATCH')).toBe(true);
    }
  });

  it('rejects recovered minutes above scheduled minutes', () => {
    const result = run([
      validProvider({ recoveredMinutes: 999, recoveredOpenPct: null }),
    ]);
    expect(result.ok).toBe(false);
  });

  it('rejects a confirmed UNCLASSIFIED block — confirming means choosing', () => {
    const blocks: ClassifiedBlock[] = [
      {
        code: 'UNCLASSIFIED',
        minutes: 30,
        providerLabel: 'Hyg 1',
        department: 'hygiene',
        confidence: 0,
        userConfirmed: true,
      },
    ];
    const result = run([validProvider()], blocks);
    expect(result.ok).toBe(false);
    if (result.ok === false) {
      expect(result.errors.some(e => e.code === 'INVALID_CLASSIFICATION')).toBe(true);
    }
  });

  it('department and practice rollups sum providers exactly', () => {
    const a = validProvider();
    const b = validProvider({ providerLabel: 'Dr. A', department: 'doctor' });
    const rollup = computeRollup([a, b]);
    expect(rollup.byDepartment.hygiene.trueOpenMinutes).toBe(80);
    expect(rollup.byDepartment.doctor.trueOpenMinutes).toBe(80);
    expect(rollup.practice.trueOpenMinutes).toBe(160);
    expect(rollup.practice.cancellationCount).toBe(2);
  });
});

describe('goal progress (referee-owned)', () => {
  it('computes clamped progress for decrease goals', () => {
    const spec = { direction: 'decrease' as const, baseline: 240, target: 120 };
    expect(goalProgress(spec, 240)).toEqual({ ok: true, progress: 0 });
    expect(goalProgress(spec, 180)).toEqual({ ok: true, progress: 0.5 });
    expect(goalProgress(spec, 120)).toEqual({ ok: true, progress: 1 });
    expect(goalProgress(spec, 60)).toEqual({ ok: true, progress: 1 }); // clamped
    expect(goalProgress(spec, 300)).toEqual({ ok: true, progress: 0 }); // clamped
  });

  it('computes progress for increase goals', () => {
    const spec = { direction: 'increase' as const, baseline: 10, target: 20 };
    expect(goalProgress(spec, 15)).toEqual({ ok: true, progress: 0.5 });
  });

  it('rejects incoherent goal specs instead of guessing', () => {
    expect(goalProgress({ direction: 'decrease', baseline: 100, target: 100 }, 50).ok).toBe(false);
    expect(goalProgress({ direction: 'decrease', baseline: 100, target: 150 }, 50).ok).toBe(false);
    expect(goalProgress({ direction: 'increase', baseline: 100, target: 50 }, 75).ok).toBe(false);
    expect(goalProgress({ direction: 'increase', baseline: 0, target: 10 }, NaN).ok).toBe(false);
  });
});
