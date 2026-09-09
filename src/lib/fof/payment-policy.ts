/** Organization configuration only. Patient inputs to the engine remain in memory. */
import { z } from 'zod';

export const paymentClasses = ['workup', 'implant', 'restoration', 'denture', 'other'] as const;
export type PaymentClass = typeof paymentClasses[number];
export const milestoneKinds = ['booking', 'workup', 'surgery', 'prep', 'impressions', 'tryin', 'delivery', 'treatment'] as const;
export type MilestoneKind = typeof milestoneKinds[number];
const milestone = z.enum(milestoneKinds);
const installment = z.object({ at: z.union([milestone, z.literal('firstImpressionsOrTryin')]), weight: z.number().int().positive().max(10000) }).strict();
const strategy = z.array(installment).min(1).max(100);
const tier = z.object({ below: strategy, above: strategy }).strict();
export const paymentPolicySchema = z.object({
  version: z.literal(1),
  thresholdCents: z.number().int().min(0).max(100000000),
  inclusive: z.boolean(),
  rounding: z.enum(['nearestLast', 'floorLast']),
  mixedThreshold: z.enum(['explicitArrangement', 'separateGroups']),
  implantAdvance: z.boolean(),
  strategies: z.object({ workup: tier, implant: tier, restoration: tier, denture: tier, other: tier }).strict(),
  labels: z.record(milestone, z.string().trim().min(1).max(160)).refine(labels => milestoneKinds.every(kind => !!labels[kind]), 'All milestone labels are required'),
}).strict();
export type PaymentPolicy = z.infer<typeof paymentPolicySchema>;

/** An explicit configuration template, NEVER a runtime fallback or a new-office default. */
export function harelickPolicyTemplate(): PaymentPolicy {
  const one = (at: MilestoneKind) => [{ at, weight: 1 }];
  const halves = (a: MilestoneKind, b: MilestoneKind) => [{ at: a, weight: 1 }, { at: b, weight: 1 }];
  const thirds = (at: MilestoneKind | 'firstImpressionsOrTryin') => [{ at: 'booking' as const, weight: 1 }, { at, weight: 1 }, { at: 'delivery' as const, weight: 1 }];
  return {
    version: 1, thresholdCents: 100000, inclusive: true, rounding: 'nearestLast',
    mixedThreshold: 'explicitArrangement', implantAdvance: true,
    strategies: {
      workup: { below: one('workup'), above: one('workup') },
      implant: { below: halves('booking', 'surgery'), above: halves('booking', 'surgery') },
      restoration: { below: halves('prep', 'delivery'), above: thirds('prep') },
      denture: { below: halves('impressions', 'delivery'), above: thirds('firstImpressionsOrTryin') },
      other: { below: one('treatment'), above: halves('booking', 'treatment') },
    },
    labels: { booking: 'When this phase is scheduled', workup: 'At work-up', surgery: 'At implant surgery', prep: 'At prep / impression', impressions: 'At initial impressions', tryin: 'At try-in', delivery: 'At delivery', treatment: 'At treatment' },
  };
}
