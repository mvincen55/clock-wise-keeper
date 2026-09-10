import {describe,it,expect} from 'vitest';
import {REPORT_SCHEMA,validatePreparedReport} from '@/lib/prepared-report';
const fixture=()=>({schema_version:REPORT_SCHEMA,target_org_id:'office-a',report_start:'2026-07-01',report_end:'2026-07-31',sources:[{name:'Fixture'}],definitions:{},validation:{},source_control_totals:{posted_charges_cents:10000,recorded_payments_cents:5000,credit_adjustments_cents:0,charge_adjustments_cents:0,payroll_reported_minutes:60},daily_financials_by_entry_date:[{date:'2026-07-02',posted_charges_cents:10000,recorded_payments_cents:5000,credit_adjustments_cents:0,charge_adjustments_cents:0}],monthly_financials_by_entry_date:[{month:'2026-07',posted_charges_cents:10000,recorded_payments_cents:5000,credit_adjustments_cents:0,charge_adjustments_cents:0}],daily_receipts_by_type:[{date:'2026-07-02',amount_cents:5000}],staff_daily_punches:[{employee_code:'A',date:'2026-07-02',reported_minutes:60,punches:[]}],staff_reported_hours:[{recorded_minutes:60}],provider_period_controls:[],provider_daily_financials_by_entry_date:[],procedure_monthly_counts_by_entry_date:[],transaction_type_totals:[],pay_rates:[],calendar_events:[]});
describe('prepared report load validation',()=>{
 it('accepts reconciled history for the current organization',()=>expect(validatePreparedReport(fixture(),'office-a').source_control_totals.recorded_payments_cents).toBe(5000));
 it('rejects another practice',()=>expect(()=>validatePreparedReport(fixture(),'office-b')).toThrow(/this practice/));
 it('rejects a changed receipt total',()=>{const p=fixture();p.daily_receipts_by_type[0].amount_cents=999;expect(()=>validatePreparedReport(p,'office-a')).toThrow(/totals/);});
 it('rejects duplicate staff days even if totals match',()=>{const p=fixture();p.staff_daily_punches.push({...p.staff_daily_punches[0],reported_minutes:0});expect(()=>validatePreparedReport(p,'office-a')).toThrow(/Duplicate staff/);});
 it('rejects fractional cents',()=>{const p=fixture();p.daily_financials_by_entry_date[0].posted_charges_cents=10000.5;expect(()=>validatePreparedReport(p,'office-a')).toThrow(/numeric/);});
});

const withMissed = () => ({...fixture(), missed_appointments:{
 date_basis:'entry_date',definition:'Confirmed source codes; entry date controls the day.',
 totals:{cancellations:1,no_shows:0,unassigned:0},
 daily:[{date:'2026-07-02',hygiene_cancellations:1,hygiene_no_shows:0,doctor_cancellations:0,doctor_no_shows:0,unassigned_cancellations:0,unassigned_no_shows:0,missed_appointments_recorded:true}],
 providers:[{provider_code:'OFFICE',department:'hygiene',cancellations:1,no_shows:0}],
 events:[{entry_date:'2026-07-02',procedure_date:'2026-07-01',code:'9101',provider_code:'OFFICE',department:'hygiene' as string|null,zero_fee:true}],
}});
describe('confirmed missed appointment counts',()=>{
 it('counts a zero-fee event on its entry date with a confirmed department override',()=>{
  const p=validatePreparedReport(withMissed(),'office-a');
  expect(p.missed_appointments?.daily[0].hygiene_cancellations).toBe(1);
 });
 it('rejects a provider or daily total that disagrees with source entries',()=>{
  const p=withMissed();p.missed_appointments.providers[0].cancellations=0;
  expect(()=>validatePreparedReport(p,'office-a')).toThrow(/Missed appointment/);
  const q=withMissed();q.missed_appointments.daily[0].hygiene_cancellations=0;
  expect(()=>validatePreparedReport(q,'office-a')).toThrow(/Missed appointment/);
 });
 it('keeps an unassigned department incomplete until it is confirmed',()=>{
  const p=withMissed();const m=p.missed_appointments;
  m.events[0].department=null;m.totals.unassigned=1;
  m.daily[0].hygiene_cancellations=0;m.daily[0].unassigned_cancellations=1;
  expect(()=>validatePreparedReport(p,'office-a')).toThrow(/Missed appointment/);
  m.daily[0].missed_appointments_recorded=false;
  expect(validatePreparedReport(p,'office-a').missed_appointments?.totals.unassigned).toBe(1);
 });
});
