import { describe, expect, it } from 'vitest';
import {
  buildProviderMetrics,
  classifyWorkload,
  reduceRow,
  type ProviderBuildInput,
  type RowStatus,
} from '@/lib/schedule-reader/metrics-builder';
import { observedDay } from '@/lib/schedule-reader/metrics-builder';
import { computeRollup, refereeMetrics } from '@/lib/schedule-reader/metrics-referee';
import type { ClassifiedBlock } from '@/lib/schedule-reader/types';

// The builder's arithmetic must always survive its own referee: whatever it
// produces from any row sequence is, by construction, internally consistent.

function rows(sequence: RowStatus[]): ProviderBuildInput['rows'] {
  return sequence.map(category => ({ category, scheduledColumns: category === 'scheduled' ? 1 : 0 }));
}

function build(
  sequence: RowStatus[],
  blocks: ClassifiedBlock[] = [],
  overrides: Partial<ProviderBuildInput> = {}
) {
  return buildProviderMetrics({
    providerLabel: 'Hyg 1',
    providerRole: 'hygienist',
    department: 'hygiene',
    employeeId: null,
    businessDate: '2026-07-30',
    rows: rows(sequence),
    minutesPerRow: 10,
    activeColumns: 1,
    blocks,
    supportStaffAssigned: null,
    ocrConfidence: 0.95,
    layoutConfidence: 1,
    ...overrides,
  });
}

const lunchBlock = (minutes: number): ClassifiedBlock => ({
  code: 'LUNCH_BLOCK',
  minutes,
  providerLabel: 'Hyg 1',
  department: 'hygiene',
  confidence: 0.9,
  userConfirmed: false,
});

describe('metrics builder', () => {
  it('a fully scheduled day: everything booked, nothing open', () => {
    const m = build(Array(48).fill('scheduled'));
    expect(m.grossAvailableMinutes).toBe(480);
    expect(m.scheduledMinutes).toBe(480);
    expect(m.trueOpenMinutes).toBe(0);
    expect(m.unclassifiedMinutes).toBe(0);
  });

  it('counts contiguous cancellation/no-show runs as single events, in minutes', () => {
    // 120m open from ONE cancellation is not the same as a 20m one.
    const seq: RowStatus[] = [
      ...Array(6).fill('scheduled'),
      ...Array(12).fill('cancelled'), // one 120-minute cancellation
      ...Array(6).fill('scheduled'),
      ...Array(2).fill('no_show'), // one 20-minute no-show
      ...Array(6).fill('scheduled'),
    ];
    const m = build(seq);
    expect(m.cancellationCount).toBe(1);
    expect(m.cancellationOpenMinutes).toBe(120);
    expect(m.noShowCount).toBe(1);
    expect(m.noShowOpenMinutes).toBe(20);
    expect(m.trueOpenMinutes).toBe(140);
  });

  it('blocked time is intentional ONLY when a classified note explains it', () => {
    const seq: RowStatus[] = [...Array(30).fill('scheduled'), ...Array(6).fill('blocked')];
    const unexplained = build(seq);
    expect(unexplained.intentionalUnavailableMinutes).toBe(0);
    expect(unexplained.unclassifiedMinutes).toBe(60);

    const explained = build(seq, [lunchBlock(60)]);
    expect(explained.intentionalUnavailableMinutes).toBe(60);
    expect(explained.unclassifiedMinutes).toBe(0);
    expect(explained.netBookableMinutes).toBe(300);
  });

  it('low-confidence unconfirmed notes do not create intentional time', () => {
    const seq: RowStatus[] = [...Array(6).fill('blocked')];
    const weak = { ...lunchBlock(60), confidence: 0.3 };
    const m = build(seq, [weak]);
    expect(m.intentionalUnavailableMinutes).toBe(0);
    const confirmed = build(seq, [{ ...weak, userConfirmed: true }]);
    expect(confirmed.intentionalUnavailableMinutes).toBe(60);
  });

  it('unmatched rows land in unclassified, never in true open', () => {
    const m = build([...Array(10).fill('scheduled'), ...Array(4).fill(null)]);
    expect(m.unclassifiedMinutes).toBe(40);
    expect(m.trueOpenMinutes).toBe(0);
  });

  it('multi-column overlap is tracked, not double counted as bookable', () => {
    const twoColumns: ProviderBuildInput['rows'] = Array(12)
      .fill(null)
      .map(() => ({ category: 'scheduled' as const, scheduledColumns: 2 }));
    const m = build([], [], { rows: twoColumns, activeColumns: 2 });
    expect(m.scheduledMinutes).toBe(240); // 2 columns × 120m
    expect(m.overlapMinutes).toBe(120);
    expect(m.simultaneousColumnMinutes).toBe(120);
    expect(m.netBookableMinutes).toBe(120);
  });

  it('every builder output survives the referee (round trip)', () => {
    const sequences: RowStatus[][] = [
      Array(48).fill('scheduled'),
      [...Array(6).fill('scheduled'), ...Array(12).fill('cancelled'), ...Array(4).fill('open')],
      [...Array(6).fill('blocked'), ...Array(10).fill(null), ...Array(3).fill('no_show')],
      Array(5).fill('moved'),
      [],
    ];
    for (const seq of sequences) {
      const provider = build(seq, seq.includes('blocked') ? [lunchBlock(60)] : []);
      const verdict = refereeMetrics({
        providers: [provider],
        blocks: [],
        rollup: computeRollup([provider]),
      });
      expect(verdict).toEqual({ ok: true });
    }
  });

  it('low OCR/layout confidence forces needs_review', () => {
    const m = build(Array(20).fill('scheduled'), [], { ocrConfidence: 0.6 });
    expect(m.confidence).toBeLessThan(0.75);
    expect(m.reviewStatus).toBe('needs_review');
  });
});

