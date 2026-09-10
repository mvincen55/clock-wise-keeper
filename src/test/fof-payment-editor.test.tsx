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
  it('uses code-bank course names without changing charges or staff wording', () => {
    const source: ScheduleSourceLine[] = [
      {...crown,id:'abutment',code:'D6057',tooth:'8',visit:'3',responsibilityCents:40000,guidance:{sourceId:'note-a',title:'Implant Crown',summary:'Part of the implant crown course.',classification:'restoration'}},
      {...crown,id:'crown',code:'D6058',tooth:'8',visit:'5',responsibilityCents:70000,guidance:{sourceId:'note-b',title:'Implant Crown',summary:'Restore the implant with a crown.',classification:'restoration'}},
    ];
    const {result,rerender}=renderHook(({rows})=>usePaymentScheduleEditor('a',policy,rows,110000),{initialProps:{rows:source}});
    expect(result.current.model!.groups).toHaveLength(1);
    expect(result.current.model!.groups[0].label).toBe('Implant Crown #8');
    expect(result.current.model!.schedule.rows.reduce((sum,row)=>sum+row.cents,0)).toBe(110000);
    const id=result.current.model!.groups[0].id;
    act(()=>result.current.update(state=>({...state,groups:{[id]:{label:'Confirmed staff heading'}}})));
    rerender({rows:source.map(row=>({...row,guidance:{...row.guidance!,title:'Implant Restoration'}}))});
    expect(result.current.model!.groups[0].label).toBe('Confirmed staff heading');
  });
  it('requires a local classification decision when code-bank guidance conflicts', () => {
    const source=[{...crown,tooth:'8',guidance:{sourceId:'note',title:'Implant Surgery',summary:'Implant surgery.',classification:'implant' as const}}];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,70000));
    expect(result.current.model!.schedule.issues.join(' ')).toContain('classification differ');
    act(()=>result.current.update(state=>({...state,lines:{a:{classification:'implant'}}})));
    expect(result.current.model!.schedule.issues).toEqual([]);
    expect(result.current.model!.schedule.rows.reduce((sum,row)=>sum+row.cents,0)).toBe(70000);
  });
  it('uses separate-course guidance while preserving explicit staff grouping', () => {
    const source: ScheduleSourceLine[]=[{...crown,id:'a',tooth:'8',groupingHint:'separate'},{...crown,id:'b',tooth:'9',groupingHint:'separate'}];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,140000));
    expect(result.current.model!.groups).toHaveLength(2);
    act(()=>result.current.update(state=>({...state,lines:{a:{group:'confirmed-course'},b:{group:'confirmed-course'}}})));
    expect(result.current.model!.groups).toHaveLength(1);
    expect(result.current.model!.schedule.remainingCents).toBe(140000);
  });
  it('blocks duplicate generic headings until distinct treatment details or a shared course resolve them', () => {
    const source=[{...crown,id:'a',visit:'3'},{...crown,id:'b',visit:'5'}];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,140000));
    expect(result.current.model!.schedule.issues.some(i=>i.includes('both read'))).toBe(true);
    const [first,second]=result.current.model!.groups;
    act(()=>result.current.update(s=>({...s,groups:{[first.id]:{label:'Implant crown — tooth 8'},[second.id]:{label:'Implant crown — tooth 9'}}})));
    expect(result.current.model!.schedule.issues).toEqual([]);
    expect(result.current.model!.schedule.obligationCents).toBe(140000);
    act(()=>result.current.update(s=>({...s,groups:{},lines:{a:{group:'shared-course'},b:{group:'shared-course'}}})));
    expect(result.current.model!.groups).toHaveLength(1);
    expect(result.current.model!.schedule.issues).toEqual([]);
    expect(result.current.model!.schedule.rows.reduce((sum,r)=>sum+r.cents,0)).toBe(140000);
  });
  it.each(['classification', 'group', 'adjustment', 'paid', 'deliveryGroup'] as const)('%s edits mark the form dirty and reset clears the edit', field => {
    const { result } = renderHook(() => usePaymentScheduleEditor('a', policy, [crown], 70000));
    expect(result.current.isDirty).toBe(false);
    act(() => result.current.update(s => ({ ...s, lines: { a: { [field]: field === 'classification' ? 'implant' : 'synthetic' } } })));
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.reset());
    expect(result.current.isDirty).toBe(false);
    expect(result.current.state.lines).toEqual({});
  });
  it.each(['groups', 'events', 'extraEvents', 'overrides'] as const)('%s edits mark the form dirty and are preserved until reset', field => {
    const { result, rerender } = renderHook(() => usePaymentScheduleEditor('a', policy, [crown], 70000));
    act(() => result.current.update(s => ({ ...s, [field]: field === 'extraEvents' ? [{ id: 'extra', label: 'Synthetic', order: 3 }] : { synthetic: {} } })));
    rerender();
    expect(result.current.isDirty).toBe(true);
    act(() => result.current.reset());
    expect(result.current.isDirty).toBe(false);
  });
  it('keeps the abutment and crown on one tooth in one restoration across appointments', () => {
    const source=[{...crown,id:'abutment',code:'D6057',tooth:'8',visit:'3',responsibilityCents:114100},
      {...crown,id:'crown',code:'D6058',tooth:'8',visit:'5',responsibilityCents:192700}];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,306800));
    expect(result.current.model!.groups).toHaveLength(1);
    expect(result.current.model!.schedule.rows.map(r=>r.cents)).toEqual([102267,102267,102266]);
    expect(result.current.model!.schedule.issues).toEqual([]);
  });
  it('keeps surgical work together across appointments but separate from restoration on the same tooth', () => {
    const source=[{...crown,id:'implant',code:'D6010',classification:'implant' as const,tooth:'8',visit:'1',responsibilityCents:271700},
      {...crown,id:'stage2',code:'D6011',classification:'implant' as const,tooth:'8',visit:'2',responsibilityCents:49200},
      {...crown,id:'crown',tooth:'8',visit:'3',responsibilityCents:306800}];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,627700));
    expect(result.current.model!.groups).toHaveLength(2);
    expect(result.current.model!.schedule.rows.map(r=>r.cents)).toEqual([160450,160450,102267,102267,102266]);
  });
  it('respects explicit separate courses on the same tooth and never removes duplicate charges', () => {
    const source=[{...crown,id:'a',tooth:'8',visit:'3'},{...crown,id:'b',tooth:'8',visit:'5'}];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,140000));
    expect(result.current.model!.schedule.obligationCents).toBe(140000);
    act(()=>result.current.update(s=>({...s,lines:{a:{group:'First course'},b:{group:'Second course'}}})));
    expect(result.current.model!.groups).toHaveLength(2);
    expect(result.current.model!.schedule.rows.map(r=>r.cents)).toEqual([35000,35000,35000,35000]);
  });
  it('uses procedure and tooth names rather than visit numbers, with editable wording independent of amounts', () => {
    const source=[{...crown,visit:'3',tooth:'8',procedureLabel:'Implant crown'},{...crown,id:'b',visit:'5',tooth:'9',procedureLabel:'Implant crown'}];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,140000));
    expect(result.current.model!.groups.map(g=>g.label)).toEqual(['Implant Crown #8','Implant Crown #9']);
    expect(result.current.model!.schedule.rows.every(r=>!r.label.includes('visit'))).toBe(true);
    const before=result.current.model!.schedule;
    const group=result.current.model!.groups[0];
    act(()=>result.current.update(s=>({...s,groups:{[group.id]:{label:'Custom patient wording'}}})));
    expect(result.current.model!.schedule.signature).toBe(before.signature);
    expect(result.current.model!.schedule.rows.map(r=>r.cents)).toEqual(before.rows.map(r=>r.cents));
    expect(result.current.model!.groups[0].label).toBe('Custom patient wording');
  });
  it('uses the actual tooth numbers in concise single and multiple-tooth headings', () => {
    const source = [
      {...crown, id:'surgery', classification:'implant' as const, tooth:'#2, 7', visit:'1', procedureLabel:'Implant surgery'},
      {...crown, id:'restoration', tooth:'5', visit:'3', procedureLabel:'Implant crown'},
    ];
    const {result} = renderHook(()=>usePaymentScheduleEditor('a',policy,source,140000));
    expect(result.current.model!.groups.map(group=>group.label)).toEqual(['Implant Surgery #2 and #7','Implant Crown #5']);
    expect(result.current.model!.schedule.rows.reduce((sum,row)=>sum+row.cents,0)).toBe(140000);
  });
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
