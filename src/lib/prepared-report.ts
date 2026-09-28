export const REPORT_SCHEMA = 'purple-envelope-prepared-report-package-v1';
export type ReportRow = Record<string, any>;
export type ComparisonMonth = {
  month: string;
  production_cents: number;
  collections_cents: number;
  coverage: 'full_calendar_month' | 'partial';
  source_kind: 'daysheet' | 'monthly_sheet';
  source_label: string;
  production_basis: string;
  collections_basis: string;
  source_reference?: string;
};
export type PreparedReport = {
  schema_version: string; target_org_id: string; report_start: string; report_end: string;
  sources: ReportRow[]; source_control_totals: ReportRow; definitions: Record<string, string>;
  monthly_financials_by_entry_date: ReportRow[]; daily_financials_by_entry_date: ReportRow[];
  daily_receipts_by_type: ReportRow[]; provider_period_controls: ReportRow[];
  provider_daily_financials_by_entry_date: ReportRow[]; procedure_monthly_counts_by_entry_date: ReportRow[];
  transaction_type_totals: ReportRow[]; staff_reported_hours: ReportRow[];
  staff_daily_punches: ReportRow[]; pay_rates: ReportRow[]; calendar_events: ReportRow[];
  weekly_schedule_drafts?: ReportRow[];
  financial_date_basis?: 'entry_date' | 'source_date';
  daily_report_range?: { start: string; end: string };
  monthly_comparison?: {
    rows: ComparisonMonth[];
    controls: { month_count: number; production_cents: number; collections_cents: number };
    selection_rule: string;
  };
  missed_appointments?: {
    date_basis: 'entry_date'; definition: string;
    totals: { cancellations: number; no_shows: number; unassigned: number };
    daily: ReportRow[]; providers: ReportRow[]; events: ReportRow[];
  };
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
  if (p.financial_date_basis !== undefined && !['entry_date','source_date'].includes(p.financial_date_basis)) throw new Error('Invalid financial date basis.');
  const range = p.daily_report_range ?? { start: p.report_start, end: p.report_end };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(range.start) || !/^\d{4}-\d{2}-\d{2}$/.test(range.end) || range.start > range.end || range.start < p.report_start || range.end > p.report_end) throw new Error('Invalid daily report range.');
  if (p.monthly_comparison !== undefined) {
    const m = p.monthly_comparison;
    if (!m || !Array.isArray(m.rows) || !m.rows.length || !m.controls || typeof m.selection_rule !== 'string') throw new Error('Invalid monthly comparison.');
    if (m.rows.some(r => !r || !/^\d{4}-(0[1-9]|1[0-2])$/.test(r.month) || r.month < p.report_start.slice(0,7) || r.month > p.report_end.slice(0,7) || !['full_calendar_month','partial'].includes(r.coverage) || !['daysheet','monthly_sheet'].includes(r.source_kind) || ![r.source_label,r.production_basis,r.collections_basis].every(v => typeof v === 'string' && v.trim().length))) throw new Error('Invalid monthly source or period.');
    if (new Set(m.rows.map(r=>r.month)).size !== m.rows.length) throw new Error('Duplicate comparison month.');
    if (m.rows.length !== m.controls.month_count || sum(m.rows,'production_cents') !== m.controls.production_cents || sum(m.rows,'collections_cents') !== m.controls.collections_cents) throw new Error('Monthly comparison controls do not match.');
    for (const row of m.rows.filter(r=>r.source_kind==='daysheet')) {
      const source = p.monthly_financials_by_entry_date.find(r=>r.month===row.month);
      if (!source || source.posted_charges_cents !== row.production_cents || source.recorded_payments_cents !== row.collections_cents || source.coverage !== row.coverage) throw new Error('Comparison month does not match its daysheet source.');
    }
  }
  if (p.missed_appointments !== undefined) {
    const m = p.missed_appointments;
    const invalid = () => { throw new Error('Missed appointment counts do not reconcile.'); };
    if (!m || m.date_basis !== 'entry_date' || typeof m.definition !== 'string' || !m.totals || !Array.isArray(m.daily) || !Array.isArray(m.providers) || !Array.isArray(m.events)) invalid();
    const count = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 0;
    if (!['cancellations','no_shows','unassigned'].every(k=>count(m.totals[k as keyof typeof m.totals]))) invalid();
    const keys = ['hygiene_cancellations','hygiene_no_shows','doctor_cancellations','doctor_no_shows','unassigned_cancellations','unassigned_no_shows'];
    if (m.daily.some(r=>!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.date) || r.date<p.report_start || r.date>p.report_end || keys.some(k=>!count(r[k])) || r.missed_appointments_recorded !== (r.unassigned_cancellations+r.unassigned_no_shows===0))) invalid();
    if (new Set(m.daily.map(r=>r.date)).size!==m.daily.length) invalid();
    if (m.events.some(r=>!r || !['9100','9101'].includes(r.code) || ![null,'doctor','hygiene'].includes(r.department) || !m.daily.some(d=>d.date===r.entry_date))) invalid();
    for (const day of m.daily) for (const department of ['hygiene','doctor','unassigned']) for (const [code,suffix] of [['9100','no_shows'],['9101','cancellations']]) {
      if (day[`${department}_${suffix}`]!==m.events.filter(e=>e.entry_date===day.date && (e.department??'unassigned')===department && e.code===code).length) invalid();
    }
    if (m.events.filter(e=>e.code==='9100').length!==m.totals.no_shows || m.events.filter(e=>e.code==='9101').length!==m.totals.cancellations || m.events.filter(e=>e.department===null).length!==m.totals.unassigned) invalid();
    if (new Set(m.providers.map(r=>r.provider_code)).size!==m.providers.length || m.providers.some(r=>!count(r.cancellations) || !count(r.no_shows) || r.cancellations!==m.events.filter(e=>e.provider_code===r.provider_code && e.code==='9101').length || r.no_shows!==m.events.filter(e=>e.provider_code===r.provider_code && e.code==='9100').length) || sum(m.providers,'cancellations')!==m.totals.cancellations || sum(m.providers,'no_shows')!==m.totals.no_shows) invalid();
  }
  for (const key of ['posted_charges_cents','recorded_payments_cents','credit_adjustments_cents','charge_adjustments_cents']) {
    if (sum(p.daily_financials_by_entry_date,key) !== c[key] || sum(p.monthly_financials_by_entry_date,key) !== c[key]) throw new Error(`Report does not reconcile: ${key}`);
  }
  const payrollAbsent = c.payroll_reported_minutes === null && !p.staff_daily_punches.length && !p.staff_reported_hours.length;
  if (sum(p.daily_receipts_by_type,'amount_cents') !== c.recorded_payments_cents || (!payrollAbsent && (sum(p.staff_daily_punches,'reported_minutes') !== c.payroll_reported_minutes || sum(p.staff_reported_hours,'recorded_minutes') !== c.payroll_reported_minutes))) throw new Error('Receipt or payroll control totals do not match.');
  const dates = p.daily_financials_by_entry_date.map(r=>r.date);
  if (new Set(dates).size !== dates.length || dates.some(d=>!/^\d{4}-\d{2}-\d{2}$/.test(d) || d<range.start || d>range.end)) throw new Error('Duplicate or out-of-range financial dates.');
  const staffDates = p.staff_daily_punches.map(r=>`${r.employee_code}:${r.date}`);
  if (new Set(staffDates).size !== staffDates.length) throw new Error('Duplicate staff day.');
  for (const r of p.staff_daily_punches) if (r.date < p.report_start || r.date > p.report_end || !Array.isArray(r.punches)) throw new Error('Invalid staff detail.');
  return p;
}
