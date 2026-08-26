import { describe, it, expect, afterEach } from 'vitest';
import {
  setAppTimezone,
  getAppTimezone,
  easternDateKey,
  easternTimeInputValue,
  easternWallToUtcIso,
  calculatePunchMinutes,
} from '@/lib/time-utils';

/**
 * Phase 6 — the app timezone is module state; every wall-clock helper
 * follows it. Worked time is REAL elapsed time between UTC instants, so
 * DST transitions must never add or remove paid minutes no matter what
 * the wall clock appears to say.
 *
 * 2026 DST (America/New_York): spring forward Mar 8 (2:00→3:00 AM),
 * fall back Nov 1 (2:00→1:00 AM).
 */

// Module state leaks between tests by design — always restore.
afterEach(() => setAppTimezone(null));

describe('setAppTimezone / getAppTimezone', () => {
  it('defaults to America/New_York and null restores the default', () => {
    expect(getAppTimezone()).toBe('America/New_York');
    setAppTimezone('America/Chicago');
    expect(getAppTimezone()).toBe('America/Chicago');
    setAppTimezone(null);
    expect(getAppTimezone()).toBe('America/New_York');
    setAppTimezone('');
    expect(getAppTimezone()).toBe('America/New_York');
  });

  it('rejects unrecognized zone names instead of poisoning every render', () => {
    // The value comes from the database; a bad row must not make the
    // Intl formatters throw across the app. Invalid → default.
    setAppTimezone('America/New_Yrok');
    expect(getAppTimezone()).toBe('America/New_York');
    expect(easternTimeInputValue('2026-01-15T15:00:00Z')).toBe('10:00');

    // Falls back to the default even when a valid zone was active before.
    setAppTimezone('America/Chicago');
    setAppTimezone('Not/AZone');
    expect(getAppTimezone()).toBe('America/New_York');
  });

  it('wall-clock helpers follow the active zone', () => {
    const instant = '2026-01-15T15:00:00Z'; // 10:00 EST / 09:00 CST / 05:00 HST
    expect(easternTimeInputValue(instant)).toBe('10:00');
    setAppTimezone('America/Chicago');
    expect(easternTimeInputValue(instant)).toBe('09:00');
    setAppTimezone('Pacific/Honolulu');
    expect(easternTimeInputValue(instant)).toBe('05:00');
  });

  it('date keys split on the office midnight, not UTC or Eastern midnight', () => {
    // 05:30 UTC on Jan 15 = 00:30 Jan 15 in New York, 23:30 Jan 14 in Chicago.
    const instant = '2026-01-15T05:30:00Z';
    expect(easternDateKey(instant)).toBe('2026-01-15');
    setAppTimezone('America/Chicago');
    expect(easternDateKey(instant)).toBe('2026-01-14');
  });
});

describe('punch pairs across DST transitions (America/New_York)', () => {
  it('spring forward: 01:30→04:30 wall is 120 real minutes, not 180', () => {
    // In at 01:30 EST (06:30Z), out at 04:30 EDT (08:30Z). The wall clock
    // jumped 2:00→3:00 mid-shift; only 2 real hours elapsed.
    const minutes = calculatePunchMinutes([
      { punch_type: 'in', punch_time: '2026-03-08T06:30:00Z' },
      { punch_type: 'out', punch_time: '2026-03-08T08:30:00Z' },
    ]);
    expect(minutes).toBe(120);
    // The wall-clock labels really do straddle the gap.
    expect(easternTimeInputValue('2026-03-08T06:30:00Z')).toBe('01:30');
    expect(easternTimeInputValue('2026-03-08T08:30:00Z')).toBe('04:30');
  });

  it('fall back: 01:00→01:30 wall is 90 real minutes, not 30', () => {
    // In at 01:00 EDT (05:00Z), out at 01:30 EST (06:30Z) — the second
    // pass through the repeated hour. 90 real minutes were worked.
    const minutes = calculatePunchMinutes([
      { punch_type: 'in', punch_time: '2026-11-01T05:00:00Z' },
      { punch_type: 'out', punch_time: '2026-11-01T06:30:00Z' },
    ]);
    expect(minutes).toBe(90);
    expect(easternTimeInputValue('2026-11-01T05:00:00Z')).toBe('01:00');
    expect(easternTimeInputValue('2026-11-01T06:30:00Z')).toBe('01:30');
  });
});

describe('easternWallToUtcIso across DST transitions', () => {
  it('nonexistent spring-forward time shifts forward instead of inventing an instant', () => {
    // 02:30 on Mar 8 2026 never happens in New York; the editor input
    // resolves to 03:30 EDT (07:30Z) rather than failing or going back.
    expect(easternWallToUtcIso('2026-03-08', 2, 30)).toBe('2026-03-08T07:30:00.000Z');
  });

  it('ambiguous fall-back time resolves to the earlier occurrence (EDT)', () => {
    // 01:30 on Nov 1 2026 happens twice (05:30Z EDT, 06:30Z EST); the
    // documented choice is the first pass.
    expect(easternWallToUtcIso('2026-11-01', 1, 30)).toBe('2026-11-01T05:30:00.000Z');
  });

  it('unambiguous times round-trip exactly in the active zone', () => {
    expect(easternWallToUtcIso('2026-01-15', 9, 0)).toBe('2026-01-15T14:00:00.000Z'); // EST
    expect(easternWallToUtcIso('2026-07-15', 9, 0)).toBe('2026-07-15T13:00:00.000Z'); // EDT
    setAppTimezone('America/Chicago');
    expect(easternWallToUtcIso('2026-01-15', 9, 0)).toBe('2026-01-15T15:00:00.000Z'); // CST
    setAppTimezone('America/Phoenix');
    // Arizona has no DST: same offset in January and July.
    expect(easternWallToUtcIso('2026-01-15', 9, 0)).toBe('2026-01-15T16:00:00.000Z');
    expect(easternWallToUtcIso('2026-07-15', 9, 0)).toBe('2026-07-15T16:00:00.000Z');
  });
});
