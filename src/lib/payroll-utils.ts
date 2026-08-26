/**
 * Payroll-week math and time-record flags for the org-wide report.
 *
 * The single week definition is payroll_settings.week_start_day (0 =
 * Sunday … 6 = Saturday); every consumer in the payroll report goes
 * through weekStartOf so there is exactly one notion of "the week".
 *
 * This module flags — it never blocks. Overtime here means "hours over
 * 40 in a payroll week"; the system does not compute overtime PAY and
 * must not pretend to. It surfaces the flag so the payroll operator
 * (Paychex or otherwise) cannot miss it.
 */

/** 40 hours. A payroll week over this gets an OT flag. */
export const OT_WEEK_MINUTES = 2400;

/**
 * The week-start date (YYYY-MM-DD) containing `date`, for a week that
 * begins on `weekStartDay` (0=Sun…6=Sat). Plain-date arithmetic through
 * UTC noon, same DST-proof pattern as time-utils.
 */
export function weekStartOf(date: string, weekStartDay: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  const dow = noonUtc.getUTCDay();
  noonUtc.setUTCDate(noonUtc.getUTCDate() - ((dow - weekStartDay + 7) % 7));
  return noonUtc.toISOString().slice(0, 10);
}

export type WeeklyTotalRow = {
  employee_id: string;
  week_start: string;
  total_minutes: number;
  /** Minutes over 40h; 0 when the week is at or under 40h. */
  ot_minutes: number;
};

/**
 * Per employee per payroll week, total worked minutes from the entries'
 * server-computed totals (which already exclude voided punches).
 */
export function computeWeeklyTotals(
  entries: { employee_id: string | null; entry_date: string; total_minutes: number | null }[],
  weekStartDay: number,
): WeeklyTotalRow[] {
  const byKey = new Map<string, WeeklyTotalRow>();
  for (const e of entries) {
    if (!e.employee_id) continue;
    const week = weekStartOf(e.entry_date, weekStartDay);
    const key = `${e.employee_id}|${week}`;
    const row = byKey.get(key) ?? { employee_id: e.employee_id, week_start: week, total_minutes: 0, ot_minutes: 0 };
    row.total_minutes += e.total_minutes ?? 0;
    byKey.set(key, row);
  }
  const rows = [...byKey.values()];
  for (const row of rows) {
    row.ot_minutes = Math.max(0, row.total_minutes - OT_WEEK_MINUTES);
  }
  rows.sort((a, b) => a.week_start.localeCompare(b.week_start) || a.employee_id.localeCompare(b.employee_id));
  return rows;
}

/** "3h 15m" for a minute count. */
export function formatHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

/** The OT flag text, e.g. "OT: 3h 15m over". */
export function formatOtFlag(otMinutes: number): string {
  return `OT: ${formatHoursMinutes(otMinutes)} over`;
}

export type TimeStatus = 'OK' | 'MISSING DAY' | 'MISSING PUNCH' | 'ANOMALY';

/**
 * Flags one entry's day from its LIVE punches (seq-ordered) and its
 * server-computed total.
 *
 *  - ANOMALY: the sequence breaks in/out alternation (the in/in
 *    silent-zero case), any pair runs negative, or the day has punches
 *    but computes zero minutes.
 *  - MISSING PUNCH: an unpaired sequence (odd count, or last punch is
 *    an in) on any day before today — a still-open TODAY is normal.
 *  - null: nothing wrong.
 */
export function detectDayIssue(
  punches: { punch_type: string; punch_time: string }[],
  totalMinutes: number | null,
  entryDate: string,
  today: string,
): Exclude<TimeStatus, 'OK' | 'MISSING DAY'> | null {
  if (punches.length === 0) return null;

  for (let i = 0; i < punches.length; i++) {
    const expected = i % 2 === 0 ? 'in' : 'out';
    if (punches[i].punch_type !== expected) return 'ANOMALY';
  }
  for (let i = 0; i + 1 < punches.length; i += 2) {
    if (new Date(punches[i + 1].punch_time).getTime() < new Date(punches[i].punch_time).getTime()) {
      return 'ANOMALY';
    }
  }

  const unpaired = punches.length % 2 !== 0 || punches[punches.length - 1].punch_type === 'in';
  if (unpaired) {
    return entryDate < today ? 'MISSING PUNCH' : null;
  }

  if ((totalMinutes ?? 0) === 0) return 'ANOMALY';
  return null;
}

/**
 * The worked-hours component of the PTO accrual basis. Hours over
 * 40/week never accrue PTO, regardless of the office's cap setting —
 * overtime does not earn time off.
 */
export function accrualBasisWorkedHours(rawHours: number, capSetting: number): number {
  return Math.min(rawHours, capSetting, 40);
}
