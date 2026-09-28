import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MonthlyReportHistory } from '@/components/reports/MonthlyReportHistory';
import { REPORT_SCHEMA, validatePreparedReport, type PreparedReport } from '@/lib/prepared-report';
import { reportDaysFrom, reportMonthsFrom, reportPackagesFrom, type ReportImportRow } from '@/lib/report-history';
import { buildWindow, periodFor } from '@/lib/performance-series';

// Chart geometry is verified by the production build; these tests exercise the
// accessible table, source choice, comparison arithmetic, and missing data.
vi.mock('recharts',()=>({ResponsiveContainer:()=>null,Line:()=>null,LineChart:()=>null,CartesianGrid:()=>null,Tooltip:()=>null,XAxis:()=>null,YAxis:()=>null,Legend:()=>null}));

const fixture = (): PreparedReport => ({
  schema_version: REPORT_SCHEMA, target_org_id: 'office-a', report_start: '2025-01-01', report_end: '2026-07-31',
  financial_date_basis: 'source_date', daily_report_range: {start:'2026-06-01',end:'2026-06-07'},
  sources:[{name:'Example daysheet'},{name:'Example monthly sheet'}], definitions:{},validation:{},
  source_control_totals:{posted_charges_cents:10000,recorded_payments_cents:5000,credit_adjustments_cents:0,charge_adjustments_cents:0,payroll_reported_minutes:null},
  daily_financials_by_entry_date:[{date:'2026-06-02',posted_charges_cents:10000,recorded_payments_cents:5000,credit_adjustments_cents:0,charge_adjustments_cents:0}],
  monthly_financials_by_entry_date:[{month:'2026-06',coverage:'partial',posted_charges_cents:10000,recorded_payments_cents:5000,credit_adjustments_cents:0,charge_adjustments_cents:0}],
  daily_receipts_by_type:[{date:'2026-06-02',amount_cents:5000}],
  provider_period_controls:[],provider_daily_financials_by_entry_date:[],procedure_monthly_counts_by_entry_date:[],transaction_type_totals:[],staff_reported_hours:[],staff_daily_punches:[],pay_rates:[],calendar_events:[],
  monthly_comparison:{
    selection_rule:'Use the selected full-month sheet totals and retain original daily rows.',
    controls:{month_count:2,production_cents:50000,collections_cents:30000},
    rows:[
      {month:'2026-06',coverage:'full_calendar_month',production_cents:20000,collections_cents:10000,source_kind:'monthly_sheet',source_label:'Example monthly sheet',production_basis:'Ledger fees',collections_basis:'Collections'},
      {month:'2026-07',coverage:'full_calendar_month',production_cents:30000,collections_cents:20000,source_kind:'monthly_sheet',source_label:'Example monthly sheet',production_basis:'Ledger fees',collections_basis:'Collections'},
    ],
  },
});
const imported = (payload=fixture(), id='new', imported_at='2026-09-20T00:00:00Z'): ReportImportRow => ({id,payload,imported_at,report_start:payload.report_start,report_end:payload.report_end});

describe('monthly-only history',()=>{
  it('validates monthly controls separately while retaining real daily totals and absent payroll',()=>{
    const p=validatePreparedReport(fixture(),'office-a');
    expect(p.daily_financials_by_entry_date).toHaveLength(1);
    expect(p.source_control_totals.payroll_reported_minutes).toBeNull();
    expect(()=>validatePreparedReport(p,'office-b')).toThrow(/this practice/);
  });
  it('rejects duplicate, changed, out-of-range, or falsely attributed monthly observations',()=>{
    const p=fixture();p.monthly_comparison!.rows[1].month='2026-06';
    expect(()=>validatePreparedReport(p,'office-a')).toThrow(/Duplicate/);
    const q=fixture();q.monthly_comparison!.rows[1].production_cents++;
    expect(()=>validatePreparedReport(q,'office-a')).toThrow(/controls/);
    const r=fixture();r.monthly_comparison!.rows[0].month='2024-12';
    expect(()=>validatePreparedReport(r,'office-a')).toThrow(/period/);
    const s=fixture();s.monthly_comparison!.rows[0].source_kind='daysheet';
    expect(()=>validatePreparedReport(s,'office-a')).toThrow(/daysheet source/);
  });
  it('does not accept staff rows under an absent payroll control or dates outside daily coverage',()=>{
    const p=fixture();p.staff_daily_punches=[{reported_minutes:0}];
    expect(()=>validatePreparedReport(p,'office-a')).toThrow(/payroll/);
    const q=fixture();q.daily_financials_by_entry_date[0].date='2025-01-02';
    expect(()=>validatePreparedReport(q,'office-a')).toThrow(/out-of-range/);
  });
  it('selects a monthly total once, retains other report months, and never synthesizes daily entries',()=>{
    const old=fixture();delete old.monthly_comparison;delete old.daily_report_range;delete old.financial_date_basis;
    old.report_start='2026-06-07';old.report_end='2026-08-31';
    old.daily_financials_by_entry_date=[{date:'2026-07-02',posted_charges_cents:700,recorded_payments_cents:400}];
    old.monthly_financials_by_entry_date=[{month:'2026-06',coverage:'partial',posted_charges_cents:900,recorded_payments_cents:600},{month:'2026-07',coverage:'full_calendar_month',posted_charges_cents:700,recorded_payments_cents:400},{month:'2026-08',coverage:'full_calendar_month',posted_charges_cents:800,recorded_payments_cents:500}];
    const reports=[imported(old,'old','2026-09-01T00:00:00Z'),imported()];
    expect(reportMonthsFrom(reports).map(m=>[m.month,m.production_cents])).toEqual([['2026-06',20000],['2026-07',30000],['2026-08',800]]);
    const days=reportDaysFrom(reports);
    expect(days.map(d=>[d.date,d.postedChargesCents])).toEqual([['2026-06-02',10000],['2026-07-02',700]]);
    expect(days[0].packageStart).toBe('2026-06-01');
    expect(reportPackagesFrom([imported()])[0].start).toBe('2026-06-01');
    expect(old.monthly_financials_by_entry_date[1].posted_charges_cents).toBe(700);
  });
  it('keeps unconfirmed dates honestly labeled on the daily chart',()=>{
    const p=periodFor('this_month','2026-06-20');
    const window=buildWindow({period:p,today:'2026-06-20',sources:{closeouts:[],closeoutsState:'ok',reportDays:reportDaysFrom([imported()]),reportState:'ok'}});
    expect(window?.definitions.dateBasis).toBe('date printed on source');
    expect(window?.coverageLabel).toContain('source dates');
  });
  it('compares selected months, shows source detail, and handles empty ranges',()=>{
    render(<MonthlyReportHistory imports={[imported()]}/>);
    const table=screen.getByRole('table',{name:'Monthly comparison'});
    expect(within(table).getByText('+$100.00 (+50.0%)')).toBeInTheDocument();
    expect(within(table).getByText('+$100.00 (+100.0%)')).toBeInTheDocument();
    expect(screen.getAllByText('Monthly total only')).toHaveLength(2);
    fireEvent.change(screen.getByLabelText('History from month'),{target:{value:'2025-01'}});
    fireEvent.change(screen.getByLabelText('History through month'),{target:{value:'2025-12'}});
    expect(screen.getByText('No monthly totals recorded in this range.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Show all history'}));
    expect(screen.getAllByText('Monthly total only')).toHaveLength(2);
  });
});
