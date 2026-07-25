/**
 * PTO ledger invariant (genericization Phase 2): the accrual math moves
 * from hardcoded tiers to org rows, so this snapshot pins the full
 * ledger a known fixture produces — every week's worked/capped/taken
 * hours, tier rate, accrual, and running balance. Any diff means the
 * refactor changed accrual math; the phase fails.
 *
 * The fixture spans a tier boundary (hire 2022-02-07 crosses the 1-year
 * and 5-year lines), exercises the weekly cap, the max-balance cap, PTO
 * taken with explicit and default (8h) hours, and office_closed days
 * that must not count.
 */
import { describe, it, expect } from 'vitest';
import { computePtoLedger, DEFAULT_PTO_TIERS, getTierForDate } from '@/lib/pto';

describe('getTierForDate', () => {
  it('maps years of service onto the tier table', () => {
    expect(getTierForDate('2022-02-07', '2022-06-01').label).toBe('Year 1');
    expect(getTierForDate('2022-02-07', '2023-02-08').label).toBe('Years 2–5');
    expect(getTierForDate('2022-02-07', '2027-02-08').label).toBe('Year 6–11');
    expect(getTierForDate('2022-02-07', '2033-02-08').label).toBe('Year 12+');
  });

  it('accepts a custom tier table', () => {
    const custom = [
      { minYears: 0, maxYears: 2, rate: 0.05, weeklyCap: 2, label: 'A' },
      { minYears: 2, maxYears: 999, rate: 0.1, weeklyCap: 4, label: 'B' },
    ];
    expect(getTierForDate('2022-02-07', '2023-06-01', custom).label).toBe('A');
    expect(getTierForDate('2022-02-07', '2024-06-01', custom).label).toBe('B');
  });
});

describe('PTO ledger invariant — reference output must never change', () => {
  it('computes the reference ledger byte-for-byte', () => {
    const entries: { entryDate: string; totalMinutes: number }[] = [];
    // Deterministic five-day weeks: 7.6h/day Mon–Fri for 16 weeks from
    // 2026-02-16 (Mon), with one 50-hour week to exercise the cap.
    const start = new Date('2026-02-16T00:00:00');
    for (let week = 0; week < 16; week++) {
      for (let day = 0; day < 5; day++) {
        const d = new Date(start);
        d.setDate(d.getDate() + week * 7 + day);
        entries.push({
          entryDate: d.toISOString().split('T')[0],
          totalMinutes: week === 3 ? 600 : 456, // one 50h week, else 38h
        });
      }
    }

    const rows = computePtoLedger({
      snapshotDate: '2026-02-14',
      snapshotBalanceHours: -1.63,
      hireDate: '2022-02-07',
      workedHoursCapWeekly: 40,
      maxBalanceHours: 12, // low cap so the max-balance clamp engages
      entries,
      daysOff: [
        { dateStart: '2026-03-11', hours: 8, type: 'pto' },
        { dateStart: '2026-04-02', hours: null, type: 'pto' }, // defaults to 8h
        { dateStart: '2026-04-15', hours: 4, type: 'pto' },
        { dateStart: '2026-05-25', hours: 8, type: 'office_closed' }, // must not count
      ],
      todayISO: '2026-06-06',
      tiers: DEFAULT_PTO_TIERS,
    });

    expect(rows.length).toBe(16);
    // Spot-checked anchors, then the full ledger as the reference.
    expect(rows[0]).toEqual({
      periodStart: '2026-02-15',
      periodEnd: '2026-02-21',
      workedHoursRaw: 38,
      workedHoursCapped: 38,
      ptoTakenHours: 0,
      tierRate: 0.0769, // years 2–5 tier at ~4 years of service
      calculatedAccrual: 2.92,
      weeklyCap: 3.08,
      accrualCredited: 2.92,
      runningBalance: 1.29,
    });
    // The 50-hour week is capped to 40 basis hours.
    expect(rows[3].workedHoursRaw).toBe(50);
    expect(rows[3].workedHoursCapped).toBe(40);
    expect(rows).toMatchSnapshot();
  });

  it('explicit default tiers equal the implicit default', () => {
    const input = {
      snapshotDate: '2026-02-14',
      snapshotBalanceHours: 0,
      hireDate: '2022-02-07',
      workedHoursCapWeekly: 40,
      maxBalanceHours: 100,
      entries: [{ entryDate: '2026-02-16', totalMinutes: 480 }],
      daysOff: [],
      todayISO: '2026-02-22',
    };
    expect(computePtoLedger(input)).toEqual(
      computePtoLedger({ ...input, tiers: DEFAULT_PTO_TIERS })
    );
  });
});
