/**
 * Business-hour notice math (Rule 2). The cutoff is the appointment time
 * minus noticeHours/24 business days; weekends and office closed dates are
 * skipped entirely — a non-business day contributes zero hours. A notice
 * timestamp at or before the cutoff is on time.
 */

/** Local-time ISO date (YYYY-MM-DD) — matches how closed dates are stored. */
function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isBusinessDay(d: Date, closed: Set<string>): boolean {
  const dow = d.getDay();
  if (dow === 0 || dow === 6) return false;
  return !closed.has(isoDate(d));
}

/**
 * Latest moment a cancellation still counts as enough notice.
 * With the default 48 business hours: Mon 9:00 AM → prior Thu 9:00 AM.
 */
export function businessHoursCutoff(
  appt: Date,
  noticeHours: number,
  closedDates: string[] = []
): Date {
  const closed = new Set(closedDates);
  const cutoff = new Date(appt);
  let days = Math.floor(noticeHours / 24);
  const remHours = noticeHours % 24;

  // Fractional day first (configs that aren't a multiple of 24): pull the
  // clock back, then walk whole days past any non-business day landed on.
  if (remHours > 0) {
    cutoff.setTime(cutoff.getTime() - remHours * 3_600_000);
    while (!isBusinessDay(cutoff, closed)) cutoff.setDate(cutoff.getDate() - 1);
  }

  // Whole business days: step back a calendar day at a time; only steps
  // that land on a business day consume notice.
  while (days > 0) {
    cutoff.setDate(cutoff.getDate() - 1);
    if (isBusinessDay(cutoff, closed)) days--;
  }
  return cutoff;
}

/** Rule 2 verdict: notice timestamp ≤ cutoff → on time. */
export function isOnTime(
  noticeAt: Date,
  appt: Date,
  noticeHours: number,
  closedDates: string[] = []
): boolean {
  return noticeAt.getTime() <= businessHoursCutoff(appt, noticeHours, closedDates).getTime();
}
