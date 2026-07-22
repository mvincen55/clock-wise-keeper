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
    labels: ['Due upon scheduling'],
    weights: [1],
  },
  single2: {
    key: 'single2',
    labels: ['Due upon scheduling', 'Due at appointment'],
    weights: [1, 1],
  },
  even3: {
    key: 'even3',
    labels: ['Visit 1 (Upon scheduling)', 'Visit 2 (Prep date)', 'Visit 3 (On delivery)'],
    weights: [1, 1, 1],
  },
  frontloaded3: {
    key: 'frontloaded3',
    labels: ['Visit 1 (Upon scheduling)', 'Visit 2 (Placement/Prep)', 'Visit 3 (On delivery)'],
    weights: [50, 25, 25],
  },
  frontloaded4: {
    key: 'frontloaded4',
    labels: [
      'Visit 1 (Upon scheduling)',
      'Visit 2 (Placement/Prep)',
      'Visit 3 (Try-in)',
      'Visit 4 (On delivery)',
    ],
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
      return VISIT_PLANS.even3;
    default:
      return VISIT_PLANS.frontloaded4;
  }
}

function codeNumber(code: string): number | null {
  const match = /^D?(\d{4})$/i.exec(code.trim());
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Pick the payment plan from the procedures on the form:
 * - implants (6000-6199) or dentures/partials (5000-5899): front-loaded 3
 * - crowns/inlays/onlays (2500-2999) or bridges (6200-6799): even thirds
 * - anything else: half at scheduling, half at the appointment
 * The heaviest treatment on the form wins.
 */
export function decideVisitPlan(codes: string[]): VisitPlan {
  let best = 0; // 0 = single2, 1 = even3, 2 = frontloaded3
  for (const code of codes) {
    const n = codeNumber(code);
    if (n === null) continue;
    if ((n >= 6000 && n < 6200) || (n >= 5000 && n < 5900)) best = Math.max(best, 2);
    else if ((n >= 2500 && n < 3000) || (n >= 6200 && n < 6800)) best = Math.max(best, 1);
  }
  return best === 2 ? VISIT_PLANS.frontloaded3 : best === 1 ? VISIT_PLANS.even3 : VISIT_PLANS.single2;
}