describe('workload classification', () => {
  it('maps density to classes deterministically', () => {
    const base = { continuousWithoutBufferMinutes: 0, overlapMinutes: 0, netBookableMinutes: 480 };
    expect(classifyWorkload({ ...base, density: 0.2 })).toBe('light');
    expect(classifyWorkload({ ...base, density: 0.6 })).toBe('steady');
    expect(classifyWorkload({ ...base, density: 0.85 })).toBe('full');
    expect(classifyWorkload({ ...base, density: 0.93 })).toBe('compressed');
    expect(
      classifyWorkload({ ...base, density: 0.98, overlapMinutes: 30 })
    ).toBe('overloaded');
    expect(classifyWorkload({ ...base, density: null })).toBeNull();
  });
});

describe('row reduction', () => {
  it('any scheduled column wins the row', () => {
    expect(reduceRow(['open', 'scheduled'])).toEqual({ category: 'scheduled', scheduledColumns: 1 });
  });
  it('disruptions outrank open, open outranks blocked', () => {
    expect(reduceRow(['open', 'no_show']).category).toBe('no_show');
    expect(reduceRow(['blocked', 'open']).category).toBe('open');
    expect(reduceRow([null, null]).category).toBeNull();
  });
});

describe('observedDay', () => {
  const row = (category: 'scheduled' | 'completed' | 'open' | 'blocked' | 'cancelled' | null) => ({ category, scheduledColumns: category === 'scheduled' || category === 'completed' ? 1 : 0 });
  it('reads where patients and bookable time sat on the grid, in minutes from midnight', () => {
    // 8:00 start, 10-minute rows: blocked, open, scheduled, scheduled, cancelled, open, blocked, null
    const rows = [row('blocked'), row('open'), row('scheduled'), row('completed'), row('cancelled'), row('open'), row('blocked'), row(null)];
    expect(observedDay(rows, 10, 480)).toEqual({ firstPatientMinute: 500, lastPatientMinute: 520, availableStartMinute: 490, availableEndMinute: 540 });
  });
  it('is null without a day start or without anything of the kind visible', () => {
    expect(observedDay([row('scheduled')], 10)).toEqual({ firstPatientMinute: null, lastPatientMinute: null, availableStartMinute: null, availableEndMinute: null });
    expect(observedDay([row('blocked'), row(null)], 10, 480)).toEqual({ firstPatientMinute: null, lastPatientMinute: null, availableStartMinute: null, availableEndMinute: null });
    expect(observedDay([row('open')], 30, 480)).toEqual({ firstPatientMinute: null, lastPatientMinute: null, availableStartMinute: 480, availableEndMinute: 510 });
  });
  it('rides along on built metrics and survives the referee', () => {
    const metrics = buildProviderMetrics({ providerLabel: 'Cori', providerRole: 'hygienist', department: 'hygiene', employeeId: null, businessDate: '2026-09-21', rows: [row('open'), row('scheduled'), row('scheduled'), row('open')], minutesPerRow: 60, activeColumns: 1, blocks: [], supportStaffAssigned: null, ocrConfidence: 1, layoutConfidence: 1, dayStartMinutes: 480 });
    expect(metrics).toMatchObject({ firstPatientMinute: 540, lastPatientMinute: 660, availableStartMinute: 480, availableEndMinute: 720 });
    expect(refereeMetrics({ providers: [metrics], blocks: [], rollup: computeRollup([metrics]) }).ok).toBe(true);
  });
});
