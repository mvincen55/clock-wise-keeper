import { describe, it, expect } from 'vitest';
import {
  defaultWeeklySchedule,
  sanitizeWeeklySchedule,
  scheduleHasAnyEnabled,
  enabledScheduleDays,
  isValidTimeString,
  formatTime12,
  formatScheduleSummary,
  parseInitialPtoHours,
  parseStartDate,
  formatIsoDate,
  daysUntilExpiry,
  isInviteExpired,
  formatExpiry,
} from '@/lib/invite-details';

describe('defaultWeeklySchedule', () => {
  it('has exactly one row per weekday in Sun→Sat order', () => {
    const s = defaultWeeklySchedule();
    expect(s.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('enables Monday–Friday only, 08:00–17:00', () => {
    const s = defaultWeeklySchedule();
    expect(s.filter((d) => d.enabled).map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5]);
    for (const d of s) {
      expect(d.start_time).toBe('08:00');
      expect(d.end_time).toBe('17:00');
    }
  });
});

describe('isValidTimeString', () => {
  it('accepts valid 24h times', () => {
    expect(isValidTimeString('00:00')).toBe(true);
    expect(isValidTimeString('09:30')).toBe(true);
    expect(isValidTimeString('23:59')).toBe(true);
  });
  it('rejects invalid times', () => {
    expect(isValidTimeString('24:00')).toBe(false);
    expect(isValidTimeString('9:30')).toBe(false);
    expect(isValidTimeString('08:60')).toBe(false);
    expect(isValidTimeString('')).toBe(false);
    expect(isValidTimeString(830)).toBe(false);
  });
});

describe('sanitizeWeeklySchedule', () => {
  it('fills all seven weekdays even from partial input', () => {
    const s = sanitizeWeeklySchedule([{ weekday: 1, enabled: true, start_time: '07:00', end_time: '15:00' }]);
    expect(s).toHaveLength(7);
    expect(s.map((d) => d.weekday)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const mon = s.find((d) => d.weekday === 1)!;
    expect(mon).toMatchObject({ enabled: true, start_time: '07:00', end_time: '15:00' });
    // Unspecified days default to disabled with fallback hours.
    expect(s.find((d) => d.weekday === 0)).toMatchObject({ enabled: false, start_time: '08:00', end_time: '17:00' });
  });

  it('coerces invalid times to defaults and ignores out-of-range weekdays', () => {
    const s = sanitizeWeeklySchedule([
      { weekday: 2, enabled: true, start_time: 'nope', end_time: '99:99' },
      { weekday: 9, enabled: true, start_time: '10:00', end_time: '12:00' },
      'garbage',
      null,
    ]);
    const tue = s.find((d) => d.weekday === 2)!;
    expect(tue).toMatchObject({ enabled: true, start_time: '08:00', end_time: '17:00' });
    expect(s).toHaveLength(7);
  });

  it('treats non-array input as an all-disabled week', () => {
    const s = sanitizeWeeklySchedule(undefined);
    expect(s).toHaveLength(7);
    expect(scheduleHasAnyEnabled(s)).toBe(false);
  });
});

describe('enabledScheduleDays', () => {
  it('returns only enabled days, ordered', () => {
    const days = enabledScheduleDays(defaultWeeklySchedule());
    expect(days.map((d) => d.weekday)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('formatTime12', () => {
  it('formats 24h to 12h with AM/PM', () => {
    expect(formatTime12('08:00')).toBe('8:00 AM');
    expect(formatTime12('00:15')).toBe('12:15 AM');
    expect(formatTime12('12:00')).toBe('12:00 PM');
    expect(formatTime12('17:30')).toBe('5:30 PM');
  });
});

describe('formatScheduleSummary', () => {
  it('summarizes uniform weekday hours', () => {
    expect(formatScheduleSummary(defaultWeeklySchedule())).toBe('Mon, Tue, Wed, Thu, Fri · 8:00 AM–5:00 PM');
  });
  it('notes varied hours', () => {
    const s = sanitizeWeeklySchedule([
      { weekday: 1, enabled: true, start_time: '08:00', end_time: '17:00' },
      { weekday: 2, enabled: true, start_time: '09:00', end_time: '13:00' },
    ]);
    expect(formatScheduleSummary(s)).toBe('Mon, Tue · varied hours');
  });
  it('handles an empty week', () => {
    expect(formatScheduleSummary(sanitizeWeeklySchedule([]))).toBe('No scheduled days');
  });
});

describe('parseInitialPtoHours', () => {
  it('parses numbers and numeric strings', () => {
    expect(parseInitialPtoHours('40')).toBe(40);
    expect(parseInitialPtoHours(12.5)).toBe(12.5);
    expect(parseInitialPtoHours('12.345')).toBe(12.35);
  });
  it('allows negative balances', () => {
    expect(parseInitialPtoHours('-1.63')).toBe(-1.63);
  });
  it('returns null for empty/invalid', () => {
    expect(parseInitialPtoHours('')).toBeNull();
    expect(parseInitialPtoHours('   ')).toBeNull();
    expect(parseInitialPtoHours('abc')).toBeNull();
    expect(parseInitialPtoHours(null)).toBeNull();
    expect(parseInitialPtoHours(undefined)).toBeNull();
    expect(parseInitialPtoHours(Infinity)).toBeNull();
  });
  it('clamps to the allowed range', () => {
    expect(parseInitialPtoHours(1000000)).toBe(99999);
    expect(parseInitialPtoHours(-1000000)).toBe(-9999);
  });
});

describe('parseStartDate', () => {
  it('accepts valid ISO dates', () => {
    expect(parseStartDate('2026-08-10')).toBe('2026-08-10');
    expect(parseStartDate(' 2026-01-01 ')).toBe('2026-01-01');
  });
  it('rejects invalid dates', () => {
    expect(parseStartDate('2026-13-01')).toBeNull();
    expect(parseStartDate('2026-02-30')).toBeNull();
    expect(parseStartDate('08/10/2026')).toBeNull();
    expect(parseStartDate('')).toBeNull();
    expect(parseStartDate(20260810)).toBeNull();
  });
});

describe('formatIsoDate', () => {
  it('formats date and timestamp strings the same, timezone-stable', () => {
    expect(formatIsoDate('2026-08-10')).toBe('Aug 10, 2026');
    expect(formatIsoDate('2026-08-10T23:59:59.000Z')).toBe('Aug 10, 2026');
  });
  it('returns empty string for missing/invalid input', () => {
    expect(formatIsoDate(null)).toBe('');
    expect(formatIsoDate('')).toBe('');
    expect(formatIsoDate('not-a-date')).toBe('');
  });
});

describe('expiry helpers', () => {
  const now = new Date('2026-08-05T12:00:00.000Z');
  it('computes whole days until expiry', () => {
    expect(daysUntilExpiry('2026-08-12T12:00:00.000Z', now)).toBe(7);
    expect(daysUntilExpiry('2026-08-05T12:00:00.000Z', now)).toBe(0);
  });
  it('detects expired invites', () => {
    expect(isInviteExpired('2026-08-01T12:00:00.000Z', now)).toBe(true);
    expect(isInviteExpired('2026-08-12T12:00:00.000Z', now)).toBe(false);
  });
  it('formats a friendly expiry label', () => {
    expect(formatExpiry('2026-08-12T12:00:00.000Z', now)).toBe('Expires in 7 days');
    expect(formatExpiry('2026-08-06T12:00:00.000Z', now)).toBe('Expires in 1 day');
    expect(formatExpiry('2026-08-05T18:00:00.000Z', now)).toBe('Expires today');
    expect(formatExpiry('2026-08-01T12:00:00.000Z', now)).toBe('Expired');
  });
});
