/**
 * metric-pace — the single shared pace formula behind every dashboard.
 * If these rules break, Owner, Manager, and Team drift apart or start
 * inventing verdicts the data cannot support.
 */
import { describe, expect, it } from 'vitest';
import { daysInMonthOf, metricPace, weeklyPaceForMonth } from '@/lib/metric-pace';

describe('metricPace', () => {
  it('paces the actual against target × month elapsed', () => {
    const pace = metricPace({ actual: 500, target: 1000, monthElapsed: 0.5, recordedDays: 10 });
    expect(pace?.pacedTarget).toBe(500);
    expect(pace?.diff).toBe(0);
    expect(pace?.status).toBe('on_pace');
    expect(pace?.pctOfTarget).toBe(0.5);
  });

  it('no target → null, never a fake verdict', () => {
    expect(metricPace({ actual: 500, target: 0, monthElapsed: 0.5, recordedDays: 10 })).toBeNull();
  });

  it('no recorded days → null, even with a target — missing data is not zero', () => {
    expect(metricPace({ actual: 0, target: 1000, monthElapsed: 0.5, recordedDays: 0 })).toBeNull();
  });

  it('ahead and behind are symmetric around the ±2% band', () => {
    const ahead = metricPace({ actual: 600, target: 1000, monthElapsed: 0.5, recordedDays: 5 });
    expect(ahead?.status).toBe('ahead');
    const behind = metricPace({ actual: 400, target: 1000, monthElapsed: 0.5, recordedDays: 5 });
    expect(behind?.status).toBe('behind');
    const close = metricPace({ actual: 485, target: 1000, monthElapsed: 0.5, recordedDays: 5 });
    expect(close?.status).toBe('on_pace'); // within 20 of 500
  });

  it('an absolute on-pace band overrides the percentage band for counts', () => {
    // 12-patient goal, half elapsed → paced 6. 5 seen is within ±1 → on pace.
    const pace = metricPace({ actual: 5, target: 12, monthElapsed: 0.5, recordedDays: 5, onPaceBand: 1 });
    expect(pace?.status).toBe('on_pace');
    const behind = metricPace({ actual: 4, target: 12, monthElapsed: 0.5, recordedDays: 5, onPaceBand: 1 });
    expect(behind?.status).toBe('behind');
  });
});

describe('weeklyPaceForMonth', () => {
  it('is monthly target ÷ (days in month ÷ 7), rounded up', () => {
    // 40 patients over a 31-day month: 40 / 4.428… = 9.03 → 10/week.
    expect(weeklyPaceForMonth(40, 31)).toBe(10);
    // 8 over 28 days: 8 / 4 = 2/week exactly.
    expect(weeklyPaceForMonth(8, 28)).toBe(2);
  });

  it('no goal → null, never "0 per week"', () => {
    expect(weeklyPaceForMonth(0, 31)).toBeNull();
  });
});

describe('daysInMonthOf', () => {
  it('reads the calendar, including leap years', () => {
    expect(daysInMonthOf('2026-08-10')).toBe(31);
    expect(daysInMonthOf('2026-02-01')).toBe(28);
    expect(daysInMonthOf('2028-02-01')).toBe(29);
    expect(daysInMonthOf('2026-04-15')).toBe(30);
  });
});
