import { useMemo, useState } from 'react';
import { buildPaymentSchedule, type CollectionEvent, type PaymentGroup, type PaymentOverride } from '@/lib/fof/payment-engine';
import { milestoneKinds, paymentClasses, type PaymentClass, type PaymentPolicy } from '@/lib/fof/payment-policy';
import { formatCents, parseCurrencyInput } from '@/lib/fof/money';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { treatmentGroupIds } from '@/lib/fof/treatment-groups';

export interface ScheduleSourceLine { id: string; code: string; visit: string; tooth?: string; procedureLabel?: string; responsibilityCents: number; classification?: PaymentClass | 'review' }
type LineEdit = { classification?: PaymentClass | 'review'; group?: string; adjustment?: string; paid?: string; deliveryGroup?: string };
type EditorState = { lines: Record<string, LineEdit>; groups: Record<string, Partial<PaymentGroup>>; events: Record<string, Partial<CollectionEvent>>; extraEvents: CollectionEvent[]; overrides: Record<string, PaymentOverride> };
const empty = (): EditorState => ({ lines: {}, groups: {}, events: {}, extraEvents: [], overrides: {} });
const classTitle: Record<PaymentClass | 'review', string> = { workup: 'Work-up', implant: 'Implant surgery', restoration: 'Crown / bridge / implant restoration', denture: 'Denture / partial', other: 'Treatment without delivery', review: 'Needs classification' };
const classOrder = { workup: 0, implant: 1, restoration: 2, denture: 2, other: 1, review: 3 };
const patientClassTitle = { workup: 'Work-up', implant: 'Implant surgery', restoration: 'Restoration', denture: 'Denture / partial', other: 'Treatment', review: 'Treatment' };

function MoneyEdit({ cents, label, commit }: { cents: number; label: string; commit: (cents: number) => void }) {
  const [raw, setRaw] = useState(Number.isFinite(cents) ? (cents / 100).toFixed(2) : '');
  return <Input aria-label={label} inputMode="decimal" value={raw} onChange={e => setRaw(e.target.value)} onBlur={() => commit(parseCurrencyInput(raw) ?? NaN)} />;
}

/** All edits are component memory. Org changes hide prior-office state immediately. */
export function usePaymentScheduleEditor(orgId: string | undefined, policy: PaymentPolicy | null | undefined, source: ScheduleSourceLine[], expected: number) {
  const [stored, setStored] = useState<{ orgId?: string; value: EditorState }>({ orgId, value: empty() });
  const state = stored.orgId === orgId ? stored.value : empty();
  const update = (fn: (old: EditorState) => EditorState) => setStored(old => ({orgId,value:fn(old.orgId===orgId?old.value:empty())}));
  const model = useMemo(() => {
    if (!policy) return null;
    const groups = new Map<string, PaymentGroup>();
    const events = new Map<string, CollectionEvent>();
    const parse = (value?: string) => value?.trim() ? parseCurrencyInput(value) ?? NaN : 0;
    const groupIds = treatmentGroupIds(source.map(line => ({
      id: line.id, visit: line.visit, tooth: line.tooth,
      classification: state.lines[line.id]?.classification ?? line.classification ?? 'review',
      explicitGroup: state.lines[line.id]?.group,
    })));
    const procedures = source.map(line => {
      const edit = state.lines[line.id] ?? {};
      const classification = edit.classification ?? line.classification ?? 'review';
      const groupId = groupIds.get(line.id)!;
      if (!groups.has(groupId)) {
        const baseOrder = classOrder[classification] * 1000 + groups.size * 10;
        const groupLabel = patientClassTitle[classification];
        const links: PaymentGroup['events'] = {};
        for (const kind of milestoneKinds) {
          if (kind === 'tryin') continue; // No invented try-in appointment; staff can add it.
          const id = `${groupId}:${kind}`;
          const offset = kind === 'booking' ? 0 : kind === 'delivery' ? 8 : 4;
          events.set(id, { id, label: `${groupLabel} — ${policy.labels[kind] ?? kind}`, order: baseOrder + offset, appointmentId: kind === 'booking' ? undefined : id });
          links[kind] = id;
        }
        groups.set(groupId, { id: groupId, label: groupLabel, classification, events: links });
      }
      return { id: line.id, code: line.code, groupId, responsibilityCents: line.responsibilityCents, adjustmentCents: parse(edit.adjustment), paidCents: parse(edit.paid) };
    });
    // Patient wording is independent of appointment numbers and grouping identity.
    // These existing form fields stay local; they are never added to AI requests.
    for (const group of groups.values()) {
      const members = source.filter(line => procedures.find(p => p.id === line.id)?.groupId === group.id && line.responsibilityCents > 0);
      const labels = [...new Set(members.map(line => line.procedureLabel?.trim()).filter(Boolean))];
      const teeth = [...new Set(members.flatMap(line => (line.tooth ?? '').trim().split(/[\s,;/]+/)).filter(Boolean))];
      const treatment = labels.length > 0 && labels.length <= 2 ? labels.join(' + ') : patientClassTitle[group.classification];
      const toothLabel = teeth.length ? ` — ${teeth.length === 1 ? 'tooth' : 'teeth'} ${teeth.join(', ')}` : '';
      group.label = state.groups[group.id]?.label?.trim() || `${treatment}${toothLabel}`;
      for (const kind of milestoneKinds) {
        const event = events.get(group.events[kind] ?? '');
        if (event) event.label = `${group.label} — ${policy.labels[kind] ?? kind}`;
      }
    }
    for (const line of source) {
      const targetId = state.lines[line.id]?.deliveryGroup;
      const group = targetId ? groups.get(targetId) : undefined;
      if (line.responsibilityCents === 0 && group) {
        const id = `delivery-marker:${line.id}`;
        events.set(id, { id, label: `${line.code} — delivery appointment`, order: events.get(group.events.delivery!)?.order ?? 3000, appointmentId: id });
        group.events.delivery = id;
      }
    }
    for (const event of state.extraEvents) events.set(event.id, event);
    const finalGroups = [...groups.values()].map(g => ({ ...g, ...state.groups[g.id], id: g.id, label: g.label, events: { ...g.events, ...state.groups[g.id]?.events } }));
    const finalEvents = [...events.values()].map(e => ({ ...e, ...state.events[e.id], id: e.id }));
    const schedule = buildPaymentSchedule({ policy, procedures, groups: finalGroups, events: finalEvents, expectedObligationCents: expected, overrides: state.overrides });
    for (const line of source) {
      const target = state.lines[line.id]?.deliveryGroup;
      if (target && (line.responsibilityCents !== 0 || !groups.has(target))) schedule.issues.push('Review a delivery marker whose fee or linked payment group changed.');
    }
    // Conflicting classifications cannot silently become the first line's class.
    for (const g of finalGroups) {
      const classes = source.filter(l => procedures.find(p => p.id === l.id)?.groupId === g.id).map(l => state.lines[l.id]?.classification ?? l.classification ?? 'review');
      if (new Set(classes).size > 1) schedule.issues.push('A group contains different payment classifications. Split it into groups and link their collection events.');
    }
    return { groups: finalGroups, events: finalEvents, procedures, schedule };
  }, [policy, source, expected, state]);
  const isDirty = Object.values(state).some(value => Object.keys(value).length > 0);
  return { model, state, update, reset: () => update(empty), source, isDirty };
}

