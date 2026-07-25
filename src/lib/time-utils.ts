/**
 * Time utilities.
 *
 * CONVENTION: `punch_time` and all timestamps in the database are REAL UTC
 * (`new Date().toISOString()`). Display formatting always converts to
 * America/New_York. Never mix these two concepts.
 */

const APP_TZ = 'America/New_York';

export function minutesToHHMM(minutes: number): string {
  const h = Math.floor(Math.abs(minutes) / 60);
  const m = Math.abs(minutes) % 60;
  const sign = minutes < 0 ? '-' : '';
  return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

export function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Format an ISO/Date as HH:MM AM/PM in America/New_York. */
export function formatTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: APP_TZ });
}

export function formatDate(date: Date | string): string {
  if (typeof date === 'string') {
    // Date-only string (YYYY-MM-DD) → render as calendar date, no TZ shift.
    if (!date.includes('T')) {
      const d = new Date(date + 'T12:00:00Z');
      return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: APP_TZ });
    }
    const d = new Date(date);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: APP_TZ });
  }
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: APP_TZ });
}

export function formatDateShort(date: Date | string): string {
  if (typeof date === 'string' && !date.includes('T')) {
    const d = new Date(date + 'T12:00:00Z');
    return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', timeZone: APP_TZ });
  }
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', timeZone: APP_TZ });
}

/** Today's calendar date in America/New_York as YYYY-MM-DD. */
export function getToday(): string {
  return easternDateKey(new Date());
}

/** YYYY-MM-DD calendar date in America/New_York for a given instant. */
export function easternDateKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  // en-CA yields YYYY-MM-DD
  return d.toLocaleDateString('en-CA', { timeZone: APP_TZ });
}

/**
 * Current instant as a real UTC ISO string with seconds/ms zeroed.
 * Retained under the old name to minimize churn; semantics changed to real UTC.
 * Prefer `nowUtcIso()` in new code.
 */
export function nowEasternIso(): string {
  return nowUtcIso();
}

export function nowUtcIso(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  return d.toISOString();
}

/** Strip seconds/ms from an ISO timestamp, preserving UTC. */
export function stripSeconds(iso: string): string {
  const d = new Date(iso);
  d.setSeconds(0, 0);
  return d.toISOString();
}

/** UTC offset of America/New_York in minutes at a given instant (-300 EST, -240 EDT). */
export function getEasternOffsetMinutes(atInstant: Date): number {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ, timeZoneName: 'shortOffset', year: 'numeric',
  });
  const tzName = dtf.formatToParts(atInstant).find(p => p.type === 'timeZoneName')?.value || 'GMT-5';
  const m = tzName.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!m) return -300;
  const sign = m[1] === '+' ? 1 : -1;
  return sign * (parseInt(m[2], 10) * 60 + (m[3] ? parseInt(m[3], 10) : 0));
}

/** HH:MM wall-clock in America/New_York for an instant — the value for <input type="time">. */
export function easternTimeInputValue(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parts.find(p => p.type === t)?.value || '00';
  let h = get('hour');
  if (h === '24') h = '00';
  return `${h}:${get('minute')}`;
}

/**
 * Convert an America/New_York wall-clock date + HH:MM to a real UTC ISO string.
 * DST-correct via double offset resolution: ambiguous times (fall-back) resolve to
 * the earlier occurrence (EDT); nonexistent times (spring-forward gap) shift forward.
 */
export function easternWallToUtcIso(dateStr: string, hours: number, minutes: number): string {
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const wall = `${hh}:${mm}`;
  const guess = new Date(`${dateStr}T${hh}:${mm}:00Z`);

  const candidate1 = new Date(guess.getTime() - getEasternOffsetMinutes(guess) * 60000);
  if (easternTimeInputValue(candidate1) === wall && easternDateKey(candidate1) === dateStr) {
    return candidate1.toISOString();
  }
  const candidate2 = new Date(guess.getTime() - getEasternOffsetMinutes(candidate1) * 60000);
  if (easternTimeInputValue(candidate2) === wall && easternDateKey(candidate2) === dateStr) {
    return candidate2.toISOString();
  }
  // Nonexistent wall time (spring-forward gap): no instant matches; candidate1 shifts forward.
  return candidate1.toISOString();
}

/**
 * Local wall-clock minutes-since-midnight for an instant in America/New_York.
 * Used to compare punch times against a schedule's HH:MM.
 */
export function easternWallMinutes(iso: string | Date): number {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(d);
  const get = (t: string) => parseInt(parts.find(p => p.type === t)?.value || '0', 10);
  let h = get('hour');
  if (h === 24) h = 0;
  return h * 60 + get('minute');
}

export function calculatePunchMinutes(punches: { punch_type: string; punch_time: string }[]): number {
  let total = 0;
  const sorted = [...punches].sort((a, b) => new Date(a.punch_time).getTime() - new Date(b.punch_time).getTime());

  for (let i = 0; i < sorted.length - 1; i += 2) {
    if (sorted[i].punch_type === 'in' && sorted[i + 1]?.punch_type === 'out') {
      const inTime = new Date(sorted[i].punch_time).getTime();
      const outTime = new Date(sorted[i + 1].punch_time).getTime();
      total += (outTime - inTime) / 60000;
    }
  }
  return Math.round(total);
}
