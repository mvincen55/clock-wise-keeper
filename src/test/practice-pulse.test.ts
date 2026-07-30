import { describe, expect, it } from 'vitest';
import { practicePulse, type PulseInput } from '@/lib/practice-pulse';

const base: PulseInput = {
  productionCents: 100_000,
  pacedTargetCents: 100_000,
  disruptions: 4,
  disruptionBaseline: 4,
};

describe('practicePulse', () => {
  it('is quiet with nothing recorded', () => {
    const p = practicePulse({ ...base, productionCents: 0, pacedTargetCents: 0 });
    expect(p.state).toBe('quiet');
    expect(p.pace).toBeNull();
    expect(p.breathSeconds).toBe(8);
  });

  it('is steady when production sits on pace', () => {
    expect(practicePulse(base).state).toBe('steady');
  });

  it('is strong at 5% or more ahead of pace', () => {
    expect(practicePulse({ ...base, productionCents: 105_000 }).state).toBe('strong');
    expect(practicePulse({ ...base, productionCents: 104_000 }).state).toBe('steady');
  });

  it('flags a watch when production falls under 90% of pace', () => {
    expect(practicePulse({ ...base, productionCents: 89_000 }).state).toBe('watch');
    expect(practicePulse({ ...base, productionCents: 90_000 }).state).toBe('steady');
  });

  it('flags a watch when disruptions run above the usual pace, even if production is strong', () => {
    const p = practicePulse({ ...base, productionCents: 200_000, disruptions: 6 });
    expect(p.state).toBe('watch');
    expect(p.detail).toContain('disruptions above usual');
  });

  it('tolerates disruptions up to 25% above baseline', () => {
    expect(practicePulse({ ...base, disruptions: 5 }).state).toBe('steady');
  });

  it('breathes slower when calm than when strained', () => {
    const steady = practicePulse(base);
    const watch = practicePulse({ ...base, productionCents: 50_000 });
    expect(steady.breathSeconds).toBeGreaterThan(watch.breathSeconds);
  });

  it('cites the number behind the state', () => {
    expect(practicePulse({ ...base, productionCents: 120_000 }).detail).toContain('120% of pace');
  });

  it('falls back to steady when there is production but no comparison month', () => {
    const p = practicePulse({ ...base, pacedTargetCents: 0 });
    expect(p.state).toBe('steady');
    expect(p.pace).toBeNull();
  });
});
