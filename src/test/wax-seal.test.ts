import { describe, expect, it } from 'vitest';
import {
  EMPTY_LEDGER,
  loadLedger,
  monthKey,
  nextSeal,
  recordSeal,
  saveLedger,
  shouldSeal,
} from '@/lib/wax-seal';

describe('wax seal — once per month', () => {
  it('seals a fresh milestone when the month is untouched', () => {
    expect(shouldSeal('streak-5', '2026-07-30', EMPTY_LEDGER)).toBe(true);
  });

  it('refuses a second seal in the same month', () => {
    const ledger = recordSeal('streak-5', '2026-07-02');
    expect(shouldSeal('goal-complete', '2026-07-30', ledger)).toBe(false);
  });

  it('allows the next seal once the month rolls over', () => {
    const ledger = recordSeal('streak-5', '2026-07-02');
    expect(shouldSeal('goal-complete', '2026-08-01', ledger)).toBe(true);
  });

  it('never seals the same milestone twice, even across months', () => {
    const ledger = recordSeal('streak-5', '2026-07-02');
    expect(shouldSeal('streak-5', '2026-09-15', ledger)).toBe(false);
  });

  it('picks only one milestone when several land at once', () => {
    const earned = ['streak-5', 'streak-20', 'goal-complete'];
    const first = nextSeal(earned, '2026-07-30', EMPTY_LEDGER);
    expect(first).toBe('streak-5');
    const after = recordSeal(first!, '2026-07-30');
    expect(nextSeal(earned, '2026-07-31', after)).toBeNull();
    expect(nextSeal(earned, '2026-08-01', after)).toBe('streak-20');
  });

  it('does not mutate the ledger it is given', () => {
    const ledger = { sealed: ['a'], lastSealedMonth: '2026-06' };
    const next = recordSeal('b', '2026-07-01', ledger);
    expect(ledger.sealed).toEqual(['a']);
    expect(next.sealed).toEqual(['a', 'b']);
    expect(next.lastSealedMonth).toBe('2026-07');
  });

  it('is a no-op when re-recording an already sealed milestone', () => {
    const ledger = recordSeal('a', '2026-06-10');
    expect(recordSeal('a', '2026-07-10', ledger)).toBe(ledger);
  });

  it('reads month keys off ISO dates and timestamps', () => {
    expect(monthKey('2026-07-30')).toBe('2026-07');
    expect(monthKey('2026-12-01T14:03:00Z')).toBe('2026-12');
  });

  it('survives unreadable stored ledgers', () => {
    const bad = { getItem: () => 'not json' };
    expect(loadLedger(bad)).toEqual(EMPTY_LEDGER);
  });

  it('round-trips through storage', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };
    const ledger = recordSeal('streak-5', '2026-07-30');
    saveLedger(ledger, storage);
    expect(loadLedger(storage)).toEqual(ledger);
  });

  it('never throws when storage is blocked', () => {
    const storage = {
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(() => saveLedger(EMPTY_LEDGER, storage)).not.toThrow();
  });
});
