import { fullFixture } from './fof-payment-fixture';
import { describe, it, expect } from 'vitest';
import { buildPaymentSchedule, splitPolicyCents, suggestedPaymentLabels, type PaymentGroup, type PaymentInput } from '@/lib/fof/payment-engine';
import { harelickPolicyTemplate, type PaymentClass } from '@/lib/fof/payment-policy';
import { estimateInsurance } from '@/lib/fof/insurance';
import { readFileSync } from 'node:fs';

function plan(classification: PaymentClass, cents: number): PaymentInput {
  return {
    policy: harelickPolicyTemplate(), expectedObligationCents: cents,
    procedures: [{ id: 'p', groupId: 'g', responsibilityCents: cents }],
    groups: [{ id: 'g', label: 'Group', classification, events: { booking: 'b', workup: 'w', surgery: 't', prep: 't', impressions: 'i', tryin: 'y', delivery: 'd', treatment: 't' } }],
    events: [{ id: 'b', label: 'Scheduling', order: 0 }, { id: 'w', label: 'Work-up', order: 1 }, { id: 't', label: 'Treatment', order: 2 }, { id: 'i', label: 'Impressions', order: 3 }, { id: 'y', label: 'Try-in', order: 4 }, { id: 'd', label: 'Delivery', order: 5 }],
  };
}
const values = (input: PaymentInput) => { const result = buildPaymentSchedule(input); expect(result.issues).toEqual([]); return result.rows.map(r => r.cents); };


