/**
 * Query results become attention sources honestly: a failed query is an
 * error even when stale rows are in hand, Close the Day is "behind" only in
 * office days, and unsealed saved days are named.
 */
import { describe, expect, it } from 'vitest';
import type { AttendanceDayStatusRow } from '@/hooks/useAttendanceDayStatus';
import type { DepositLog } from '@/hooks/useDepositLog';
import { closeoutsFrom, queryStatus } from '@/lib/attention/compose';

const row = (date: string, over: Partial<AttendanceDayStatusRow> = {}): AttendanceDayStatusRow => ({
  id: `ds-${date}`, user_id: 'u1', employee_id: 'e1', entry_date: date,
  schedule_expected_start: '08:00:00', schedule_expected_end: '17:00:00',
  is_scheduled_day: true, office_closed: false, has_punches: true, is_remote: false,
  is_absent: false, is_incomplete: false, is_late: false, minutes_late: 0,
  tardy_approval_status: 'unreviewed', has_edits: false, has_day_comment: false,
  has_day_off: false, timezone_suspect: false, status_code: 'ok', status_reasons: {},
  recompute_version: 1, computed_at: '', ...over,
});
const log = (date: string, sealed: boolean): DepositLog => ({ id: `dl-${date}`, deposit_date: date, sealed_at: sealed ? `${date}T22:00:00Z` : null }) as unknown as DepositLog;

describe('queryStatus', () => {
  it('ok with rows, loading without, error when the fetch failed even with stale rows', () => {
    expect(queryStatus({ data: [], isError: false, dataUpdatedAt: Date.parse('2026-09-21T12:00:00Z') })).toEqual({ state: 'ok', asOf: '2026-09-21T12:00:00.000Z' });
    expect(queryStatus({ data: undefined, isError: false })).toEqual({ state: 'loading', asOf: null });
    expect(queryStatus({ data: [1], isError: true, error: new Error('network'), dataUpdatedAt: Date.parse('2026-09-21T10:00:00Z') })).toEqual({ state: 'error', asOf: '2026-09-21T10:00:00.000Z', detail: 'network' });
  });
});

describe('closeoutsFrom', () => {
  const owners = new Set(['owner']);
  it('counts office days since the last seal, skipping the weekend and closures and owners', () => {
    // Fri 18 sealed; Sat/Sun nothing scheduled; Mon 21 is today.
    const r = closeoutsFrom([log('2026-09-17', true), log('2026-09-18', true)], [row('2026-09-17'), row('2026-09-18'), row('2026-09-19', { is_scheduled_day: false })], '2026-09-21', owners);
    expect(r).toMatchObject({ latestSealedDate: '2026-09-18', officeDaysSinceSeal: 0, unsealedPast: [], today: null });
    const behind = closeoutsFrom([log('2026-09-16', true)], [row('2026-09-17'), row('2026-09-18'), row('2026-09-19', { office_closed: true }), row('2026-09-20', { user_id: 'owner' })], '2026-09-21', owners);
    expect(behind.officeDaysSinceSeal).toBe(2);
  });
  it('names saved days that were never sealed, and today separately', () => {
    const r = closeoutsFrom([log('2026-09-17', false), log('2026-09-18', true), log('2026-09-21', false)], [], '2026-09-21', owners);
    expect(r.unsealedPast).toEqual([{ id: 'dl-2026-09-17', deposit_date: '2026-09-17' }]);
    expect(r.today?.id).toBe('dl-2026-09-21');
  });
  it('never sealed a day yet: nothing is behind, nothing is invented', () => {
    expect(closeoutsFrom([], [row('2026-09-17'), row('2026-09-18')], '2026-09-21', owners)).toEqual({ today: null, latestSealedDate: null, officeDaysSinceSeal: 0, unsealedPast: [] });
  });
});
