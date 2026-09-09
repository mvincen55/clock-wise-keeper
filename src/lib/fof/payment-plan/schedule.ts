/**
 * The payment-plan engine.
 *
 * Given an office's policy, the procedures with their own out-of-pocket
 * responsibility, and the real appointments they happen at, produce the
 * collection schedule: stable payment rows, each carrying the exact
 * per-procedure allocations that explain it.
 *
 * Invariants enforced here (and asserted in the tests):
 * - every included patient-responsibility cent is allocated exactly once,
 * - no negative amount and no unexplained balance,
 * - scheduled rows + explicitly recorded prior payments = the obligation,
 * - rows combine ONLY when their milestones resolve to the same real
 *   collection event — never because two labels share a word,
 * - labels never affect the maths.
 */

import type { Cents } from '../types';
import {
  MILESTONE_ORDER,
  type Allocation,
  type MilestoneKind,
  type PaymentPlanInput,
  type PaymentPlanIssue,
  type PaymentPlanResult,
  type PaymentPolicy,
  type PaymentRow,
  type PlanProcedure,
} from './types';

/** Split evenly into `count` parts; the balancing cents follow the policy. */
export function splitExact(total: Cents, count: number, rounding: 'last' | 'first'): Cents[] {
  if (count <= 0) return [];
  const base = Math.floor(total / count);
  const parts = new Array(count).fill(base) as number[];
  let remainder = total - base * count;
  if (rounding === 'last') {
    // Extra cents land on the EARLIEST payments, so the final installment
    // absorbs the balancing difference ($666.67 / $666.67 / $666.66).
    for (let i = 0; remainder > 0; i = (i + 1) % count) {
      parts[i] += 1;
      remainder -= 1;
    }
  } else {
    for (let i = count - 1; remainder > 0; i = i === 0 ? count - 1 : i - 1) {
      parts[i] += 1;
      remainder -= 1;
    }
  }
  return parts;
}

interface GroupView {
  groupId: string;
  label: string;
  procedures: PlanProcedure[];
  /** Unpaid out-of-pocket for the group — what the schedule must collect. */
  oopCents: Cents;
  paidCents: Cents;
  anchorAppointmentId: string;
  anchorOrder: number;
  deliveryAppointmentId: string;
  deliveryOrder: number;
}

function buildGroups(procedures: PlanProcedure[]): GroupView[] {
  const byGroup = new Map<string, PlanProcedure[]>();
  for (const p of procedures) {
    byGroup.set(p.groupId, [...(byGroup.get(p.groupId) ?? []), p]);
  }
  const groups: GroupView[] = [];
  for (const [groupId, list] of byGroup) {
    const paying = list.filter((p) => p.oopCents > 0);
    const anchorSource = (paying.length > 0 ? paying : list).reduce((best, p) =>
      p.appointmentOrder < best.appointmentOrder ? p : best
    );
    // A zero-fee marker (seat/delivery appointment with no charge) may carry
    // the delivery identity without adding a payment.
    const deliverySource = list.reduce<{ id: string; order: number } | null>((best, p) => {
      const id = p.deliveryAppointmentId ?? (p.treatmentClass === 'zero_fee_marker' ? p.appointmentId : undefined);
      if (!id) return best;
      const order = p.deliveryAppointmentOrder ?? p.appointmentOrder;
      if (!best || order > best.order) return { id, order };
      return best;
    }, null);
    groups.push({
      groupId,
      label: list.find((p) => p.label)?.label ?? '',
      procedures: list,
      oopCents: list.filter((p) => !p.alreadyPaid).reduce((s, p) => s + p.oopCents, 0),
      paidCents: list.filter((p) => p.alreadyPaid).reduce((s, p) => s + p.oopCents, 0),
      anchorAppointmentId: anchorSource.appointmentId,
      anchorOrder: anchorSource.appointmentOrder,
      deliveryAppointmentId: deliverySource?.id ?? `${groupId}::delivery`,
      deliveryOrder: deliverySource?.order ?? anchorSource.appointmentOrder + 0.25,
    });
  }
  return groups.sort((a, b) => a.anchorOrder - b.anchorOrder);
}

function tierFor(group: GroupView, policy: PaymentPolicy): 'atOrAbove' | 'below' {
  const above = policy.thresholdInclusive
    ? group.oopCents >= policy.thresholdCents
    : group.oopCents > policy.thresholdCents;
  return above ? 'atOrAbove' : 'below';
}

