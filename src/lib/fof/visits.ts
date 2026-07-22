import type { Cents } from './types';

/**
 * Visit-based payment plans. The number of payments and their weighting
 * follow the treatment: lab/implant-heavy work is front-loaded (the
 * office's costs land early, and the balance must never run behind the
 * work), crown/bridge work splits in thirds, single-visit treatment is
 * half at scheduling / half at the appointment. Odd cents always land on
 * the FIRST payment for the same reason.
 */

export interface VisitPlan {
  key: string;
  labels: string[];
  weights: number[];
}

/** Split by weights; remainder cents go to the EARLIEST payments. */
export function splitCentsWeighted(total: Cents, weights: number[]): Cents[] {
  if (weights.length === 0) return [];
  const weightSum = weights.reduce((a, b) => a + b, 0);
  if (weightSum <= 0) return weights.map(() => 0);
  const parts = weights.map(w => Math.floor((total * w) / weightSum));
  let remainder = total - parts.reduce((a, b) => a + b, 0);
  for (let i = 0; remainder > 0; i = (i + 1) % parts.length) {
    parts[i] += 1;
    remainder -= 1;
  }
  return parts;
}

export const VISIT_PLANS: Record<string, VisitPlan> = {
  single1: {
    key: 'single1',
    labels: ['Due Upon Scheduling'],
    weights: [1],
  },
  single2: {
    key: 'single2',
    labels: ['Upon Scheduling', 'At Appointment'],
    weights: [1, 1],
  },
  endo2: {
    key: 'endo2',
    labels: ['Upon Scheduling', 'At Treatment'],
    weights: [1, 1],
  },
  surgery2: {
    key: 'surgery2',
    labels: ['Upon Scheduling', 'At Surgery'],
    weights: [1, 1],
  },
  crownBridge3: {
    key: 'crownBridge3',
    labels: ['Upon Scheduling', 'At Prep Appointment', 'On Delivery'],
    weights: [1, 1, 1],
  },
  denture3: {
    key: 'denture3',
    labels: ['Upon Scheduling', 'At Impressions', 'On Delivery'],
    weights: [50, 25, 25],
  },
  implant3: {
    key: 'implant3',
    labels: ['Upon Scheduling', 'At Placement Surgery', 'At Restoration/Delivery'],
    weights: [50, 25, 25],
  },
  frontloaded4: {
    key: 'frontloaded4',
    labels: ['Upon Scheduling', 'At Placement/Prep', 'At Try-In', 'On Delivery'],
    weights: [40, 20, 20, 20],
  },
};

/** Plan used when staff force a specific payment count. */
export function planForCount(count: number): VisitPlan {
  switch (count) {
    case 1:
      return VISIT_PLANS.single1;
    case 2:
      return VISIT_PLANS.single2;
    case 3:
      return VISIT_PLANS.crownBridge3;
    default:
      return VISIT_PLANS.frontloaded4;
  }
}

function codeNumber(code: string): number | null {
  const match = /^D?(\d{4})$/i.exec(code.trim());
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Build the payment plan from the procedures on the form: the heaviest
 * treatment decides the visit structure AND the wording of each payment
 * line. Lab/implant-heavy work is front-loaded (50/25/25) so the balance
 * never runs behind the work.
 *
 * - implants (6000-6199): Scheduling / Placement Surgery / Restoration
 * - dentures & partials (5000-5899): Scheduling / Impressions / Delivery
 * - crowns, inlays/onlays (2500-2999) & bridges (6200-6799): thirds at
 *   Scheduling / Prep / Delivery
 * - perio surgery & grafts (4210-4299) and oral surgery (7000-7999):
 *   half at Scheduling, half At Surgery
 * - endodontics (3000-3999): half at Scheduling, half At Treatment
 * - everything else: half at Scheduling, half At Appointment
 */
export function decideVisitPlan(codes: string[]): VisitPlan {
  const RANK: Record<string, number> = {
    single2: 0, endo2: 1, surgery2: 2, crownBridge3: 3, denture3: 4, implant3: 5,
  };
  let best: VisitPlan = VISIT_PLANS.single2;
  const consider = (plan: VisitPlan) => {
    if (RANK[plan.key] > RANK[best.key]) best = plan;
  };
  for (const code of codes) {
    const n = codeNumber(code);
    if (n === null) continue;
    if (n >= 6000 && n < 6200) consider(VISIT_PLANS.implant3);
    else if (n >= 5000 && n < 5900) consider(VISIT_PLANS.denture3);
    else if ((n >= 2500 && n < 3000) || (n >= 6200 && n < 6800)) consider(VISIT_PLANS.crownBridge3);
    else if ((n >= 4210 && n < 4300) || (n >= 7000 && n < 8000)) consider(VISIT_PLANS.surgery2);
    else if (n >= 3000 && n < 4000) consider(VISIT_PLANS.endo2);
  }
  return best;
}
