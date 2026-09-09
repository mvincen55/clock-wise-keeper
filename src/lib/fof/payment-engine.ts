/** Pure, memory-only payment allocation. Labels never determine grouping or timing. */
import { paymentPolicySchema, type PaymentClass, type PaymentPolicy, type MilestoneKind } from './payment-policy';

export interface PaymentProcedure { id: string; code?: string; groupId: string; responsibilityCents: number; adjustmentCents?: number; paidCents?: number }
export interface CollectionEvent { id: string; label: string; order: number; appointmentId?: string }
export interface PaymentGroup {
  id: string; label: string; classification: PaymentClass | 'review';
  /** Explicit combined treatment arrangement; unrelated groups never share a threshold. */
  arrangementId?: string;
  events: Partial<Record<MilestoneKind, string>>;
}
export interface PaymentAllocation { groupId: string; procedureId: string; milestone: MilestoneKind; cents: number }
export interface PaymentRow { id: string; label: string; cents: number; allocations: PaymentAllocation[]; appointmentId?: string }
export interface PaymentOverride { cents?: number; label?: string; basis: string; allocations?: PaymentAllocation[] }
export interface PaymentSchedule {
  rows: PaymentRow[]; issues: string[]; obligationCents: number; paidCents: number; remainingCents: number;
  signature: string; priorPayments: { procedureId: string; groupId: string; cents: number }[];
  procedureLabels: Record<string, string>; groupLabels: Record<string, string>;
}
export interface PaymentInput {
  policy: PaymentPolicy; procedures: PaymentProcedure[]; groups: PaymentGroup[]; events: CollectionEvent[];
  /** The existing form's patient portion, after its discounts/credits, before explicit prior payments. */
  expectedObligationCents: number;
  overrides?: Record<string, PaymentOverride>;
}

const centsOK = (n: number) => Number.isSafeInteger(n) && n >= 0;
const sum = (ns: number[]) => ns.reduce((a, b) => a + b, 0);

/** Naming suggestions can only add labels; staff edits and allocation bases survive. */
export function suggestedPaymentLabels(schedule: PaymentSchedule, overrides: Record<string, PaymentOverride>, names: string[]): Record<string, PaymentOverride> {
  if (names.length !== schedule.rows.length || names.some(name => typeof name !== 'string' || !name.trim())) throw new Error('Invalid payment names');
  const next = { ...overrides };
  schedule.rows.forEach((row, i) => {
    if (next[row.id]?.label) return;
    next[row.id] = { ...next[row.id], basis: next[row.id]?.basis ?? schedule.signature, label: names[i] };
  });
  return next;
}

/** Earlier parts rounded independently; all balancing cents go to the last part. */
export function splitPolicyCents(total: number, weights: number[], rounding: PaymentPolicy['rounding']): number[] {
  if (!centsOK(total) || !weights.length || weights.some(w => !Number.isSafeInteger(w) || w <= 0)) throw new Error('Invalid installment inputs');
  const denominator = BigInt(sum(weights));
  let remaining = total;
  return weights.map((w, i) => {
    if (i === weights.length - 1) return remaining;
    const numerator = BigInt(total) * BigInt(w);
    const amount = Number(rounding === 'nearestLast' ? (numerator * 2n + denominator) / (denominator * 2n) : numerator / denominator);
    // Tiny totals can otherwise create a negative last installment.
    const part = Math.min(remaining, amount);
    remaining -= part;
    return part;
  });
}

