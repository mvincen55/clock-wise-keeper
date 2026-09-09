import { describe, it, expect } from 'vitest';
import { act, renderHook, render, screen, fireEvent } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentScheduleEditor, usePaymentScheduleEditor, type ScheduleSourceLine } from '@/components/fof/PaymentScheduleEditor';
import FofPrintSheet from '@/components/fof/FofPrintSheet';
import { harelickPolicyTemplate } from '@/lib/fof/payment-policy';
import { buildPaymentSchedule } from '@/lib/fof/payment-engine';
import { computeFof } from '@/lib/fof/compute';
import { fullFixture } from './fof-payment-fixture';
import { LIVE_TEMPLATES, PRACTICE_DEFAULT_BRANDING } from './blank-form-fixtures';

const crown: ScheduleSourceLine = { id: 'a', code: 'D2740', visit: '1', responsibilityCents: 70000, classification: 'restoration' };
const policy=harelickPolicyTemplate();
describe('payment editor and shared print result', () => {
  it('links a zero-fee delivery marker without adding money and flags a changed fee', () => {
    const marker = { id:'delivery', code:'Delivery', visit:'2', responsibilityCents:0 };
    const {result,rerender}=renderHook(({source})=>usePaymentScheduleEditor('a',policy,source,70000),{initialProps:{source:[crown,marker]}});
    const group=result.current.model!.procedures[0].groupId;
    act(()=>result.current.update(s=>({...s,lines:{delivery:{deliveryGroup:group}}})));
    expect(result.current.model!.schedule.rows.map(r=>r.cents)).toEqual([35000,35000]);
    expect(result.current.model!.schedule.rows[1].id).toBe('delivery-marker:delivery');
    expect(result.current.model!.schedule.issues).toEqual([]);
    rerender({source:[crown,{...marker,responsibilityCents:100}]});
    expect(result.current.model!.schedule.issues.some(i=>i.includes('delivery marker'))).toBe(true);
  });
  it('groups related crowns only with explicit shared appointment or group', () => {
    const {result,rerender}=renderHook(({source})=>usePaymentScheduleEditor('a',policy,source,140000),{initialProps:{source:[crown,{...crown,id:'b'}]}});
    expect(result.current.model!.schedule.rows.map(r=>r.cents)).toEqual([46667,46667,46666]);
    rerender({source:[crown,{...crown,id:'b',visit:'2'}]});expect(result.current.model!.groups).toHaveLength(2);expect(result.current.model!.schedule.rows.map(r=>r.cents)).toEqual([35000,35000,35000,35000]);
  });
  it('preserves edits and highlights unallocated credits, then resolves after allocation', () => {
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,[crown],60000));
    expect(result.current.model!.schedule.issues.some(i=>i.includes('adjustments'))).toBe(true);
    act(()=>result.current.update(s=>({...s,lines:{a:{adjustment:'100.00'}}})));
    expect(result.current.model!.schedule.issues).toEqual([]);expect(result.current.model!.schedule.rows.map(r=>r.cents)).toEqual([30000,30000]);
  });
  it('does not carry patient edits across organizations', () => {
    const {result,rerender}=renderHook(({org})=>usePaymentScheduleEditor(org,policy,[crown],70000),{initialProps:{org:'a'}});
    act(()=>result.current.update(s=>({...s,lines:{a:{paid:'700'}}})));expect(result.current.model!.schedule.remainingCents).toBe(0);
    rerender({org:'b'});expect(result.current.model!.schedule.paidCents).toBe(0);
  });
  it('balanced manual amounts preserve per-procedure allocation and print eligibility', () => {
    const fixture=fullFixture();const initial=buildPaymentSchedule(fixture);
    const a=initial.rows.find(r=>r.id==='rb')!,b=initial.rows.find(r=>r.id==='r')!;
    const alteredA=a.allocations.map((x,i)=>({...x,cents:x.cents+(i===0?100:0)}));
    const alteredB=b.allocations.map((x,i)=>({...x,cents:x.cents-(i===0?100:0)}));
    fixture.overrides={rb:{basis:initial.signature,cents:a.cents+100,allocations:alteredA},r:{basis:initial.signature,cents:b.cents-100,allocations:alteredB}};
    const adjusted=buildPaymentSchedule(fixture);expect(adjusted.issues).toEqual([]);expect(adjusted.rows.find(r=>r.id==='rb')!.cents).toBe(102367);
  });
  it('a stale label override is retained and blocks printing until reviewed', () => {
    const {result,rerender}=renderHook(({line})=>usePaymentScheduleEditor('a',policy,[line],line.responsibilityCents),{initialProps:{line:crown}});
    const first=result.current.model!.schedule;const id=first.rows[0].id;
    act(()=>result.current.update(s=>({...s,overrides:{[id]:{label:'Staff wording',basis:first.signature}}})));
    rerender({line:{...crown,responsibilityCents:80000}});expect(result.current.model!.schedule.rows[0].label).toBe('Staff wording');expect(result.current.model!.schedule.issues.some(i=>i.includes('stale'))).toBe(true);
  });
  it('renders editable classifications and explicit paid amounts', () => {
    function Harness(){const editor=usePaymentScheduleEditor('a',policy,[crown],70000);return <PaymentScheduleEditor editor={editor}/>;}
    render(<Harness/>);fireEvent.change(screen.getByLabelText('Paid a'),{target:{value:'700'}});expect(screen.getByText(/Recorded paid: \$700.00/)).toBeTruthy();
  });
  it('patient preview and office copy share six rows and reconcile explicitly paid work-up', () => {
    const input=fullFixture();input.procedures.filter(p=>p.groupId==='w').forEach(p=>p.paidCents=p.responsibilityCents);
    const schedule=buildPaymentSchedule(input);const template={...LIVE_TEMPLATES[0],discountPercent:0,showInstallmentOption:true,showPrepayOption:true};
    const amounts={totalCents:817300,insuranceEstimateCents:0,writeOffCents:0};const computation=computeFof(template,amounts,{},undefined,schedule);
    expect(computation.effective.installmentsCents).toEqual(schedule.rows.map(r=>r.cents));expect(computation.effective.prepayTotalCents).toBe(627700);
    const html=renderToStaticMarkup(<FofPrintSheet practice={PRACTICE_DEFAULT_BRANDING} template={template} patient={{patientName:'',dateISO:'',treatment:''}} amounts={amounts} computation={computation}/>);
    expect(html).toContain('Explicit prior payments');expect(html).toContain('$6,277.00');expect(html).toContain('Payment allocations &amp; reconciliation');expect(html).toContain('$1,022.66');
    schedule.issues.push('Review');const blocked=renderToStaticMarkup(<FofPrintSheet practice={PRACTICE_DEFAULT_BRANDING} template={template} patient={{patientName:'',dateISO:'',treatment:''}} amounts={amounts} computation={computation}/>);expect(blocked).not.toContain('$1,022.66');expect(blocked).toContain('requires staff review');
  });
});