function milestonesFor(
  group: GroupView,
  policy: PaymentPolicy,
  combinedArrangement: boolean
): MilestoneKind[] {
  const cls = group.procedures[0]?.treatmentClass ?? 'other_no_delivery';
  const strategy = policy.strategies[cls];
  if (cls === 'implant_surgical' && policy.implantAdvanceException) {
    // The office buys implant parts in advance: halves apply at every amount.
    return strategy.atOrAbove;
  }
  // Combined arrangements lose the standalone same-day allowance.
  if (combinedArrangement && policy.mixedGroupTierUplift) return strategy.atOrAbove;
  return strategy[tierFor(group, policy)];
}


/**
 * Which real collection event a milestone is due at.
 *
 * - work-up / prep / surgery / treatment / impression: the group's own
 *   clinical appointment,
 * - delivery: the group's delivery appointment,
 * - schedule: the BOOKING of that clinical appointment — so two groups whose
 *   work is booked at the same appointment share one scheduling payment,
 *   while a phase booked months later keeps its own.
 */
function eventFor(group: GroupView, kind: MilestoneKind): { id: string; order: number } {
  if (kind === 'delivery') {
    return { id: group.deliveryAppointmentId, order: group.deliveryOrder };
  }
  if (kind === 'schedule') {
    return { id: `booking::${group.anchorAppointmentId}`, order: group.anchorOrder - 0.5 };
  }
  return { id: group.anchorAppointmentId, order: group.anchorOrder };
}

export function milestoneId(groupId: string, kind: MilestoneKind): string {
  return `${groupId}::${kind}`;
}

