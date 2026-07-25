/**
 * PTO accrual math, extracted pure so the ledger is testable and the
 * tiers can come from org rows (genericization Phase 2). The functions
 * are behavior-identical to the engine that always ran in
 * usePtoEngine.ts; the ledger snapshot test guards every number.
 */

export interface PtoTier {
  minYears: number;
  maxYears: number;
  /** Accrued PTO hours per basis hour (worked-capped + PTO taken). */
  rate: number;
  /** Max accrued hours per week at this tier. */
  weeklyCap: number;
  label: string;
}

/** Shipped default tiers — the original office's policy. */
export const DEFAULT_PTO_TIERS: PtoTier[] = [
  { minYears: 0, maxYears: 1, rate: 0.0576, weeklyCap: 2.30, label: 'Year 1' },
  { minYears: 1, maxYears: 5, rate: 0.0769, weeklyCap: 3.08, label: 'Years 2–5' },
  { minYears: 5, maxYears: 11, rate: 0.0962, weeklyCap: 3.85, label: 'Year 6–11' },
  { minYears: 11, maxYears: 999, rate: 0.1009, weeklyCap: 4.00, label: 'Year 12+' },
];

export function getTierForDate(
  hireDate: string,
  checkDate: string,
  tiers: PtoTier[] = DEFAULT_PTO_TIERS
): PtoTier {
  const hire = new Date(hireDate + 'T00:00:00');
  const check = new Date(checkDate + 'T00:00:00');
  const years = (check.getTime() - hire.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  return tiers.find(t => years >= t.minYears && years < t.maxYears) || tiers[0];
}

export interface PtoLedgerInput {
  /** Starting point: 'YYYY-MM-DD' and the balance on that date. */
  snapshotDate: string;
  snapshotBalanceHours: number;
  hireDate: string;
  workedHoursCapWeekly: number;
  maxBalanceHours: number;
  /** Time entries from the snapshot date forward. */
  entries: { entryDate: string; totalMinutes: number }[];
  /** Days off from the snapshot date forward. */
  daysOff: { dateStart: string; hours: number | null; type: string }[];
  /** End of the computed range, 'YYYY-MM-DD' (today in office time). */
  todayISO: string;
  tiers?: PtoTier[];
}

export interface PtoLedgerRow {
  periodStart: string;
  periodEnd: string;
  workedHoursRaw: number;
  workedHoursCapped: number;
  ptoTakenHours: number;
  tierRate: number;
  calculatedAccrual: number;
  weeklyCap: number;
  accrualCredited: number;
  runningBalance: number;
}

/**
 * Weekly accrual ledger from the snapshot forward: Sun–Sat weeks, accrual
 * = tier rate × (capped worked hours + PTO taken), capped per week and by
 * the max balance; PTO taken comes off the running balance.
 */
export function computePtoLedger(input: PtoLedgerInput): PtoLedgerRow[] {
  const tiers = input.tiers ?? DEFAULT_PTO_TIERS;

  // Build Sun–Sat weeks starting at the first Sunday on/after the snapshot.
  const snapDate = new Date(input.snapshotDate + 'T00:00:00');
  const firstSunday = new Date(snapDate);
  while (firstSunday.getDay() !== 0) firstSunday.setDate(firstSunday.getDate() + 1);
  const today = new Date(input.todayISO + 'T23:59:59');

  const weeks: { start: string; end: string }[] = [];
  const cur = new Date(firstSunday);
  while (cur <= today) {
    const end = new Date(cur);
    end.setDate(end.getDate() + 6);
    weeks.push({
      start: cur.toISOString().split('T')[0],
      end: end.toISOString().split('T')[0],
    });
    cur.setDate(cur.getDate() + 7);
  }

  let runningBalance = input.snapshotBalanceHours;
  const rows: PtoLedgerRow[] = [];

  for (const week of weeks) {
    const workedMinutes = input.entries
      .filter(e => e.entryDate >= week.start && e.entryDate <= week.end)
      .reduce((sum, e) => sum + (e.totalMinutes || 0), 0);
    const workedHoursRaw = workedMinutes / 60;
    const workedHoursCapped = Math.min(workedHoursRaw, input.workedHoursCapWeekly);

    const ptoTaken = input.daysOff
      .filter(d => d.dateStart >= week.start && d.dateStart <= week.end && d.type !== 'office_closed')
      .reduce((sum, d) => sum + (d.hours != null ? Number(d.hours) : 8), 0);

    const tier = getTierForDate(input.hireDate, week.start, tiers);

    const basisHours = workedHoursCapped + ptoTaken;
    const calculatedAccrual = parseFloat((tier.rate * basisHours).toFixed(4));
    const cappedAccrual = Math.min(calculatedAccrual, tier.weeklyCap);

    let accrualCredited = cappedAccrual;
    if (runningBalance + accrualCredited > input.maxBalanceHours) {
      accrualCredited = Math.max(0, input.maxBalanceHours - runningBalance);
    }
    accrualCredited = parseFloat(accrualCredited.toFixed(2));

    runningBalance = parseFloat((runningBalance + accrualCredited - ptoTaken).toFixed(2));

    rows.push({
      periodStart: week.start,
      periodEnd: week.end,
      workedHoursRaw: parseFloat(workedHoursRaw.toFixed(2)),
      workedHoursCapped: parseFloat(workedHoursCapped.toFixed(2)),
      ptoTakenHours: parseFloat(ptoTaken.toFixed(2)),
      tierRate: tier.rate,
      calculatedAccrual: parseFloat(calculatedAccrual.toFixed(2)),
      weeklyCap: tier.weeklyCap,
      accrualCredited,
      runningBalance,
    });
  }

  return rows;
}