export function buildPaymentSchedule(input: PaymentInput): PaymentSchedule {
  const { procedures, groups, events, expectedObligationCents, overrides = {} } = input;
  const issues: string[] = [];
  const parsed = paymentPolicySchema.safeParse(input.policy);
  const signature = JSON.stringify([input.policy, procedures, groups.map(g => ({ ...g, label: undefined })), events.map(e => ({ ...e, label: undefined })), expectedObligationCents]);
  const result: PaymentSchedule = { rows: [], issues, obligationCents: 0, paidCents: 0, remainingCents: 0, signature, priorPayments: [], procedureLabels: Object.fromEntries(procedures.map(p => [p.id, p.code || p.id])), groupLabels: Object.fromEntries(groups.map(g => [g.id, g.label])) };
  if (!parsed.success) { issues.push('Office payment policy is invalid. Ask a manager to review it.'); return result; }
  const policy = parsed.data;
  const duplicate = (ids: string[], kind: string) => {
    if (ids.some(id => !id.trim()) || new Set(ids).size !== ids.length) issues.push(`Missing or duplicate ${kind} identity.`);
  };
  duplicate(procedures.map(p => p.id), 'procedure'); duplicate(groups.map(g => g.id), 'group'); duplicate(events.map(e => e.id), 'event');
  if (events.some(e => !Number.isFinite(e.order))) issues.push('Collection event order must be a finite number.');
  if (!centsOK(expectedObligationCents)) issues.push('Patient obligation must be nonnegative integer cents.');
  const groupById = new Map(groups.map(g => [g.id, g]));
  const eventById = new Map(events.map(e => [e.id, e]));
  const amounts = new Map<string, number>();
  for (const p of procedures) {
    const adjustment = p.adjustmentCents ?? 0;
    const paid = p.paidCents ?? 0;
    const obligation = p.responsibilityCents - adjustment;
    if (!centsOK(p.responsibilityCents) || !Number.isSafeInteger(adjustment) || !centsOK(obligation) || !centsOK(paid) || paid > obligation) {
      issues.push('Review invalid responsibility, adjustment, or prior payment.'); continue;
    }
    if (!groupById.has(p.groupId)) issues.push('A procedure has no payment group.');
    amounts.set(p.id, obligation);
    result.obligationCents += obligation; result.paidCents += paid;
    if (paid) result.priorPayments.push({ procedureId: p.id, groupId: p.groupId, cents: paid });
  }
  result.remainingCents = result.obligationCents - result.paidCents;
  if (!centsOK(result.obligationCents)) issues.push('Patient obligation exceeds the supported amount.');
  if (result.obligationCents !== expectedObligationCents) issues.push('Allocate the form’s adjustments to procedures before printing; line responsibility does not match the patient obligation.');
  if (issues.length) return result;

  const groupTotals = new Map(groups.map(g => [g.id, sum(procedures.filter(p => p.groupId === g.id).map(p => amounts.get(p.id)!))]));
  const rowMap = new Map<string, PaymentRow>();
  const allowedAllocations = new Map<string, PaymentAllocation[]>();
  for (const group of groups) {
    const lines = procedures.filter(p => p.groupId === group.id);
    const total = groupTotals.get(group.id)!;
    if (!total) continue;
    if (group.classification === 'review') { issues.push(`Classify payment group “${group.label}” before printing.`); continue; }
    let thresholdAmount = total;
    if (policy.mixedThreshold === 'explicitArrangement' && group.classification === 'other' && group.arrangementId) {
      const treatmentId = group.events.treatment;
      const related = groups.filter(g => g.arrangementId === group.arrangementId && g.classification !== 'workup' && g.classification !== 'implant' &&
        g.events.booking === group.events.booking && !!group.events.booking && !!treatmentId &&
        (g.events.prep === treatmentId || g.events.impressions === treatmentId || g.events.treatment === treatmentId));
      if (related.some(g => g.id !== group.id && (g.events.prep === treatmentId || g.events.impressions === treatmentId) && g.events.booking === group.events.booking && !!treatmentId && !!group.events.booking)) {
        thresholdAmount = sum(related.map(g => groupTotals.get(g.id)!));
      } else issues.push(`Review the shared booking and treatment event for “${group.label}”.`);
    }
    const high = policy.inclusive ? thresholdAmount >= policy.thresholdCents : thresholdAmount > policy.thresholdCents;
    const rule = policy.strategies[group.classification];
    const strategy = group.classification === 'implant' && policy.implantAdvance ? rule.above : high ? rule.above : rule.below;
    const milestones: { kind: MilestoneKind; event: CollectionEvent }[] = [];
    for (const step of strategy) {
      let kind: MilestoneKind;
      if (step.at === 'firstImpressionsOrTryin') {
        const candidates = (['impressions', 'tryin'] as const).filter(k => eventById.has(group.events[k] ?? ''));
        candidates.sort((a, b) => eventById.get(group.events[a]!)!.order - eventById.get(group.events[b]!)!.order);
        if (candidates.length > 1 && group.events[candidates[0]] !== group.events[candidates[1]] && eventById.get(group.events[candidates[0]]!)!.order === eventById.get(group.events[candidates[1]]!)!.order) {
          issues.push(`Specify which impressions or try-in appointment occurs first for “${group.label}”.`);
        }
        kind = candidates[0];
      } else kind = step.at;
      const event = eventById.get(group.events[kind] ?? '');
      if (!event) { issues.push(`Select the ${step.at} collection event for “${group.label}”.`); continue; }
      milestones.push({ kind, event });
    }
    if (milestones.length !== strategy.length) continue;
    if (milestones.some((m, i) => i > 0 && m.event.order < milestones[i - 1].event.order)) { issues.push(`Collection events for “${group.label}” are out of order.`); continue; }
    const parts = splitPolicyCents(total, strategy.map(s => s.weight), policy.rounding);
    for (const { event, kind } of milestones) {
      const eligible = allowedAllocations.get(event.id) ?? [];
      for (const line of lines) if (!eligible.some(a => a.procedureId === line.id && a.milestone === kind)) eligible.push({ groupId: group.id, procedureId: line.id, milestone: kind, cents: 0 });
      allowedAllocations.set(event.id, eligible);
    }
    // Transportation allocation: exact group installment totals and exact line totals.
    const lineRemaining = lines.map(p => amounts.get(p.id)!);
    const paidRemaining = lines.map(p => p.paidCents ?? 0);
    for (let i = 0; i < parts.length; i++) {
      let capacity = parts[i];
      const { event, kind } = milestones[i];
      for (let j = 0; j < lines.length && capacity; j++) {
        const allocated = Math.min(capacity, lineRemaining[j]);
        lineRemaining[j] -= allocated; capacity -= allocated;
        const covered = Math.min(allocated, paidRemaining[j]);
        paidRemaining[j] -= covered;
        const due = allocated - covered;
        if (!due) continue;
        const row = rowMap.get(event.id) ?? { id: event.id, label: event.label, cents: 0, allocations: [], appointmentId: event.appointmentId };
        row.cents += due;
        row.allocations.push({ groupId: group.id, procedureId: lines[j].id, milestone: kind, cents: due });
        rowMap.set(event.id, row);
      }
    }
  }
  result.rows = [...rowMap.values()].sort((a, b) => eventById.get(a.id)!.order - eventById.get(b.id)!.order || a.id.localeCompare(b.id));
  for (const row of result.rows) {
    row.allocations = (allowedAllocations.get(row.id) ?? []).map(a => ({ ...a, cents: sum(row.allocations.filter(b => b.procedureId === a.procedureId && b.milestone === a.milestone).map(b => b.cents)) }));
  }
  for (const [id, override] of Object.entries(overrides)) {
    const row = result.rows.find(r => r.id === id);
    if (!row) { issues.push('An overridden payment event was removed. Review or clear its override.'); continue; }
    if (override.basis !== signature) issues.push('A payment override is stale. Review and confirm it against the current plan.');
    if (override.label !== undefined) row.label = override.label;
    if (override.allocations !== undefined) {
      const allowed = allowedAllocations.get(id) ?? [];
      if (override.allocations.some(a => !centsOK(a.cents) || !allowed.some(b => b.groupId === a.groupId && b.procedureId === a.procedureId && b.milestone === a.milestone))) issues.push('An override allocation is invalid or moves payment outside its treatment milestone.');
      else row.allocations = override.allocations.map(a => ({ ...a }));
    }
    if (override.cents !== undefined) {
      if (!centsOK(override.cents)) issues.push('A payment override must be nonnegative integer cents.');
      row.cents = override.cents;
    }
    if (sum(row.allocations.map(a => a.cents)) !== row.cents) issues.push('An amount override differs from its component allocations. Review the payment milestones before printing.');
  }
  for (const p of procedures) {
    const due = amounts.get(p.id)! - (p.paidCents ?? 0);
    const allocated = sum(result.rows.flatMap(r => r.allocations).filter(a => a.procedureId === p.id).map(a => a.cents));
    if (allocated !== due) issues.push('Procedure allocations do not reconcile to each procedure’s remaining responsibility.');
  }
  if (sum(result.rows.map(r => r.cents)) !== result.remainingCents) issues.push('Installments do not reconcile to the remaining amount due.');
  return result;
}
