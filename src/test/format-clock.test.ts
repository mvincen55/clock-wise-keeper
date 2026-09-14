import { describe, it, expect } from 'vitest';
import { formatClock, formatClockRange } from '@/lib/time-utils';

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