export function buildPaymentPlan(input: PaymentPlanInput): PaymentPlanResult {
  const { policy } = input;
  // An office that has not configured a policy keeps its existing schedule:
  // the engine produces nothing rather than guessing rules for them.
  if (!policy.enabled) {
    return {
      rows: [],
      scheduledCents: 0,
      priorPaidCents: 0,
      obligationCents: 0,
      issues: [],
      blocksPrint: false,
    };
  }
  const issues: PaymentPlanIssue[] = [];
  const groups = buildGroups(input.procedures);

  interface EventBucket {
    id: string;
    order: number;
    kinds: MilestoneKind[];
    allocations: Allocation[];
    amount: Cents;
  }
  const buckets = new Map<string, EventBucket>();
  let priorPaidCents = 0;

  // A group whose treatment happens at an appointment shared with other
  // paying treatment is part of a combined arrangement: its standalone
  // below-threshold allowance ("just pay it that day") no longer applies,
  // because the money now has to reconcile across the whole arrangement.
  const anchorCounts = new Map<string, number>();
  for (const g of groups) {
    if (g.oopCents > 0) {
      anchorCounts.set(g.anchorAppointmentId, (anchorCounts.get(g.anchorAppointmentId) ?? 0) + 1);
    }
  }

  for (const group of groups) {
    priorPaidCents += group.paidCents;
    if (group.oopCents <= 0) continue;
    const combined = (anchorCounts.get(group.anchorAppointmentId) ?? 0) > 1;
    const kinds = milestonesFor(group, policy, combined);
    if (kinds.length === 0) continue;
    const amounts = splitExact(group.oopCents, kinds.length, policy.rounding);

    // Per-procedure allocation inside the group: each procedure contributes
    // its share of each milestone, so the office can see why an amount is
    // due. Allocation is CUMULATIVE, so every procedure's shares add back to
    // exactly its own responsibility with no rounding drift.
    const paying = group.procedures.filter((p) => !p.alreadyPaid && p.oopCents > 0);
    const shareMatrix = allocateCumulative(amounts, paying);

    kinds.forEach((kind, index) => {
      const mid = milestoneId(group.groupId, kind);
      const link = input.eventLinks?.[mid];
      const auto = eventFor(group, kind);
      const event = link ? { id: link, order: auto.order } : auto;
      const linkedOrder = link
        ? Math.min(auto.order, buckets.get(link)?.order ?? auto.order)
        : auto.order;
      const key = policy.combineMode === 'never' ? mid : event.id;

      const allocations: Allocation[] = paying.map((p, i) => ({
        procedureId: p.id,
        groupId: group.groupId,
        code: p.code,
        milestoneId: mid,
        kind,
        amountCents: shareMatrix[index][i],
      }));


      const existing = buckets.get(key);
      if (existing) {
        existing.amount += amounts[index];
        existing.kinds.push(kind);
        existing.allocations.push(...allocations);
        existing.order = Math.min(existing.order, linkedOrder);
      } else {
        buckets.set(key, {
          id: key,
          order: linkedOrder,
          kinds: [kind],
          allocations,
          amount: amounts[index],
        });
      }
    });
  }

  const ordered = [...buckets.values()].sort((a, b) => a.order - b.order);
  const rows: PaymentRow[] = ordered.map((bucket) => {
    const override = input.overrides?.amounts?.[bucket.id];
    const labelOverride = input.overrides?.labels?.[bucket.id];
    const computed = bucket.amount;
    const amount = override ?? computed;
    if (amount < 0) {
      issues.push({
        code: 'negative_amount',
        message: 'A payment amount is negative — check the manual override.',
        blocksPrint: true,
        rowId: bucket.id,
      });
    }
    return {
      id: bucket.id,
      label: labelOverride?.trim() || labelFor(bucket.kinds, policy),
      amountCents: amount,
      computedCents: computed,
      overridden: override !== undefined && override !== computed,
      labelOverridden: !!labelOverride?.trim(),
      order: bucket.order,
      kinds: bucket.kinds,
      allocations: bucket.allocations,
    };
  });

  // Overrides pointing at rows that no longer exist are STALE — surfaced,
  // never silently dropped and never silently applied elsewhere.
  const rowIds = new Set(rows.map((r) => r.id));
  for (const id of Object.keys(input.overrides?.amounts ?? {})) {
    if (!rowIds.has(id)) {
      issues.push({
        code: 'stale_amount_override',
        message: 'A manual amount no longer matches any payment on this plan.',
        blocksPrint: true,
        rowId: id,
      });
    }
  }
  for (const id of Object.keys(input.overrides?.labels ?? {})) {
    if (!rowIds.has(id)) {
      issues.push({
        code: 'stale_label_override',
        message: 'A manual payment name no longer matches any payment on this plan.',
        blocksPrint: false,
        rowId: id,
      });
    }
  }

  const scheduledCents = rows.reduce((s, r) => s + r.amountCents, 0);
  const computedTotal = rows.reduce((s, r) => s + r.computedCents, 0);
  if (scheduledCents !== computedTotal) {
    issues.push({
      code: 'override_total_mismatch',
      message:
        'The manually edited payments no longer add up to the amount due. Adjust another payment or clear the override.',
      blocksPrint: true,
    });
  }

  const unallocated = input.unallocatedAdjustmentCents ?? 0;
  if (unallocated !== 0) {
    issues.push({
      code: 'unallocated_adjustment',
      message:
        'A discount or credit has no allocation across the payment groups. Allocate it before printing — an automatic split could change which tier a group falls in.',
      blocksPrint: true,
    });
  }

  return {
    rows,
    scheduledCents,
    priorPaidCents,
    obligationCents: scheduledCents + priorPaidCents,
    issues,
    blocksPrint: issues.some((i) => i.blocksPrint),
  };
}

/** Split one milestone amount across the procedures that fund it. */
function allocateCumulative(amounts: Cents[], procedures: PlanProcedure[]): Cents[][] {
  const total = procedures.reduce((s, p) => s + p.oopCents, 0);
  if (procedures.length === 0 || total <= 0) return amounts.map(() => procedures.map(() => 0));
  const rows: Cents[][] = [];
  let cumulative = 0;
  let previous = procedures.map(() => 0);
  for (const amount of amounts) {
    cumulative += amount;
    // Cumulative targets: rounding can never drift, because the final
    // cumulative target for each procedure is exactly its own amount.
    const targets = procedures.map((p) => Math.floor((cumulative * p.oopCents) / total));
    let remainder = cumulative - targets.reduce((a, b) => a + b, 0);
    for (let i = 0; remainder > 0; i = (i + 1) % targets.length) {
      // Never hand a procedure more than it owes in total.
      if (targets[i] < procedures[i].oopCents) {
        targets[i] += 1;
        remainder -= 1;
      } else if (targets.every((t, j) => t >= procedures[j].oopCents)) {
        break;
      }
    }
    rows.push(targets.map((t, i) => t - previous[i]));
    previous = targets;
  }
  return rows;
}

function labelFor(kinds: MilestoneKind[], policy: PaymentPolicy): string {
  const unique = [...new Set(kinds)].sort((a, b) => MILESTONE_ORDER[a] - MILESTONE_ORDER[b]);
  return unique.map((k) => policy.labels[k]).join(' / ');
}
