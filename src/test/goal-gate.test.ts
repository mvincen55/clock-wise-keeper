import { describe, expect, it } from 'vitest';
import { canSaveGoal, evaluateGoalGate, flagsFromSmartText } from '@/lib/goal-gate';

describe('goal S+M gate', () => {
  it('passes with a title and a measurable target', () => {
    expect(canSaveGoal({ title: 'Ask for feedback after visits', target: '4 asks' })).toBe(true);
  });

  it('fails with a title but no target', () => {
    const r = evaluateGoalGate({ title: 'Get better at scheduling', target: '' });
    expect(r.ok).toBe(false);
    expect(r.hints.measurable).toMatch(/measurable/);
    expect(r.hints.specific).toBeUndefined();
  });

  it('fails with a target but no title', () => {
    const r = evaluateGoalGate({ title: '   ', target: '10' });
    expect(r.ok).toBe(false);
    expect(r.hints.specific).toMatch(/specific/);
  });

  it('fails when Pathfinder says it is not measurable, even with target text', () => {
    const r = evaluateGoalGate({
      title: 'Be better',
      target: 'more',
      smart: { specific: true, measurable: false },
    });
    expect(r.ok).toBe(false);
    expect(r.hints.measurable).toBeTruthy();
  });

  it('fails when Pathfinder says it is not specific', () => {
    const r = evaluateGoalGate({
      title: 'Improve',
      target: '4',
      smart: { specific: false, measurable: true },
    });
    expect(r.ok).toBe(false);
    expect(r.hints.specific).toBeTruthy();
  });

  it('never blocks on achievable / relevant / time-bound', () => {
    const r = evaluateGoalGate({
      title: 'Ask for feedback after visits',
      target: '4 asks',
      smart: { specific: true, measurable: true, achievable: false, relevant: false, time_bound: false },
    });
    expect(r.ok).toBe(true);
    expect(r.hints).toEqual({});
  });

  it('treats a missing SMART read as not-yet-judged', () => {
    expect(canSaveGoal({ title: 'Ask for feedback', target: '4', smart: null })).toBe(true);
  });

  it('derives flags from Pathfinder free text', () => {
    expect(flagsFromSmartText({ specific: 'clear', measurable: '', achievable: 'yes' })).toEqual({
      specific: true,
      measurable: false,
      achievable: true,
      relevant: false,
      time_bound: false,
    });
    expect(flagsFromSmartText(null)).toBeNull();
  });
});
