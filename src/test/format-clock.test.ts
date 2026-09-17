import { describe, it, expect } from 'vitest';
import { formatClock, formatClockRange, formatInstantClock } from '@/lib/time-utils';

describe('formatClock', () => {
  it('renders wall-clock strings as 12-hour AM/PM', () => {
    expect(formatClock('08:20')).toBe('8:20 AM');
    expect(formatClock('13:20:00')).toBe('1:20 PM');
    expect(formatClock('00:05')).toBe('12:05 AM');
    expect(formatClock('12:00')).toBe('12:00 PM');
    expect(formatClock('20:00:00')).toBe('8:00 PM');
  });

  it('falls back safely for missing or invalid values', () => {
    expect(formatClock(null)).toBe('—');
    expect(formatClock(undefined, '')).toBe('');
    expect(formatClock('not a time')).toBe('—');
    expect(formatClock('25:99')).toBe('—');
  });

  it('renders ranges', () => {
    expect(formatClockRange('09:45:00', '20:00:00')).toBe('9:45 AM – 8:00 PM');
    expect(formatClockRange(null, null)).toBe('—');
  });
});

describe('formatInstantClock', () => {
  it('renders a UTC instant as the office wall-clock in the same style as formatClock', () => {
    // 2026-09-16 21:58 UTC is 5:58 PM in America/New_York (EDT) — the
    // style has to match the schedule column it sits beside ("9:45 AM").
    expect(formatInstantClock('2026-09-16T21:58:00.000Z')).toBe('5:58 PM');
    expect(formatInstantClock('2026-09-14T14:29:00.000Z')).toBe('10:29 AM');
    expect(formatInstantClock(new Date('2026-09-14T12:28:00.000Z'))).toBe('8:28 AM');
    expect(formatClock('09:45:00')).toBe('9:45 AM');
  });

  it('falls back safely for missing or invalid instants', () => {
    expect(formatInstantClock(null)).toBe('—');
    expect(formatInstantClock(undefined, '')).toBe('');
    expect(formatInstantClock('not a time')).toBe('—');
  });
});
