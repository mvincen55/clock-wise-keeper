/**
 * Onboarding lifecycle — pure mirrors of the SQL sweep's rules
 * (_onboarding_lifecycle_sweep_internal + start_onboarding_instance in
 * migration 20260825150000), so trigger timing and review scheduling are
 * unit-testable. The database is authoritative; a drift between these and
 * the SQL is a bug the lifecycle tests exist to catch.
 */

/** Mirror of the SQL review label: 7 is the week-one review by name. */
export function reviewLabel(offsetDays: number): string {
  return offsetDays === 7 ? 'Week-1 review' : `${offsetDays}-day review`;
}

/** Review due dates are start date + offset, on the office's ET calendar. */
export function reviewDueDate(startDateEt: string, offsetDays: number): string {
  const [y, m, d] = startDateEt.split('-').map(Number);
  const noonUtc = new Date(Date.UTC(y, m - 1, d, 12));
  noonUtc.setUTCDate(noonUtc.getUTCDate() + offsetDays);
  return noonUtc.toISOString().slice(0, 10);
}

/** An item is stale once it has been open longer than the threshold. */
export function isItemStale(
  createdAt: string,
  completedAt: string | null,
  thresholdDays: number,
  now: Date = new Date(),
): boolean {
  if (completedAt) return false;
  const created = new Date(createdAt).getTime();
  if (!Number.isFinite(created)) return false;
  return now.getTime() - created > thresholdDays * 24 * 60 * 60 * 1000;
}

/**
 * The engine's trigger rule: at least threshold_count items stale past
 * threshold_window_days raises ONE manager task for the instance.
 */
export function staleTriggerCount(
  items: ReadonlyArray<{ created_at: string; completed_at: string | null }>,
  thresholdDays: number,
  now: Date = new Date(),
): number {
  return items.filter(i => isItemStale(i.created_at, i.completed_at, thresholdDays, now)).length;
}

export function shouldRaiseStaleTask(
  items: ReadonlyArray<{ created_at: string; completed_at: string | null }>,
  policy: { threshold_count: number; threshold_window_days: number },
  now: Date = new Date(),
): boolean {
  return staleTriggerCount(items, policy.threshold_window_days, now) >= policy.threshold_count;
}

/** Settings-card parser: positive whole days, deduped, sorted, sane bounds. */
export function parseReviewDays(
  raw: string,
): { ok: boolean; days?: number[]; reason?: string } {
  const parts = raw
    .split(/[,\s]+/)
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length === 0) {
    return { ok: false, reason: 'Enter at least one review day (e.g. 7, 30, 60, 90).' };
  }
  if (parts.length > 12) {
    return { ok: false, reason: 'Keep it to 12 review marks or fewer.' };
  }
  const days: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 1 || n > 365) {
      return { ok: false, reason: `"${p}" is not a whole day between 1 and 365.` };
    }
    if (!days.includes(n)) days.push(n);
  }
  days.sort((a, b) => a - b);
  return { ok: true, days };
}
