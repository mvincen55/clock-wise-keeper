import { describe, it, expect } from 'vitest';
import { evaluateSmartGate, hasQuantity, isSpecific } from '@/lib/smart';

describe('S+M hard gate', () => {
  it('blocks a vague goal with no target', () => {
    const r = evaluateSmartGate({ title: 'Do better', target: '' });
    expect(r.ok).toBe(false);
    expect(r.specific).toBe(false);
    expect(r.measurable).toBe(false);
    expect(r.reasons).toHaveLength(2);
  });

  it('blocks a specific goal that cannot be counted', () => {
    const r = evaluateSmartGate({
      title: 'Confirm every follow-up appointment before the patient leaves',
      target: 'as often as I can',
    });
    expect(r.specific).toBe(true);
    expect(r.measurable).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('blocks a measurable target attached to a vague title', () => {
    const r = evaluateSmartGate({ title: 'Improve more', target: '4 per week' });
    expect(r.measurable).toBe(true);
    expect(r.specific).toBe(false);
    expect(r.ok).toBe(false);
  });

  it('passes when the goal is specific and countable', () => {
    const r = evaluateSmartGate({
      title: 'Ask patients for a review after each hygiene visit',
      target: '10 review asks',
    });
    expect(r.ok).toBe(true);
    expect(r.reasons).toEqual([]);
  });

  it('accepts rates and written numbers as quantities', () => {
    expect(hasQuantity('95%')).toBe(true);
    expect(hasQuantity('daily')).toBe(true);
    expect(hasQuantity('three call-backs')).toBe(true);
    expect(hasQuantity('   ')).toBe(false);
    expect(hasQuantity('better outcomes')).toBe(false);
  });

  it('treats short or filler titles as not specific', () => {
    expect(isSpecific('Be faster')).toBe(false);
    expect(isSpecific('try harder more stuff things')).toBe(false);
    expect(isSpecific('Chart every visit before end of day')).toBe(true);
  });

  it('is tolerant of surrounding whitespace', () => {
    const r = evaluateSmartGate({
      title: '   Verify insurance benefits before every new patient visit  ',
      target: '  20 verifications  ',
    });
    expect(r.ok).toBe(true);
  });
});
