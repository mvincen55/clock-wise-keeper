/**
 * Close the Day status — the deterministic layer behind the Home status line
 * and the closeout follow-ups. The rules pinned here: the state comes from
 * the record itself, "not started" while the office is open is calm, not
 * urgent, and every state links to the exact record.
 */
import { describe, expect, it } from 'vitest';
import type { DepositLog } from '@/hooks/useDepositLog';
import { closeDayStatus } from '@/lib/manager-pulse';

const log = (over: Partial<DepositLog> = {}): DepositLog =>
  ({
    id: 'log-1',
    deposit_date: '2026-08-10',
    production_cents: 700_000,
    new_patients_scheduled_count: 2,
    new_patients_seen_count: 1,
    sealed_at: null,
    sealed_by: null,
    needs_manager_review: false,
    staffing_assessment: 'about_right',
    ...over,
  }) as DepositLog;

describe('closeDayStatus', () => {
  it('no record while the office is open is calm, not urgent', () => {
    const s = closeDayStatus(null, 'open');
    expect(s.state).toBe('not_started');
    expect(s.tone).toBe('calm');
  });

  it('no record after close asks for attention', () => {
    const s = closeDayStatus(null, 'after_close');
    expect(s.state).toBe('not_started');
    expect(s.tone).toBe('attention');
  });

  it('a saved record with unanswered vitals is "in progress"', () => {
    const s = closeDayStatus(log({ new_patients_seen_count: null }), 'open');
    expect(s.state).toBe('in_progress');
  });

  it('a filled, unsealed record still needs the seal', () => {
    expect(closeDayStatus(log(), 'after_close').state).toBe('saved_unsealed');
  });

  it('sealed, and sealed-with-review, are distinct states', () => {
    expect(closeDayStatus(log({ sealed_at: 'x' }), 'after_close').state).toBe('sealed');
    expect(
      closeDayStatus(log({ sealed_at: 'x', needs_manager_review: true }), 'after_close').state,
    ).toBe('sealed_needs_review');
  });

  it('always links to the Close the Day record', () => {
    expect(closeDayStatus(null, 'open').href).toBe('/deposit-log');
  });
});
