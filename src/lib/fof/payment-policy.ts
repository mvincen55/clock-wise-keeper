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
/** A restoration course that starts with surgery on the same tooth (crown
 * lengthening before a crown) collects at that surgery too. Optional so
 * policies saved before it existed still validate; see restorationSurgeryTier. */
const restorationTier = tier.extend({ withSurgery: tier.optional() }).strict();
export const paymentPolicySchema = z.object({
  version: z.literal(1),
  thresholdCents: z.number().int().min(0).max(100000000),
  inclusive: z.boolean(),
  rounding: z.enum(['nearestLast', 'floorLast']),
  mixedThreshold: z.enum(['explicitArrangement', 'separateGroups']),
  implantAdvance: z.boolean(),
  strategies: z.object({ workup: tier, implant: tier, restoration: restorationTier, denture: tier, other: tier }).strict(),
  labels: z.record(milestone, z.string().trim().min(1).max(160)).refine(labels => milestoneKinds.every(kind => !!labels[kind]), 'All milestone labels are required'),
}).strict();
export type PaymentPolicy = z.infer<typeof paymentPolicySchema>;
export type PaymentTier = z.infer<typeof tier>;

/** Equal parts at each appointment of a surgery-first restoration course:
 * under the threshold, surgery / prep / delivery; at or over it, a scheduling
 * payment first. A policy may override this with strategies.restoration.withSurgery. */
export function restorationSurgeryTier(policy: PaymentPolicy): PaymentTier {
  return policy.strategies.restoration.withSurgery ?? {
    below: [{ at: 'surgery', weight: 1 }, { at: 'prep', weight: 1 }, { at: 'delivery', weight: 1 }],
    above: [{ at: 'booking', weight: 1 }, { at: 'surgery', weight: 1 }, { at: 'prep', weight: 1 }, { at: 'delivery', weight: 1 }],
  };
}

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
      // Surgery-first courses use restorationSurgeryTier's built-in parts unless a policy sets withSurgery.
      restoration: { below: halves('prep', 'delivery'), above: thirds('prep') },
      denture: { below: halves('impressions', 'delivery'), above: thirds('firstImpressionsOrTryin') },
      other: { below: one('treatment'), above: halves('booking', 'treatment') },
    },
    labels: { booking: 'When this phase is scheduled', workup: 'At work-up', surgery: 'At implant surgery', prep: 'At prep / impression', impressions: 'At initial impressions', tryin: 'At try-in', delivery: 'At delivery', treatment: 'At treatment' },
  };
}
