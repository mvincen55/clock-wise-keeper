/**
 * PTO usage — the hours a team member records as used, kept apart from
 * days off. The bank deducts these rows (`pto_usage`), never a day off by
 * itself: a time-off record reaches the bank only through the hours typed
 * on it, which the database mirrors into a `day_off` usage row. These
 * helpers shape the rows for the PTO page, the Team balances, and the
 * payroll report; the writes themselves are database functions
 * (record_pto_usage, void_pto_usage) that stamp who did what.
 */
import type { PtoUsageRow } from '@/integrations/supabase/pending-schema';

export type { PtoUsageRow };

export type PtoUsageSource = PtoUsageRow['source'];

export const PTO_USAGE_SOURCE_LABELS: Record<PtoUsageSource, string> = {
  employee: 'Recorded by team member',
  manager: 'Recorded by manager',
  day_off: 'From time-off record',
};

/** Rows that count: not voided. */
export function activePtoUsage<T extends { voided_at: string | null }>(rows: T[]): T[] {
  return rows.filter(r => !r.voided_at);
}

/** Hours recorded as used on days from `start` through `end` (inclusive), voided rows left out. */
export function ptoHoursBetween(rows: Pick<PtoUsageRow, 'usage_date' | 'hours' | 'voided_at'>[], start: string, end: string): number {
  return round2(activePtoUsage(rows).filter(r => r.usage_date >= start && r.usage_date <= end).reduce((sum, r) => sum + Number(r.hours), 0));
}

export type PtoUsageByEmployee = {
  employeeId: string;
  /** Oldest first. */
  rows: PtoUsageRow[];
  hours: number;
};

/** Active rows in a period, one group per team member, each group oldest first. */
export function groupPtoUsageByEmployee(rows: PtoUsageRow[], start: string, end: string): PtoUsageByEmployee[] {
  const groups = new Map<string, PtoUsageByEmployee>();
  for (const r of activePtoUsage(rows)) {
    if (r.usage_date < start || r.usage_date > end) continue;
    const g = groups.get(r.employee_id) ?? { employeeId: r.employee_id, rows: [], hours: 0 };
    g.rows.push(r);
    g.hours = round2(g.hours + Number(r.hours));
    groups.set(r.employee_id, g);
  }
  for (const g of groups.values()) g.rows.sort((a, b) => a.usage_date.localeCompare(b.usage_date) || a.created_at.localeCompare(b.created_at));
  return [...groups.values()];
}

/** "8.00h" */
export function formatPtoHours(hours: number | string): string {
  return `${Number(hours).toFixed(2)}h`;
}

/**
 * What the dialog says before the server's guard does: the hours must be a
 * positive number, and unless the person may go negative, within what is
 * available. Null when the entry can be saved.
 */
export function ptoUsageProblem(input: { hours: string; usageDate: string; available: number | null; allowNegative: boolean; displayName: string }): string | null {
  if (!input.usageDate) return 'Pick the date the PTO is used.';
  const trimmed = input.hours.trim();
  if (trimmed === '') return 'Enter the PTO hours being used.';
  const hours = Number(trimmed);
  if (!Number.isFinite(hours) || hours <= 0) return 'Enter the PTO hours being used: more than 0.';
  if (hours > 400) return 'Enter at most 400 hours.';
  if (!input.allowNegative) {
    if (input.available == null) return `No PTO starting balance is on file for ${input.displayName}. Set it on their Team card before recording PTO hours.`;
    if (hours > input.available + 0.005) return `Not enough PTO: ${input.displayName} has ${Math.max(input.available, 0).toFixed(2)} hours available and this would use ${hours.toFixed(2)}.`;
  }
  return null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