describe('organization payment engine — confirmed policy', () => {
  it('AI suggestions only add labels and preserve manual amounts, labels, and stale bases', () => {
    const input=fullFixture(), original=buildPaymentSchedule(input), row=original.rows[0];
    const overrides={ [row.id]:{basis:'older plan',cents:row.cents,label:'Staff wording',allocations:row.allocations} };
    input.overrides=suggestedPaymentLabels(original,overrides,original.rows.map(()=> 'Suggested label'));
    const renamed=buildPaymentSchedule(input);
    expect(input.overrides[row.id]).toEqual(overrides[row.id]);
    expect(renamed.rows.map(r=>[r.id,r.cents,r.allocations])).toEqual(original.rows.map(r=>[r.id,r.cents,r.allocations]));
    expect(renamed.rows[0].label).toBe('Staff wording');
    expect(renamed.issues.some(i=>i.includes('stale'))).toBe(true);
  });
  it('requires review when distinct impressions and try-in appointments have tied order', () => {
    const p=plan('denture',150000);p.events.find(e=>e.id==='y')!.order=3;
    expect(buildPaymentSchedule(p).issues.some(i=>i.includes('occurs first'))).toBe(true);
  });
  it('work-up 1896 is entirely due at work-up', () => expect(values(plan('workup', 189600))).toEqual([189600]));
  it('D6190 is seeded as work-up only for verified Harelick', () => {
    const seed = readFileSync('supabase/migrations/20260909220100_harelick_payment_policy.sql','utf8');
    expect(seed).toContain("('D6190','workup')");
    const encoded = seed.split('$policy$')[1];
    expect(JSON.parse(encoded)).toEqual(harelickPolicyTemplate());
  });
  it.each([
    ['implant', 80000, [40000,40000]], ['restoration',90000,[45000,45000]],
    ['restoration',100000,[33333,33333,33334]], ['other',80000,[80000]], ['other',100000,[50000,50000]],
    ['denture',150000,[50000,50000,50000]], ['denture',90000,[45000,45000]],
  ] as [PaymentClass,number,number[]][])('%s at %i uses the correct tier and milestones', (c, amount, expected) => expect(values(plan(c,amount))).toEqual(expected));
  it('two crowns prepared together share their group threshold', () => {
    const p=plan('restoration',140000);p.procedures=[{id:'a',groupId:'g',responsibilityCents:70000},{id:'b',groupId:'g',responsibilityCents:70000}];
    expect(values(p)).toEqual([46667,46667,46666]);
  });
  it('approved extraction and crown arrangement keeps extraction paid by prep', () => {
    const p=plan('restoration',280000);p.groups[0].arrangementId='together';
    p.groups.push({id:'x',label:'Extraction',classification:'other',arrangementId:'together',events:{booking:'b',treatment:'t'}});
    p.procedures=[{id:'c',groupId:'g',responsibilityCents:200000},{id:'x',groupId:'x',responsibilityCents:80000}];
    const result=buildPaymentSchedule(p);expect(result.issues).toEqual([]);expect(result.rows.map(r=>r.cents)).toEqual([106667,106667,66666]);
    expect(result.rows[2].allocations.every(a=>a.groupId==='g')).toBe(true);
  });
  it('selects the first actual try-in when before impressions, without a fourth installment', () => {
    const p=plan('denture',150000);p.events.find(e=>e.id==='y')!.order=1;
    const result=buildPaymentSchedule(p);expect(result.rows.map(r=>r.id)).toEqual(['b','y','d']);expect(result.rows.map(r=>r.cents)).toEqual([50000,50000,50000]);
  });
  it('low denture still collects at initial impressions even if a try-in is earlier', () => {
    const p=plan('denture',90000);p.events.find(e=>e.id==='y')!.order=1;expect(buildPaymentSchedule(p).rows.map(r=>r.id)).toEqual(['i','d']);
  });
  it('full fixture excludes work-up from later thresholds and creates six payments', () => expect(values(fullFixture())).toEqual([189600,160450,160450,102267,102267,102266]));
  it('explicit paid work-up reconciles 6277 remaining with 1896 paid', () => {
    const p=fullFixture();p.procedures.filter(l=>l.groupId==='w').forEach(l=>l.paidCents=l.responsibilityCents);
    const result=buildPaymentSchedule(p);expect(result.issues).toEqual([]);expect(result.paidCents).toBe(189600);expect(result.remainingCents).toBe(627700);expect(result.rows.reduce((s,r)=>s+r.cents,0)+result.paidCents).toBe(817300);
  });
  it('implant and restoration use independent thresholds and booking events', () => {
    const p=fullFixture();p.procedures=p.procedures.filter(l=>l.groupId!=='w');p.procedures.filter(l=>l.groupId==='r').forEach(l=>l.responsibilityCents=l.id==='crown'?90000:0);p.expectedObligationCents=410900;
    expect(values(p)).toEqual([160450,160450,45000,45000]);
  });
  it('restoration booking combines with surgery only when explicitly linked', () => {
    const p=fullFixture();p.groups.find(g=>g.id==='r')!.events.booking='s';
    expect(values(p)).toEqual([189600,160450,262717,102267,102266]);
  });
  it('equal Scheduling labels never merge unrelated events', () => {
    const p=fullFixture();p.events.forEach(e=>e.label='Scheduling');expect(values(p)).toHaveLength(6);
  });
  it('office policies are isolated and the engine does not mutate them', () => {
    const a=plan('restoration',90000),b=structuredClone(a);b.policy.thresholdCents=50000;
    expect(values(a)).toEqual([45000,45000]);expect(values(b)).toEqual([30000,30000,30000]);expect(values(a)).toEqual([45000,45000]);
  });
  it('label changes never control allocations or invalidate an amount basis', () => {
    const p=fullFixture();const a=buildPaymentSchedule(p);p.events.forEach(e=>e.label='A new name');const b=buildPaymentSchedule(p);
    expect(a.signature).toBe(b.signature);expect(b.rows.map(r=>r.allocations)).toEqual(a.rows.map(r=>r.allocations));
  });
  it('retains stale and removed overrides visibly instead of losing them', () => {
    const p=plan('other',80000);const first=buildPaymentSchedule(p);p.overrides={t:{label:'Custom',cents:80000,basis:first.signature}};p.expectedObligationCents=90000;p.procedures[0].responsibilityCents=90000;
    const result=buildPaymentSchedule(p);expect(result.rows[0].label).toBe('Custom');expect(result.rows[0].cents).toBe(80000);expect(result.issues.some(i=>i.includes('stale'))).toBe(true);
    p.procedures=[];p.expectedObligationCents=0;expect(buildPaymentSchedule(p).issues.some(i=>i.includes('removed'))).toBe(true);
  });
  it('line insurance and explicit credits affect their group thresholds without fee proration', () => {
    const estimate=estimateInsurance([{code:'D2740',description:'Crown',category:'major',officeFeeCents:200000,allowedCents:null},{code:'D6010',description:'Implant',category:'other',officeFeeCents:80000,allowedCents:null}],{preventivePct:100,basicPct:80,majorPct:60,deductibleWaivedPreventive:true,writeoffApplies:false},{remainingDeductibleCents:0,remainingAnnualMaxCents:1000000});
    const p=plan('restoration',70000);p.procedures[0].responsibilityCents=estimate.perLine[0].officeFeeCents-estimate.perLine[0].insurancePaysCents;p.procedures[0].adjustmentCents=10000;
    expect(values(p)).toEqual([35000,35000]);p.procedures[0].adjustmentCents=0;expect(buildPaymentSchedule(p).issues.some(i=>i.includes('adjustments'))).toBe(true);
  });
  it('rejects invalid, duplicate, missing and overpaid allocations', () => {
    const p=plan('other',80000);p.procedures[0].paidCents=80001;expect(buildPaymentSchedule(p).issues.length).toBeGreaterThan(0);
    p.procedures[0].paidCents=0;p.procedures.push({...p.procedures[0]});expect(buildPaymentSchedule(p).issues.some(i=>i.includes('duplicate'))).toBe(true);
  });
  it('rounding conserves cents and never folds small installments', () => {
    for(let n=0;n<500;n++) {const parts=splitPolicyCents(n,[1,1,1],'nearestLast');expect(parts.reduce((s,v)=>s+v,0)).toBe(n);expect(parts.every(v=>v>=0)).toBe(true);}
    expect(values(plan('implant',101))).toEqual([51,50]);
  });
});
