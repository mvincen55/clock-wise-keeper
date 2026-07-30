import { describe, expect, it } from 'vitest';
import { pulseSignals, type PulseSignalsInput } from '@/lib/pulse-signals';

const base: PulseSignalsInput = {
  productionCents: 500_000,
  pacedTargetCents: 500_000,
  disruptions: 4,
  disruptionBaseline: 4,
  month: '2026-07',
  comparisonMonth: '2026-06',
  rowsThisMonth: 10,
  rowsComparisonMonth: 21,
  monthElapsed: 0.5,
  comparisonProductionCents: 1_000_000,
  hygieneCancellations: 2,
  hygieneNoShows: 1,
  doctorCancellations: 1,
  doctorNoShows: 0,
};

describe('pulseSignals', () => {
  it('itemizes every signal with its source', () => {
    const { signals } = pulseSignals(base);
    expect(signals.find(s => s.label === 'Days closed out')?.value).toBe('10 days');
    expect(signals.find(s => s.label === 'Pace')?.value).toBe('100%');
    expect(signals.every(s => s.source.length > 0)).toBe(true);
  });

  it('agrees with the orb state it explains', () => {
    const { pulse } = pulseSignals({ ...base, productionCents: 400_000 });
    expect(pulse.state).toBe('watch');
  });

  it('flags thin data when nothing is recorded', () => {
    const { thin } = pulseSignals({
      ...base,
      productionCents: 0,
      pacedTargetCents: 0,
      rowsThisMonth: 0,
      rowsComparisonMonth: 0,
    });
    expect(thin).toBe(true);
  });

  it('says so plainly when there is no comparison month', () => {
    const { signals } = pulseSignals({ ...base, pacedTargetCents: 0, comparisonProductionCents: 0 });
    expect(signals.find(s => s.label === 'Pace')?.value).toBe('No comparison month yet');
  });
});
