import { describe, expect, it } from 'vitest';
import { computeFof } from '@/lib/fof/compute';
import { fofReconciliationIssues } from '@/lib/fof/reconciliation';
import { buildPaymentSchedule } from '@/lib/fof/payment-engine';
import { LIVE_TEMPLATES } from './blank-form-fixtures';
import { fullFixture } from './fof-payment-fixture';

const template={...LIVE_TEMPLATES[0],discountPercent:5};
const amounts={totalCents:817300,insuranceEstimateCents:0,writeOffCents:0};
describe('every printed amount has a recorded offset',()=>{
  it('rejects a hidden patient-total reduction or increase to the cent',()=>{
    for(const delta of [-10000,-1,1,10000]) {
      const result=computeFof(template,amounts,{patientPortionCents:817300+delta});
      expect(fofReconciliationIssues(template,result).join(' ')).toContain('Record an office courtesy');
    }
  });
  it('accepts an explicit office courtesy or account credit when both options balance',()=>{
    for(const offset of [{officeDiscountCents:10000,officeDiscountLabel:'Office courtesy'},{patientCreditCents:10000}]) {
      const result=computeFof(template,{...amounts,...offset},{patientPortionCents:807300});
      expect(fofReconciliationIssues(template,result)).toEqual([]);
    }
  });
  it('rejects a prepay total changed without a matching recorded discount',()=>{
    const result=computeFof(template,amounts,{prepayTotalCents:776400});
    expect(fofReconciliationIssues(template,result).join(' ')).toContain('prepay total plus its recorded discount');
    expect(fofReconciliationIssues(template,computeFof(template,amounts,{prepayTotalCents:776400,discountCents:40900}))).toEqual([]);
  });
  it('rejects mismatched installments even without an office policy',()=>{
    const result=computeFof(template,amounts,{installmentsCents:[100]});
    expect(fofReconciliationIssues(template,result).join(' ')).toContain('scheduled payments do not add up');
  });
  it('includes real prior payments once in the remaining balance',()=>{
    const input=fullFixture();input.procedures[0].paidCents=10000;
    const schedule=buildPaymentSchedule(input);
    const result=computeFof(template,amounts,{},undefined,schedule);
    expect(fofReconciliationIssues(template,result)).toEqual([]);
    result.effective.installmentsCents[0]-=1;
    expect(fofReconciliationIssues(template,result)).toHaveLength(1);
  });
});
