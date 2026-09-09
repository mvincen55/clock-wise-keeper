import { useEffect, useState } from 'react';
import { paymentClasses, milestoneKinds, paymentPolicySchema, type PaymentPolicy } from '@/lib/fof/payment-policy';
import { usePaymentClassifications, useSavePaymentClassification } from '@/hooks/useFofPolicySettings';
import { useOrgContext } from '@/hooks/useOrgContext';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PaymentPolicyEditor({ value, save }: { value: PaymentPolicy | null; save: (p: PaymentPolicy | null) => void }) {
  const { data: ctx } = useOrgContext();
  const [draft, setDraft] = useState(value);
  const [code, setCode] = useState('');
  const [classification, setClassification] = useState('review');
  const { data: classifications } = usePaymentClassifications(); const classify = useSavePaymentClassification();
  useEffect(() => { setDraft(value); setCode(''); }, [value, ctx?.org_id]);
  const editable = ctx?.role === 'owner' || ctx?.role === 'manager';
  return <fieldset disabled={!editable} className="border p-3 space-y-3"><legend>Organization payment policy</legend>
    {!draft ? <><p>This office uses its existing schedule. No other office’s policy is inherited.</p><Button type="button" onClick={() => setDraft({ version: 1, thresholdCents: 0, inclusive: true, implantAdvance: false, mixedThreshold: 'separateGroups', rounding: 'floorLast', labels: Object.fromEntries(milestoneKinds.map(k => [k, k])), strategies: Object.fromEntries(paymentClasses.map(c => [c, { below: [], above: [] }])) as PaymentPolicy['strategies'] })}>Configure office policy</Button><p className="text-xs">Choose and save each strategy before it becomes active.</p></> : <>
      <label className="block">OOP threshold ($)<Input type="number" value={draft.thresholdCents / 100} onChange={e => setDraft({ ...draft, thresholdCents: Math.round(Number(e.target.value) * 100) })} /></label>
      <label className="block"><input type="checkbox" checked={draft.inclusive} onChange={e => setDraft({ ...draft, inclusive: e.target.checked })} /> Exactly the threshold uses the higher tier</label>
      <label className="block"><input type="checkbox" checked={draft.implantAdvance} onChange={e => setDraft({ ...draft, implantAdvance: e.target.checked })} /> Implant advance exception: use its higher-tier strategy at any amount</label>
      <label className="block">Mixed treatment <select value={draft.mixedThreshold} onChange={e => setDraft({ ...draft, mixedThreshold: e.target.value as PaymentPolicy['mixedThreshold'] })}><option value="explicitArrangement">Shared threshold for explicitly linked arrangements</option><option value="separateGroups">Separate group thresholds</option></select></label>
      <label className="block">Rounding <select value={draft.rounding} onChange={e => setDraft({ ...draft, rounding: e.target.value as PaymentPolicy['rounding'] })}><option value="nearestLast">Round earlier installments; balance in last</option><option value="floorLast">Round earlier installments down; balance in last</option></select></label>
      {paymentClasses.map(c => <details key={c} className="border p-2"><summary>{c} timing & installment shares</summary>{(['below', 'above'] as const).map(tier => <div key={tier}><strong>{tier} threshold</strong>{draft.strategies[c][tier].map((step, index) => <div className="flex gap-2" key={index}>
        <select aria-label={`${c} ${tier} milestone ${index}`} value={step.at} onChange={e => { const next = structuredClone(draft); next.strategies[c][tier][index].at = e.target.value as typeof step.at; setDraft(next); }}>{[...milestoneKinds, 'firstImpressionsOrTryin'].map(k => <option key={k} value={k}>{k}</option>)}</select>
        <Input aria-label={`${c} ${tier} share ${index}`} type="number" min="1" value={step.weight} onChange={e => { const next = structuredClone(draft); next.strategies[c][tier][index].weight = Number(e.target.value); setDraft(next); }} />
        <Button type="button" variant="outline" onClick={() => { const next = structuredClone(draft); next.strategies[c][tier].splice(index, 1); setDraft(next); }}>Remove</Button>
      </div>)}<Button type="button" variant="outline" onClick={() => { const next = structuredClone(draft); next.strategies[c][tier].push({ at: 'treatment', weight: 1 }); setDraft(next); }}>Add installment</Button></div>)}</details>)}
      <details><summary>Office payment wording</summary>{milestoneKinds.map(k => <label className="block" key={k}>{k}<Input value={draft.labels[k]} onChange={e => setDraft({ ...draft, labels: { ...draft.labels, [k]: e.target.value } })} /></label>)}</details>
      <Button type="button" disabled={!paymentPolicySchema.safeParse(draft).success} onClick={() => save(draft)}>Save office payment policy</Button>
    </>}
    <div className="border-t pt-2"><strong>Procedure payment classifications</strong><p className="text-xs">These control payment timing only. Insurance coverage is unchanged.</p>
      <Input aria-label="Procedure code for payment policy" value={code} onChange={e => setCode(e.target.value)} placeholder="D6190" />
      <select aria-label="Office procedure payment classification" value={classification} onChange={e => setClassification(e.target.value)}>{['review', ...paymentClasses].map(c => <option key={c} value={c}>{c}</option>)}</select>
      <Button type="button" disabled={!code.trim() || classify.isPending} onClick={() => classify.mutate({ code, classification: classification as 'review' })}>Save classification</Button>
      {classify.error && <p role="alert">Could not save classification.</p>}
      <details><summary>Configured procedures</summary>{Object.entries(classifications ?? {}).filter(([, c]) => c).map(([code, c]) => <div key={code}>{code}: {c}</div>)}</details>
    </div>
  </fieldset>;
}
