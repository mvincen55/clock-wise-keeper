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

/** Portions under this default to a single day-of-service payment. */
export const DAY_OF_SERVICE_THRESHOLD_CENTS = 100_000;

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
  dayOfService: {
    key: 'dayOfService',
    labels: ['Due at Time of Service'],
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
  // Only D-prefixed codes are real CDT; bare numbers are custom office codes.
  const match = /^D(\d{4})$/i.exec(code.trim());
  return match ? parseInt(match[1], 10) : null;
}

export interface VisitSegment {
  stage: number;
  label: string;
  share: number;
}

/**
 * How a procedure's work (and fee) spreads across visits. Lab-made
 * restorations span two visits — crowns/bridges Prep + Delivery, dentures
 * Impressions + Delivery, implant restorations Impression + Delivery —
 * with build-ups/posts counted at the prep visit where they happen.
 * Everything else is a single visit at its suggested stage.
 */
export function visitSegmentsForCode(code: string): VisitSegment[] {
  const n = codeNumber(code);
  if (n === null) return [{ stage: 1, label: '', share: 1 }];
  if (n >= 2950 && n <= 2957) return [{ stage: 3, label: 'Prep', share: 1 }];
  if ((n >= 2500 && n < 3000) || (n >= 6200 && n < 6800)) {
    return [
      { stage: 3, label: 'Prep', share: 0.5 },
      { stage: 4, label: 'Delivery', share: 0.5 },
    ];
  }
  if (n >= 6055 && n < 6190) {
    return [
      { stage: 3, label: 'Impression', share: 0.5 },
      { stage: 4, label: 'Delivery', share: 0.5 },
    ];
  }
  if (n >= 5000 && n < 5900) {
    return [
      { stage: 3, label: 'Impressions', share: 0.5 },
      { stage: 4, label: 'Delivery', share: 0.5 },
    ];
  }
  return [{ stage: suggestVisitStage(code), label: '', share: 1 }];
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
/**
 * Suggested treatment stage for a code (staff can override per line):
 * 1 = surgery/extraction/graft (and anything single-visit),
 * 2 = implant placement / endo, 3 = restoration & prosthetics.
 * Stages present on a form compress to consecutive visit numbers.
 */
export function suggestVisitStage(code: string): number {
  const n = codeNumber(code);
  if (n === null) return 1;
  if ((n >= 7000 && n < 8000) || (n >= 4210 && n < 4300)) return 1;
  // Implant placement/second-stage (6010-6054), surgical guides
  // (6190-6199), and endo happen mid-sequence; implant restorative
  // components (6055-6189: abutments, implant crowns) are final-stage.
  if ((n >= 6000 && n < 6055) || (n >= 6190 && n < 6200) || (n >= 3000 && n < 4000)) return 2;
  if ((n >= 2500 && n < 3000) || (n >= 5000 && n < 5900) || (n >= 6055 && n < 6800)) return 3;
  return 1;
}

/**
 * Build the payment schedule from actual per-visit work, a FULL visit
 * ahead: Upon Scheduling collects Visit 1, and each visit start collects
 * the next visit — so the patient walks into every visit with that day's
 * work already paid and never carries a balance. The patient portion is
 * allocated across visits proportionally to each visit's fees; the
 * schedule always sums exactly to the portion.
 *
 * A visit's `dueAtVisitCents` marks fees that are billed AT that visit
 * with no prepay (e.g. the surgical guide D5982) — they're excluded from
 * the ahead-shifting and added flat to that visit's payment. Slots with
 * nothing due (typically the final visit) drop off the schedule.
 */
export function buildVisitSchedule(
  portionCents: Cents,
  allVisits: { label: string; feeCents: Cents; dueAtVisitCents?: Cents }[]
): VisitPlan | null {
  // Zero-fee visits (e.g. a no-charge seat appointment) create no payment.
  const visits = allVisits.filter(v => v.feeCents > 0);
  if (visits.length === 0) return null;
  const weights = visits.map(v => v.feeCents);
  const alloc = splitCentsWeighted(portionCents, weights);
  const n = alloc.length;
  // Split each visit's allocation into the ahead-eligible part and the
  // due-at-visit part (scaled with the allocation).
  const dueAt = visits.map((v, i) => {
    const dueFee = Math.min(Math.max(0, v.dueAtVisitCents ?? 0), v.feeCents);
    return Math.min(alloc[i], Math.round((alloc[i] * dueFee) / v.feeCents));
  });
  const ahead = alloc.map((a, i) => a - dueAt[i]);

  const payments: Cents[] = [ahead[0]];
  for (let i = 0; i < n; i++) {
    payments.push(dueAt[i] + (i + 1 < n ? ahead[i + 1] : 0));
  }

  const labels = [
    'Upon Scheduling',
    ...visits.map((v, i) =>
      n === 1
        ? `At Appointment${v.label ? ` · ${v.label}` : ''}`
        : `At Visit ${i + 1}${v.label ? ` · ${v.label}` : ''}`
    ),
  ];
  // Drop empty slots (usually the final visit — everything was prepaid).
  const slots = payments
    .map((p, i) => ({ p, label: labels[i] }))
    .filter(s => s.p > 0);
  if (slots.length > 0 && slots.length < payments.length) {
    return { key: 'visitSchedule', labels: slots.map(s => s.label), weights: slots.map(s => s.p) };
  }
  return { key: 'visitSchedule', labels, weights: payments };
}

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