export function PaymentScheduleEditor({ editor }: { editor: ReturnType<typeof usePaymentScheduleEditor> }) {
  const { model, state, update, source } = editor;
  if (!model) return null;
  const { schedule, groups, events } = model;
  const editLine = (id: string, patch: LineEdit) => update(s => ({ ...s, lines: { ...s.lines, [id]: { ...s.lines[id], ...patch } } }));
  const editGroup = (id: string, patch: Partial<PaymentGroup>) => update(s => ({ ...s, groups: { ...s.groups, [id]: { ...s.groups[id], ...patch } } }));
  const editEvent = (id: string, patch: Partial<CollectionEvent>) => update(s => ({ ...s, events: { ...s.events, [id]: { ...s.events[id], ...patch } } }));
  const editOverride = (id: string, patch: Partial<PaymentOverride>) => update(s => ({ ...s, overrides: { ...s.overrides, [id]: { ...s.overrides[id], basis: schedule.signature, ...patch } } }));
  return <section className="space-y-4 border p-4" aria-label="Office payment schedule">
    <h3 className="font-semibold">Payment groups & collection events</h3>
    <p className="text-sm">Review the proposed groups and appointments. Give related procedures the same group name when prepared together. To combine different treatments, keep separate groups, enter the same arrangement name, and link their actual collection events below. Booking means when that phase is booked; no date is assumed.</p>
    {source.map(line => {
      const edit = state.lines[line.id] ?? {};
      return <fieldset key={line.id} className="border p-2 space-y-2"><legend>{line.code || 'Procedure'} — OOP {formatCents(line.responsibilityCents)}</legend>
        <label className="block text-sm">Payment classification <select aria-label={`Classification ${line.id}`} value={edit.classification ?? line.classification ?? 'review'} onChange={e => editLine(line.id, { classification: e.target.value as PaymentClass })}>
          {['review', ...paymentClasses].map(c => <option key={c} value={c}>{classTitle[c]}</option>)}
        </select></label>
        {line.responsibilityCents === 0 && <label className="block text-sm">Use this zero-fee appointment as delivery for <select aria-label={`Delivery marker ${line.id}`} value={edit.deliveryGroup ?? ''} onChange={e => editLine(line.id, { deliveryGroup: e.target.value })}><option value="">No payment milestone (for example, post-op)</option>{groups.filter(g => ['restoration','denture'].includes(g.classification)).map(g => <option key={g.id} value={g.id}>{g.label}</option>)}</select></label>}
        <label className="block text-sm">Payment group<Input aria-label={`Group ${line.id}`} value={edit.group ?? ''} placeholder={model.procedures.find(p => p.id === line.id)?.groupId} onChange={e => editLine(line.id, { group: e.target.value })} /></label>
        <div className="grid grid-cols-2 gap-2"><label className="text-sm">Allocated discount / credit<Input aria-label={`Adjustment ${line.id}`} value={edit.adjustment ?? ''} placeholder="0.00" onChange={e => editLine(line.id, { adjustment: e.target.value })} /></label>
        <label className="text-sm">Explicitly paid already<Input aria-label={`Paid ${line.id}`} value={edit.paid ?? ''} placeholder="0.00" onChange={e => editLine(line.id, { paid: e.target.value })} /></label></div>
      </fieldset>;
    })}
    {groups.map(group => <div key={group.id} className="border p-2 space-y-2">
      <label className="block text-sm">Treatment name on the patient form<Input aria-label={`Treatment name ${group.id}`} value={group.label} onChange={e => editGroup(group.id, { label: e.target.value })} /></label>
      {groups.some(other => other.id !== group.id && other.label === group.label) && <p className="text-sm text-muted-foreground">These treatments have the same name. Add the teeth or a clear description to distinguish them.</p>}
      <details><summary>Appointments for {group.label}</summary>
      <label className="block text-sm">Combined arrangement (optional)<Input value={group.arrangementId ?? ''} onChange={e => editGroup(group.id, { arrangementId: e.target.value })} /></label>
      {milestoneKinds.map(kind => <label key={kind} className="block text-sm">{kind} <select aria-label={`${group.id} ${kind}`} value={group.events[kind] ?? ''} onChange={e => editGroup(group.id, { events: { ...group.events, [kind]: e.target.value } })}>
        <option value="">No appointment selected</option>{events.map(event => <option key={event.id} value={event.id}>{event.label}</option>)}
      </select></label>)}
    </details></div>)}
    <details className="border p-2"><summary>Collection event names and order</summary>
      <p className="text-sm">Order records the actual appointment sequence, not a predicted calendar date. Use the same event above only when money is collected together.</p>
      {events.map(event => <div key={event.id} className="flex gap-2 py-1"><Input aria-label={`Event label ${event.id}`} value={event.label} onChange={e => editEvent(event.id, { label: e.target.value })} /><Input aria-label={`Event order ${event.id}`} className="w-24" type="number" value={event.order} onChange={e => editEvent(event.id, { order: Number(e.target.value) })} /></div>)}
      <Button type="button" variant="outline" onClick={() => update(s => ({ ...s, extraEvents: [...s.extraEvents, { id: `custom:${crypto.randomUUID()}`, label: 'New collection event', order: events.length * 100 }] }))}>Add collection event</Button>
    </details>
    <p>Full obligation: {formatCents(schedule.obligationCents)} · Recorded paid: {formatCents(schedule.paidCents)} · Remaining: {formatCents(schedule.remainingCents)}</p>
    {schedule.rows.map(row => <div key={row.id} className="border p-2 space-y-1">
      <Input aria-label={`Payment label ${row.id}`} value={row.label} onChange={e => editOverride(row.id, { label: e.target.value })} />
      <MoneyEdit key={`${row.id}:${row.cents}`} label={`Payment amount ${row.id}`} cents={row.cents} commit={cents => editOverride(row.id, { cents, ...(row.allocations.length === 1 ? { allocations: [{ ...row.allocations[0], cents }] } : {}) })} />
      <details className="text-xs"><summary>Component allocations (must match payment and procedure totals)</summary>{row.allocations.map((a, i) => <label className="block" key={i}>{a.groupId} / {a.procedureId}<MoneyEdit key={`${row.id}:${a.procedureId}:${a.cents}`} label={`Allocation ${row.id} ${a.procedureId} ${i}`} cents={a.cents} commit={cents => { const allocations = row.allocations.map((b, j) => j === i ? { ...b, cents } : b); editOverride(row.id, { allocations, cents: allocations.reduce((s, b) => s + b.cents, 0) }); }} /></label>)}</details>
    </div>)}
    {Object.keys(state.overrides).length > 0 && <Button variant="outline" onClick={() => update(s => ({ ...s, overrides: {} }))}>Clear payment overrides</Button>}
    {Object.entries(state.overrides).filter(([, o]) => o.basis !== schedule.signature).map(([id, o]) => <div key={id} className="text-sm">Saved override for {id}: {o.label} {o.cents === undefined ? '' : formatCents(o.cents)} <Button variant="outline" onClick={() => editOverride(id, {})}>Confirm after review</Button></div>)}
    {schedule.issues.length > 0 && <div role="alert" className="text-destructive"><strong>Review required before printing</strong><ul>{[...new Set(schedule.issues)].map(issue => <li key={issue}>{issue}</li>)}</ul></div>}
  </section>;
}
