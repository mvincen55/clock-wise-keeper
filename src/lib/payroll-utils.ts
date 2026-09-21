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
  /** The payroll minutes for the week: recorded punches plus signed adjustments. */
  total_minutes: number;
  /** Minutes from the entries' server-computed totals alone. */
  worked_minutes: number;
  /** Signed minutes from worked-hour adjustments dated inside the week. */
  adjustment_minutes: number;
  /** Minutes over 40h; 0 when the week is at or under 40h. */
  ot_minutes: number;
};

/** A worked-hour offset as the payroll report needs it: whose, when, how much. */
export type WorkedHourAdjustmentLike = {
  employee_id: string;
  entry_date: string;
  /** Signed hours (numeric(10,2) may arrive as a string from PostgREST). */
  hours_delta: number | string;
};

/** An adjustment's signed hours as whole minutes: 7.28h → 437, -7.28h → -437. */
export function adjustmentMinutes(hoursDelta: number | string): number {
  const hours = Number(hoursDelta);
  if (!Number.isFinite(hours)) return 0;
  return Math.round(hours * 60);
}

/** "+7.28h" / "-7.28h" — the sign always shows, so a deduction reads as one. */
export function formatSignedHours(hoursDelta: number | string): string {
  const hours = Number(hoursDelta);
  if (!Number.isFinite(hours) || hours === 0) return '0.00h';
  return `${hours > 0 ? '+' : '-'}${Math.abs(hours).toFixed(2)}h`;
}

/**
 * Per employee per payroll week: recorded minutes from the entries'
 * server-computed totals (which already exclude voided punches) plus the
 * worked-hour adjustments dated in that week. Adjustments count toward the
 * hours paid in the week they are dated, so they land in the week's total
 * and in its OT flag exactly like punched time — and a week that holds only
 * an adjustment still gets a row, because it is still paid.
 */
export function computeWeeklyTotals(
  entries: { employee_id: string | null; entry_date: string; total_minutes: number | null }[],
  weekStartDay: number,
  adjustments: WorkedHourAdjustmentLike[] = [],
): WeeklyTotalRow[] {
  const byKey = new Map<string, WeeklyTotalRow>();
  const rowFor = (employeeId: string, date: string): WeeklyTotalRow => {
    const week = weekStartOf(date, weekStartDay);
    const key = `${employeeId}|${week}`;
    let row = byKey.get(key);
    if (!row) {
      row = { employee_id: employeeId, week_start: week, total_minutes: 0, worked_minutes: 0, adjustment_minutes: 0, ot_minutes: 0 };
      byKey.set(key, row);
    }
    return row;
  };
  for (const e of entries) {
    if (!e.employee_id) continue;
    rowFor(e.employee_id, e.entry_date).worked_minutes += e.total_minutes ?? 0;
  }
  for (const a of adjustments) {
    rowFor(a.employee_id, a.entry_date).adjustment_minutes += adjustmentMinutes(a.hours_delta);
  }
  const rows = [...byKey.values()];
  for (const row of rows) {
    row.total_minutes = row.worked_minutes + row.adjustment_minutes;
    row.ot_minutes = Math.max(0, row.total_minutes - OT_WEEK_MINUTES);
  }
  rows.sort((a, b) => a.week_start.localeCompare(b.week_start) || a.employee_id.localeCompare(b.employee_id));
  return rows;
}

export type PunchLike = { punch_type: string; punch_time: string; source?: string };

/** One worked stretch of a day: a clock-in and the clock-out that closed it. */
export type PunchSegment<P extends PunchLike = PunchLike> = {
  in: P | null;
  out: P | null;
  /** Worked minutes of this stretch; null while it is still open or unpaired. */
  minutes: number | null;
  /** Minutes between the previous stretch's clock-out and this clock-in — lunch or a break. */
  break_minutes: number | null;
};

/**
 * Groups a day's live punches (seq order) into worked stretches so a
 * reader sees every clock-in and clock-out, with the lunch and break gaps
 * between them, instead of only the first in and the last out. Pairing is
 * forgiving: an out with no open in, or an in that never closed, still
 * shows up as its own row rather than vanishing.
 */
export function punchSegments<P extends PunchLike>(punches: P[]): PunchSegment<P>[] {
  const segments: PunchSegment<P>[] = [];
  let open: PunchSegment<P> | null = null;
  let lastOut: P | null = null;
  const minutesBetween = (a: P, b: P) => Math.round((new Date(b.punch_time).getTime() - new Date(a.punch_time).getTime()) / 60000);
  for (const p of punches) {
    if (p.punch_type === 'in') {
      if (open) segments.push(open);
      open = { in: p, out: null, minutes: null, break_minutes: lastOut ? minutesBetween(lastOut, p) : null };
    } else if (open) {
      open.out = p;
      open.minutes = minutesBetween(open.in!, p);
      segments.push(open);
      lastOut = p;
      open = null;
    } else {
      segments.push({ in: null, out: p, minutes: null, break_minutes: null });
      lastOut = p;
    }
  }
  if (open) segments.push(open);
  return segments;
}

/** "3h 15m" for a minute count. */
export function formatHoursMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

/** A break's length as people say it: "30m", or "1h 15m" once it passes an hour. */
export function formatBreak(minutes: number): string {
  return minutes >= 60 ? formatHoursMinutes(minutes) : `${minutes}m`;
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
