/**
 * Bridge between the FOF builder's rows and the office's payment engine.
 *
 * The builder owns typing and insurance maths; the engine owns the payment
 * schedule. This module does the translation and nothing else, so the
 * builder, the office copy, the preview and the print sheet all read one
 * result object instead of each re-deriving amounts.
 *
 * Memory only: no persistence, no logging, no network.
 */

import type { Cents } from '../types';
import type { VisitPlan } from '../visits';
import { proceduresFromLines, type PlanLineInput } from './from-lines';
import { buildPaymentPlan } from './schedule';
import type { PaymentPlanResult, PaymentPolicy } from './types';

export type AdjustmentAllocation = 'unallocated' | 'prorata';

export interface BuilderPlanInput {
  policy: PaymentPolicy;
  lines: PlanLineInput[];
  /**
   * Discounts and credits taken off the whole form rather than off named
   * procedures. Left unallocated they block printing, because spreading
   * them silently could move a group across the office's threshold.
   */
  adjustmentCents?: Cents;
  adjustmentAllocation?: AdjustmentAllocation;
  overrides?: { amounts?: Record<string, Cents>; labels?: Record<string, string> };
  eventLinks?: Record<string, string>;
}

/** Reduce responsibilities by an exact total, spreading cents proportionally. */
function applyProRata<T extends { oopCents: Cents }>(items: T[], reduceBy: Cents): T[] {
  const total = items.reduce((s, p) => s + p.oopCents, 0);
  const target = Math.min(Math.max(reduceBy, 0), total);
  if (target === 0 || total === 0) return items;
  let cumulative = 0;
  let taken = 0;
  return items.map((item, i) => {
    cumulative += item.oopCents;
    const shouldHaveTaken =
      i === items.length - 1 ? target : Math.floor((target * cumulative) / total);
    const take = shouldHaveTaken - taken;
    taken = shouldHaveTaken;
    return { ...item, oopCents: item.oopCents - take };
  });
}

export interface BuilderPlan {
  result: PaymentPlanResult;
  /** Feed to computeFof so every surface prints the same schedule. */
  visitPlan: VisitPlan | null;
}

export function buildBuilderPaymentPlan(input: BuilderPlanInput): BuilderPlan {
  const { policy } = input;
  const adjustment = input.adjustmentCents ?? 0;
  const allocation = input.adjustmentAllocation ?? 'unallocated';

  let procedures = proceduresFromLines(input.lines, policy);
  if (adjustment > 0 && allocation === 'prorata') {
    procedures = applyProRata(procedures, adjustment);
  }

  const result = buildPaymentPlan({
    policy,
    procedures,
    eventLinks: input.eventLinks,
    unallocatedAdjustmentCents:
      adjustment > 0 && allocation === 'unallocated' ? adjustment : 0,
    overrides: input.overrides,
  });

  const visitPlan: VisitPlan | null = result.rows.length
    ? {
        key: 'paymentPolicy',
        labels: result.rows.map((r) => r.label),
        weights: result.rows.map(() => 1),
        amounts: result.rows.map((r) => r.amountCents),
      }
    : null;

  return { result, visitPlan };
}
