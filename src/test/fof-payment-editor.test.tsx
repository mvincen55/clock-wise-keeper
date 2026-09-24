import { describe, it, expect } from 'vitest';
import { act, renderHook, render, screen, fireEvent } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PaymentScheduleEditor, usePaymentScheduleEditor, type ScheduleSourceLine } from '@/components/fof/PaymentScheduleEditor';
import FofPrintSheet from '@/components/fof/FofPrintSheet';
import { harelickPolicyTemplate } from '@/lib/fof/payment-policy';
import { buildPaymentSchedule } from '@/lib/fof/payment-engine';
import { computeFof } from '@/lib/fof/compute';
import { fullFixture } from './fof-payment-fixture';
import { estimateInsurance } from '@/lib/fof/insurance';
import { LIVE_TEMPLATES, PRACTICE_DEFAULT_BRANDING } from './blank-form-fixtures';

const crown: ScheduleSourceLine = { id: 'a', code: 'D2740', visit: '1', responsibilityCents: 70000, classification: 'restoration' };
const policy=harelickPolicyTemplate();
describe('payment editor and shared print result', () => {
  it('reconciles a two-year implant plan into six patient-friendly payments', () => {
    const source: ScheduleSourceLine[] = [
      {id:'guide',code:'D6190',visit:'1',classification:'workup',procedureLabel:'Surgical Implant Guide',responsibilityCents:112000},
      {id:'implant',code:'D6010',tooth:'19',visit:'2',classification:'implant',procedureLabel:'Dental Implant',responsibilityCents:172945},
      {id:'material',code:'D4265',tooth:'19',visit:'2',classification:'other',procedureLabel:'Bio Material',responsibilityCents:52300},
      {id:'postop',code:'7000',visit:'3',responsibilityCents:0},
      {id:'abutment',code:'D6057',tooth:'19',visit:'4',classification:'restoration',procedureLabel:'Implant Abutment (Custom)',responsibilityCents:38560},
      {id:'crown',code:'D6059',tooth:'19',visit:'4',classification:'restoration',procedureLabel:'Implant Crown',responsibilityCents:66595},
      {id:'delivery',code:'D6059',tooth:'19',visit:'5',classification:'restoration',responsibilityCents:0},
    ];
    const fees=[112000,271700,52300,0,114100,192700,0], allowed=[null,220000,null,null,72120,133190,null];
    const estimate=estimateInsurance(source.map((s,i)=>({code:s.code,description:'',category:i===0?'workup':i===1||i===4||i===5?'major':'other',officeFeeCents:fees[i],allowedCents:allowed[i],inRenewalYear:Number(s.visit)>=4})),
      {preventivePct:100,basicPct:80,majorPct:50,deductibleWaivedPreventive:true,writeoffApplies:true},
      {remainingAnnualMaxCents:47055,remainingDeductibleCents:0,renewal:{annualMaxCents:150000,deductibleCents:5000}});
    expect(estimate.insurancePaysCents).toBe(147210);
    expect(estimate.writeOffCents).toBe(153190);
    expect(estimate.remainingMaxCents).toBe(49845);
    expect(source.map(s=>s.responsibilityCents)).toEqual(estimate.perLine.map(l=>l.officeFeeCents-l.insurancePaysCents-l.writeOffCents));
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,442400));
    const schedule=result.current.model!.schedule;
    expect(schedule.issues).toEqual([]);
    expect(schedule.rows.map(row=>row.cents)).toEqual([112000,112623,112622,35052,35052,35051]);
    expect(schedule.rows.map(row=>row.label.split(' — ')[1])).toEqual(['At your planning visit','When you schedule this treatment','At your implant placement visit','When you schedule this treatment','At your preparation and impressions visit','At your final fitting visit']);
    expect(schedule.rows[1].allocations.map(a=>a.procedureId).sort()).toEqual(['implant','material']);
    render(<PaymentScheduleEditor editor={result.current}/>);
    const advanced=screen.getByText('Advanced payment settings').closest('details')!;
    expect(advanced.open).toBe(false);
    expect(screen.getAllByText('When payment is due')).toHaveLength(6);
    expect(screen.getAllByText('Treatment name on the patient form')).toHaveLength(3);
    const guideGroup=result.current.model!.groups.find(g=>g.classification==='workup')!;
    expect(screen.queryByLabelText(`${guideGroup.id} surgery`)).toBeNull();
    expect(screen.getByLabelText(`${guideGroup.id} workup`)).toBeTruthy();
    const template={...LIVE_TEMPLATES[1],discountPercent:0,showInstallmentOption:true,showPrepayOption:false};
    const amounts={totalCents:742800,insuranceEstimateCents:147210,writeOffCents:153190};
    const computation=computeFof(template,amounts,{},undefined,schedule);
    expect(computation.effective.patientPortionCents).toBe(442400);
    const html=renderToStaticMarkup(<FofPrintSheet practice={PRACTICE_DEFAULT_BRANDING} template={template} patient={{patientName:'',dateISO:'',treatment:''}} amounts={amounts} computation={computation}/>);
    expect(html).toContain('6 payments');expect(html).toContain('$1,126.23');expect(html).toContain('$4,424.00');
    expect(html).not.toContain('Bio Material — At your treatment visit');
  });
  it('keeps unrelated material separate and honors staff payment decisions', () => {
    const implant: ScheduleSourceLine={id:'implant',code:'D6010',visit:'2',tooth:'19',classification:'implant',responsibilityCents:100000};
    const material: ScheduleSourceLine={id:'material',code:'D4265',visit:'2',tooth:'19',classification:'other',responsibilityCents:20000};
    const {result,rerender}=renderHook(({rows})=>usePaymentScheduleEditor('a',policy,rows,120000),{initialProps:{rows:[implant,material]}});
    expect(result.current.model!.groups).toHaveLength(1);
    rerender({rows:[implant,{...material,tooth:'20'}]});expect(result.current.model!.groups).toHaveLength(2);
    rerender({rows:[implant,{...material,visit:'3'}]});expect(result.current.model!.groups).toHaveLength(2);
    rerender({rows:[implant,{...material,groupingHint:'separate'}]});expect(result.current.model!.groups).toHaveLength(2);
    rerender({rows:[implant,material]});
    act(()=>result.current.update(s=>({...s,lines:{material:{code:'D4265',classification:'other'}}})));
    expect(result.current.model!.groups).toHaveLength(2);
    expect(result.current.model!.schedule.issues).toEqual([]);
  });
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
    expect(result.current.model!.schedule.rows.every(r=>!r.label.match(/visit [0-9]/i))).toBe(true);
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
  it('drops a per-line decision when the row is retyped as a different code', () => {
    // Staff classify a D5750 row as denture, then overwrite that same row with an extraction.
    const reline: ScheduleSourceLine = { id: 'row-1', code: 'D5750', visit: '2', responsibilityCents: 3400, classification: 'review' };
    const {result,rerender}=renderHook(({source})=>usePaymentScheduleEditor('a',policy,source,3400),{initialProps:{source:[reline]}});
    act(()=>result.current.update(s=>({...s,lines:{'row-1':{code:'D5750',classification:'denture'}}})));
    expect(result.current.model!.schedule.rows.map(r=>r.label)).toEqual(['Denture Reline — At your impressions visit','Denture Reline — At your final fitting visit'].map(l=>expect.stringContaining(l.split(' — ')[1])));
    rerender({source:[{...reline,code:'D7140',tooth:'5',visit:'1',classification:'other'}]});
    // The denture decision belonged to D5750; the extraction follows its own classification.
    expect(result.current.model!.schedule.rows.map(r=>r.label)).toEqual([expect.stringContaining('At your treatment visit')]);
    expect(result.current.model!.schedule.issues).toEqual([]);
  });
  it('names a multi-procedure group as its course, not its procedure names joined', () => {
    const source: ScheduleSourceLine[] = [
      { id: 'ct', code: 'D0367', visit: '1', responsibilityCents: 52000, classification: 'workup', procedureLabel: 'CT Scan' },
      { id: 'models', code: 'D0470', visit: '1', responsibilityCents: 25600, classification: 'workup', procedureLabel: 'Diagnostic Models' },
      { id: 'guide', code: 'D5982', visit: '1', responsibilityCents: 112000, classification: 'workup', procedureLabel: 'Surgical Guide' },
      { id: 'implant', code: 'D6010', visit: '2', tooth: '8', responsibilityCents: 271700, classification: 'implant', procedureLabel: 'Dental Implant' },
      { id: 'stage2', code: 'D6011', visit: '2', tooth: '8', responsibilityCents: 49200, classification: 'implant', procedureLabel: 'Implant Second-Stage Surgery' },
      { id: 'abutment', code: 'D6057', visit: '3', tooth: '8', responsibilityCents: 114100, classification: 'restoration', procedureLabel: 'Implant Abutment (Custom)' },
      { id: 'crown', code: 'D6059', visit: '3', tooth: '8', responsibilityCents: 192700, classification: 'restoration', procedureLabel: 'Implant Crown' },
    ];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,817300));
    expect(result.current.model!.groups.map(g=>g.label)).toEqual(['Work-Up','Implant Surgery #8','Implant Crown #8']);
    expect(result.current.model!.schedule.issues).toEqual([]);
  });
  it('treats crown lengthening, post and core, and the crown as one course with three appointments', () => {
    const source: ScheduleSourceLine[] = [
      { id: 'cl', code: 'D4249', visit: '1', tooth: '11', responsibilityCents: 114100, classification: 'restoration', surgical: true, procedureLabel: 'Crown Lengthening' },
      { id: 'pc', code: 'D2954', visit: '3', tooth: '11', responsibilityCents: 49100, classification: 'restoration', procedureLabel: 'Post and Core' },
      { id: 'cr', code: 'D2740', visit: '3', tooth: '11', responsibilityCents: 156900, classification: 'restoration', procedureLabel: 'Porcelain Crown' },
    ];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,320100));
    const model=result.current.model!;
    expect(model.groups.map(g=>[g.label,g.surgical])).toEqual([['Porcelain Crown #11',true]]);
    expect(model.schedule.issues).toEqual([]);
    expect(model.schedule.rows.map(r=>[r.label,r.cents])).toEqual([
      ['Porcelain Crown #11 — When you schedule this treatment',80025],['Porcelain Crown #11 — At crown lengthening',80025],
      ['Porcelain Crown #11 — At your preparation and impressions visit',80025],['Porcelain Crown #11 — At your final fitting visit',80025]]);
    // Under the threshold: no scheduling payment, three appointments.
    const small=source.map(l=>({...l,responsibilityCents:Math.round(l.responsibilityCents/4)}));
    const {result:under}=renderHook(()=>usePaymentScheduleEditor('a',policy,small,small.reduce((s,l)=>s+l.responsibilityCents,0)));
    expect(under.current.model!.schedule.rows.map(r=>r.label.split(' — ')[1])).toEqual(['At crown lengthening','At your preparation and impressions visit','At your final fitting visit']);
  });
  it('applies the builder’s spread of a form discount until staff allocate a line by hand', () => {
    // $700 crown and $300 filling; a $100 office discount spread 70/30 by the builder.
    const source: ScheduleSourceLine[] = [
      { ...crown, defaultAdjustmentCents: 7000 },
      { id: 'b', code: 'D2391', visit: '1', responsibilityCents: 30000, classification: 'other', defaultAdjustmentCents: 3000 },
    ];
    const {result}=renderHook(()=>usePaymentScheduleEditor('a',policy,source,90000));
    expect(result.current.model!.schedule.issues).toEqual([]);
    expect(result.current.model!.schedule.remainingCents).toBe(90000);
    // A hand allocation on one line switches every line to hand allocation, so the rest must be entered too.
    act(()=>result.current.update(s=>({...s,lines:{a:{code:'D2740',adjustment:'100.00'}}})));
    expect(result.current.model!.schedule.issues).toEqual([]);
    expect(result.current.model!.procedures.map(p=>p.adjustmentCents)).toEqual([10000,0]);
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
