/**
 * Void, not delete: voided punches stay on the record but never count.
 *
 * Guards the Phase 3 contract (Time Clock Legitimacy Hardening):
 * every client-side computation over punches — clock status, running
 * minutes, pair totals, the live-punch filter — ignores voided rows.
 */
import { describe, it, expect } from 'vitest';
import { getClockStatus, getRunningMinutes } from '@/lib/clock-status';
import { calculatePunchMinutes } from '@/lib/time-utils';
import { livePunches, type PunchRow } from '@/hooks/useTimeEntries';

function punch(overrides: Partial<PunchRow>): PunchRow {
  return {
    id: 'p',
    time_entry_id: 'e',
    seq: 0,
    punch_type: 'in',
    punch_time: '2026-08-14T13:00:00.000Z',
    source: 'manual',
    raw_text: null,
    created_at: '2026-08-14T13:00:00.000Z',
    low_confidence: false,
    location_lat: null,
    location_lng: null,
    is_edited: false,
    original_punch_time: null,
    edited_at: null,
    edited_by: null,
    voided_at: null,
    voided_by: null,
    void_reason: null,
    ...overrides,
  };
}

const IN_9 = punch({ id: 'a', seq: 0, punch_type: 'in', punch_time: '2026-08-14T13:00:00.000Z' });
const OUT_12 = punch({ id: 'b', seq: 1, punch_type: 'out', punch_time: '2026-08-14T16:00:00.000Z' });
const VOIDED_IN = punch({
  id: 'c', seq: 2, punch_type: 'in', punch_time: '2026-08-14T17:00:00.000Z',
  voided_at: '2026-08-14T18:00:00.000Z', voided_by: 'mgr', void_reason: 'accidental double punch',
});

describe('livePunches', () => {
  it('drops voided rows and keeps order', () => {
    expect(livePunches([IN_9, OUT_12, VOIDED_IN]).map(p => p.id)).toEqual(['a', 'b']);
  });
});

describe('getClockStatus (voided-aware)', () => {
  it('a voided trailing in-punch does not read as clocked in', () => {
    expect(getClockStatus([IN_9, OUT_12, VOIDED_IN])).toBe('clocked_out');
  });

  it('still reads a live open in-punch as clocked in', () => {
    expect(getClockStatus([IN_9])).toBe('clocked_in');
  });

  it('an entry whose only punches are voided is clocked out', () => {
    expect(getClockStatus([VOIDED_IN])).toBe('clocked_out');
  });
});

describe('getRunningMinutes (voided-aware)', () => {
  it('a closed pair with a voided extra punch totals just the pair', () => {
    expect(getRunningMinutes([IN_9, OUT_12, VOIDED_IN])).toBe(180);
  });

  it('all-voided punches total zero', () => {
    expect(getRunningMinutes([VOIDED_IN])).toBe(0);
  });
});

describe('calculatePunchMinutes (voided-aware)', () => {
  it('ignores a voided out-punch that would otherwise pair', () => {
    const voidedOut = punch({
      id: 'd', seq: 1, punch_type: 'out', punch_time: '2026-08-14T14:00:00.000Z',
      voided_at: '2026-08-14T15:00:00.000Z',
    });
    const realOut = punch({ id: 'e', seq: 2, punch_type: 'out', punch_time: '2026-08-14T16:00:00.000Z' });
    expect(calculatePunchMinutes([IN_9, voidedOut, realOut])).toBe(180);
  });

  it('still totals plain pairs without voided rows', () => {
    expect(calculatePunchMinutes([IN_9, OUT_12])).toBe(180);
  });
});
