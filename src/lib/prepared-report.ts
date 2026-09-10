export const REPORT_SCHEMA = 'purple-envelope-prepared-report-package-v1';
export type ReportRow = Record<string, any>;
export type PreparedReport = {
  schema_version: string; target_org_id: string; report_start: string; report_end: string;
  sources: ReportRow[]; source_control_totals: ReportRow; definitions: Record<string, string>;
  monthly_financials_by_entry_date: ReportRow[]; daily_financials_by_entry_date: ReportRow[];
  daily_receipts_by_type: ReportRow[]; provider_period_controls: ReportRow[];
  provider_daily_financials_by_entry_date: ReportRow[]; procedure_monthly_counts_by_entry_date: ReportRow[];
  transaction_type_totals: ReportRow[]; staff_reported_hours: ReportRow[];
  staff_daily_punches: ReportRow[]; pay_rates: ReportRow[]; calendar_events: ReportRow[];
  weekly_schedule_drafts?: ReportRow[];
  validation: ReportRow;
};
export function validatePreparedReport(value: unknown, orgId: string): PreparedReport {
  const p = value as PreparedReport;
  if (!p || p.schema_version !== REPORT_SCHEMA || p.target_org_id !== orgId) throw new Error('Choose a prepared report package for this practice.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.report_start) || !/^\d{4}-\d{2}-\d{2}$/.test(p.report_end) || p.report_start > p.report_end) throw new Error('Invalid report dates.');
  const arrays = ['sources','monthly_financials_by_entry_date','daily_financials_by_entry_date','daily_receipts_by_type','provider_period_controls','provider_daily_financials_by_entry_date','procedure_monthly_counts_by_entry_date','transaction_type_totals','staff_reported_hours','staff_daily_punches','pay_rates','calendar_events'] as const;
  for (const key of arrays) if (!Array.isArray(p[key])) throw new Error(`Missing report section: ${key}`);
  if (!p.source_control_totals || !p.definitions || !p.validation || !p.sources.length || !p.daily_financials_by_entry_date.length) throw new Error('Report controls and source references are required.');
  if (p.weekly_schedule_drafts !== undefined && (!Array.isArray(p.weekly_schedule_drafts) || p.weekly_schedule_drafts.some(r => !r || typeof r !== 'object' || !Number.isInteger(r.weekday) || r.weekday < 0 || r.weekday > 6))) throw new Error('Invalid weekly schedule notes.');
  const sum = (rows: ReportRow[], key: string) => rows.reduce((n,r) => { if (!Number.isSafeInteger(r[key])) throw new Error(`Invalid numeric value: ${key}`); return n+r[key]; },0);
  const c = p.source_control_totals;
  for (const key of ['posted_charges_cents','recorded_payments_cents','credit_adjustments_cents','charge_adjustments_cents']) {
    if (sum(p.daily_financials_by_entry_date,key) !== c[key] || sum(p.monthly_financials_by_entry_date,key) !== c[key]) throw new Error(`Report does not reconcile: ${key}`);
  }
  if (sum(p.daily_receipts_by_type,'amount_cents') !== c.recorded_payments_cents || sum(p.staff_daily_punches,'reported_minutes') !== c.payroll_reported_minutes || sum(p.staff_reported_hours,'recorded_minutes') !== c.payroll_reported_minutes) throw new Error('Receipt or payroll control totals do not match.');
  const dates = p.daily_financials_by_entry_date.map(r=>r.date);
  if (new Set(dates).size !== dates.length || dates.some(d=>d<p.report_start || d>p.report_end)) throw new Error('Duplicate or out-of-range financial dates.');
  const staffDates = p.staff_daily_punches.map(r=>`${r.employee_code}:${r.date}`);
  if (new Set(staffDates).size !== staffDates.length) throw new Error('Duplicate staff day.');
  for (const r of p.staff_daily_punches) if (r.date < p.report_start || r.date > p.report_end || !Array.isArray(r.punches)) throw new Error('Invalid staff detail.');
  return p;
}
