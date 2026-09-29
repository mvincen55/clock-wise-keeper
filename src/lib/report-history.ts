/**
 * Read-only adapter over loaded prepared-report packages
 * (practice_report_imports). It turns each package's
 * `daily_financials_by_entry_date` rows into posting-day points the Home
 * chart can show as its own labeled view — never merged with closeouts.
 *
 * Overlap rule: when two packages cover the same posting day, the most
 * recently imported package wins that day and the other is ignored for it.
 * Nothing is added together across packages.
 */
import type { ComparisonMonth, PreparedReport } from '@/lib/prepared-report';
import type { ReportDay } from '@/lib/performance-series';

export type ReportImportRow = {
  id: string;
  report_start: string;
  report_end: string;
  imported_at: string;
  payload: PreparedReport;
};

export type ReportPackage = {
  id: string;
  start: string;
  end: string;
  importedAt: string;
  /** Posting days the package lists. */
  days: number;
  /** Months the package marks as partial coverage. */
  partialMonths: string[];
};

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isCents = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);

/** One point per posting day, most recent import winning an overlap. */
export function reportDaysFrom(imports: ReportImportRow[]): ReportDay[] {
  const ordered = [...imports].sort((a, b) => b.imported_at.localeCompare(a.imported_at));
  const byDate = new Map<string, ReportDay>();
  for (const imp of ordered) {
    const start = imp.payload?.daily_report_range?.start ?? imp.report_start;
    const end = imp.payload?.daily_report_range?.end ?? imp.report_end;
    const rows = Array.isArray(imp.payload?.daily_financials_by_entry_date) ? imp.payload.daily_financials_by_entry_date : [];
    for (const r of rows) {
      if (!isDate(r.date) || !isCents(r.posted_charges_cents) || !isCents(r.recorded_payments_cents)) continue;
      if (r.date < imp.report_start || r.date > imp.report_end) continue;
      if (r.date < start || r.date > end) continue;
      if (byDate.has(r.date)) continue; // an older package never overrides a newer one
      byDate.set(r.date, {
        date: r.date,
        postedChargesCents: r.posted_charges_cents,
        receiptsCents: r.recorded_payments_cents,
        packageStart: start,
        packageEnd: end,
        importedAt: imp.imported_at,
        dateBasis: imp.payload.financial_date_basis ?? 'entry_date',
      });
    }
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function reportPackagesFrom(imports: ReportImportRow[]): ReportPackage[] {
  return imports
    .map(imp => ({
      id: imp.id,
      start: imp.payload.daily_report_range?.start ?? imp.report_start,
      end: imp.payload.daily_report_range?.end ?? imp.report_end,
      importedAt: imp.imported_at,
      days: Array.isArray(imp.payload?.daily_financials_by_entry_date) ? imp.payload.daily_financials_by_entry_date.length : 0,
      partialMonths: (Array.isArray(imp.payload?.monthly_financials_by_entry_date) ? imp.payload.monthly_financials_by_entry_date : [])
        .filter(m => m.coverage === 'partial' && typeof m.month === 'string')
        .map(m => m.month as string),
    }))
    .sort((a, b) => b.end.localeCompare(a.end));
}

export type ReportMonth = ComparisonMonth & { packageId: string };

/** Whole monthly observations are selected once, never added to daily totals.
 * Explicit comparison rows retain their approved source choice. As with days,
 * the newest import wins an overlapping month; other packages remain intact.
 * Home reads these too: a `full_calendar_month` row is the authoritative
 * total for that month (`authoritativeTotals` in performance-series).
 */
export function reportMonthsFrom(imports: ReportImportRow[]): ReportMonth[] {
  const byMonth = new Map<string, ReportMonth>();
  const ordered = [...imports].sort((a,b)=>b.imported_at.localeCompare(a.imported_at));
  for (const imp of ordered) {
    const rows: ComparisonMonth[] = imp.payload.monthly_comparison?.rows ?? (imp.payload.monthly_financials_by_entry_date ?? []).map(r=>({
      month: r.month, production_cents: r.posted_charges_cents, collections_cents: r.recorded_payments_cents,
      coverage: r.coverage, source_kind: 'daysheet', source_label: 'Daysheet report',
      production_basis: imp.payload.financial_date_basis === 'source_date' ? 'Charges by date printed on the source' : 'Charges by entry date',
      collections_basis: 'Recorded receipts', source_reference: `${imp.report_start} through ${imp.report_end}`,
    }));
    for (const row of rows) {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(row.month) || !isCents(row.production_cents) || !isCents(row.collections_cents)) continue;
      if (row.month < imp.report_start.slice(0,7) || row.month > imp.report_end.slice(0,7) || byMonth.has(row.month)) continue;
      byMonth.set(row.month,{...row,packageId:imp.id});
    }
  }
  return [...byMonth.values()].sort((a,b)=>a.month.localeCompare(b.month));
}

/** The package whose range best matches a requested range: covering first, else the largest overlap. */
export function packageForRange(packages: ReportPackage[], start: string, end: string): ReportPackage | null {
  const covering = packages.find(p => p.start <= start && p.end >= end);
  if (covering) return covering;
  let best: ReportPackage | null = null;
  let bestOverlap = 0;
  for (const p of packages) {
    const s = p.start > start ? p.start : start;
    const e = p.end < end ? p.end : end;
    if (s > e) continue;
    const overlap = Date.parse(`${e}T12:00:00Z`) - Date.parse(`${s}T12:00:00Z`);
    if (overlap >= bestOverlap) {
      best = p;
      bestOverlap = overlap;
    }
  }
  return best;
}
