import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CONFIRMATION_LEAD_DAYS,
  confirmationPhrases,
  getRolePresets,
} from '@/components/goals/goal-examples';

// The front-desk confirmation starter must always speak the office's actual
// policy (org_practice_settings.confirmation_lead_days), never a hardcoded
// window.

describe('confirmationPhrases', () => {
  it('defaults to a two-day window', () => {
    expect(DEFAULT_CONFIRMATION_LEAD_DAYS).toBe(2);
    const p = confirmationPhrases(DEFAULT_CONFIRMATION_LEAD_DAYS);
    expect(p.title).toContain('two days ahead');
    expect(p.target).toContain('two days out');
    expect(p.chip).toBe('100% two-day-out confirmations');
  });

  it('speaks next-day for a one-day window', () => {
    const p = confirmationPhrases(1);
    expect(p.title).toContain('next-day appointment');
    expect(p.chip).toBe('100% next-day confirmations');
  });

  it('spells out small numbers and falls back to digits past ten', () => {
    expect(confirmationPhrases(3).title).toContain('three days ahead');
    expect(confirmationPhrases(14).title).toContain('14 days ahead');
  });
});

describe('getRolePresets', () => {
  it('wires the configured window into the front-desk preset', () => {
    const frontDesk = getRolePresets(3).find(r => r.key === 'front_desk')!;
    expect(frontDesk.ideas[0].title).toContain('three days ahead');
    expect(frontDesk.targets).toContain('100% three-day-out confirmations');
  });

  it('uses the shipped default when no setting is loaded yet', () => {
    const frontDesk = getRolePresets(undefined).find(r => r.key === 'front_desk')!;
    expect(frontDesk.ideas[0].title).toContain('two days ahead');
  });

  it('leaves the other role presets untouched by the setting', () => {
    const [a, b] = [getRolePresets(2), getRolePresets(7)];
    const others = (presets: typeof a) => presets.filter(r => r.key !== 'front_desk');
    expect(others(b)).toEqual(others(a));
  });
});
