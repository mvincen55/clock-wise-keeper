/**
 * Shared helpers for the richer invite flow: an inviting manager can capture a
 * new hire's start date, their current PTO balance, and a weekly work schedule.
 * `accept-invite` later reads these off the invite and seeds the employee's
 * hire date, PTO snapshot, and schedule version so tracking is correct from
 * day one.
 *
 * Everything here is pure so it can be unit-tested and reused by the invite
 * modal and the pending-invites list. The Deno edge functions intentionally
 * re-implement the same sanitization (they cannot import from `src/`).
 */

export type WeekdaySchedule = {
  /** 0 = Sunday … 6 = Saturday, matching Postgres EXTRACT(DOW). */
  weekday: number;
  enabled: boolean;
  /** 'HH:MM' 24-hour. */
  start_time: string;
  end_time: string;
};

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_FULL = [
  'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday',
];

const DEFAULT_START = '08:00';
const DEFAULT_END = '17:00';
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A sensible starting point: Monday–Friday, 8:00–5:00. */
export function defaultWeeklySchedule(): WeekdaySchedule[] {
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({
    weekday,
    enabled: weekday >= 1 && weekday <= 5,
    start_time: DEFAULT_START,
    end_time: DEFAULT_END,
  }));
}

export function isValidTimeString(value: unknown): value is string {
  return typeof value === 'string' && TIME_RE.test(value);
}

function coerceTime(value: unknown, fallback: string): string {
  return isValidTimeString(value) ? value : fallback;
}

/**
 * Normalizes arbitrary input into exactly one row per weekday (0–6), in order.
 * Missing days are filled as disabled; invalid times fall back to defaults.
 */
export function sanitizeWeeklySchedule(input: unknown): WeekdaySchedule[] {
  const byDay = new Map<number, Partial<WeekdaySchedule>>();
  if (Array.isArray(input)) {
    for (const raw of input) {
      if (!raw || typeof raw !== 'object') continue;
      const day = Number((raw as { weekday?: unknown }).weekday);
      if (!Number.isInteger(day) || day < 0 || day > 6) continue;
      byDay.set(day, raw as Partial<WeekdaySchedule>);
    }
  }
  return [0, 1, 2, 3, 4, 5, 6].map((weekday) => {
    const row = byDay.get(weekday);
    return {
      weekday,
      enabled: row ? Boolean(row.enabled) : false,
      start_time: coerceTime(row?.start_time, DEFAULT_START),
      end_time: coerceTime(row?.end_time, DEFAULT_END),
    };
  });
}

export function scheduleHasAnyEnabled(schedule: WeekdaySchedule[]): boolean {
  return schedule.some((d) => d.enabled);
}

/** Only the enabled weekdays, ordered Sun→Sat, ready to materialize as rows. */
export function enabledScheduleDays(schedule: WeekdaySchedule[]): WeekdaySchedule[] {
  return sanitizeWeeklySchedule(schedule).filter((d) => d.enabled);
}

/** '08:00' → '8:00 AM'. */
export function formatTime12(hhmm: string): string {
  if (!isValidTimeString(hhmm)) return hhmm;
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const period = h < 12 ? 'AM' : 'PM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${mStr} ${period}`;
}

/**
 * Short human summary of the working week. If every working day shares the same
 * hours we show them once (e.g. "Mon, Tue, Wed, Thu, Fri · 8:00 AM–5:00 PM"),
 * otherwise just the day count.
 */
export function formatScheduleSummary(schedule: WeekdaySchedule[]): string {
  const enabled = enabledScheduleDays(schedule);
  if (enabled.length === 0) return 'No scheduled days';
  const days = enabled.map((d) => WEEKDAY_LABELS[d.weekday]).join(', ');
  const uniformHours = enabled.every(
    (d) => d.start_time === enabled[0].start_time && d.end_time === enabled[0].end_time,
  );
  if (uniformHours) {
    return `${days} · ${formatTime12(enabled[0].start_time)}–${formatTime12(enabled[0].end_time)}`;
  }
  return `${days} · varied hours`;
}

/**
 * Parses the "current PTO balance" field. Empty → null (nothing seeded).
 * Balances can be negative (the PTO engine anchors on a snapshot that may be
 * below zero), so we allow negatives but clamp to a sane range and 2 decimals.
 */
export function parseInitialPtoHours(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'string' && input.trim() === '') return null;
  const n = typeof input === 'number' ? input : Number(input);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.max(-9999, Math.min(99999, n));
  return Math.round(clamped * 100) / 100;
}

/** Validates a 'YYYY-MM-DD' date string; anything else → null. */
export function parseStartDate(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const trimmed = input.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const [y, m, d] = trimmed.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return trimmed;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** 'YYYY-MM-DD' or ISO timestamp → 'Aug 10, 2026' (timezone-stable). */
export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return '';
  const datePart = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return '';
  const [y, m, d] = datePart.split('-').map(Number);
  if (m < 1 || m > 12) return '';
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days remaining until the invite expires (0 once under a day / expired). */
export function daysUntilExpiry(expiresAt: string, now: Date = new Date()): number {
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return 0;
  const diffMs = expiry - now.getTime();
  if (diffMs <= 0) return 0;
  return Math.floor(diffMs / DAY_MS);
}

export function isInviteExpired(expiresAt: string, now: Date = new Date()): boolean {
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return false;
  return expiry <= now.getTime();
}

/** Short "expires in N days" / "expired" label for the pending list. */
export function formatExpiry(expiresAt: string, now: Date = new Date()): string {
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return '';
  const diffMs = expiry - now.getTime();
  if (diffMs <= 0) return 'Expired';
  if (diffMs < DAY_MS) return 'Expires today';
  const days = Math.floor(diffMs / DAY_MS);
  if (days === 1) return 'Expires in 1 day';
  return `Expires in ${days} days`;
}
