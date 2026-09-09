/**
 * Turn the FOF builder's rows into the engine's procedures.
 *
 * This is the automatic grouping staff then review: appointments come from
 * each row's visit number, related work at the same appointment forms one
 * treatment group (so two crowns prepped together share one threshold), and
 * a zero-fee row attaches to the lab group it seats without adding money.
 *
 * Everything here is memory-only patient-plan shaping — no persistence,
 * no logging, no network.
 */

import { resolveTreatmentClass } from './classify';
import type { PaymentPolicy, PlanProcedure, TreatmentClass } from './types';

export interface PlanLineInput {
  /** Stable id for the builder row. */
  id: string;
  code: string;
  /** This row's own patient responsibility (line-level insurance maths). */
  oopCents: number;
  /** Appointment number the work happens at (1-based). */
  visit: number;
  /** Staff choice on this plan, if any. */
  manualClass?: TreatmentClass | null;
  /** The office's stored classification for the code. */
  configuredClass?: TreatmentClass | null;
  /** Staff moved this row into a specific treatment group. */
  manualGroupId?: string | null;
  /** Explicitly recorded as already paid. */
  alreadyPaid?: boolean;
  label?: string;
}

const DELIVERY_CLASSES: TreatmentClass[] = ['restorative_lab', 'denture_partial'];

export function proceduresFromLines(
  lines: PlanLineInput[],
  policy: PaymentPolicy
): PlanProcedure[] {
  const classified = lines.map((line) => ({
    line,
    treatmentClass: resolveTreatmentClass(line.code, policy, {
      manualClass: line.manualClass,
      configuredClass: line.configuredClass,
      feeCents: line.oopCents,
    }),
    visit: Number.isFinite(line.visit) && line.visit >= 1 ? Math.floor(line.visit) : 1,
  }));

  // Automatic grouping: same payment class + same appointment.
  const groupIdFor = (cls: TreatmentClass, visit: number) => `${cls}@visit-${visit}`;

  const procedures: PlanProcedure[] = [];
  const markers: typeof classified = [];

  for (const item of classified) {
    if (item.treatmentClass === 'zero_fee_marker' || (item.line.oopCents === 0 && item.line.code.trim() !== '' && item.treatmentClass !== 'work_up')) {
      markers.push(item);
      continue;
    }
    procedures.push({
      id: item.line.id,
      code: item.line.code,
      treatmentClass: item.treatmentClass,
      groupId: item.line.manualGroupId || groupIdFor(item.treatmentClass, item.visit),
      oopCents: item.line.oopCents,
      appointmentId: `visit-${item.visit}`,
      appointmentOrder: item.visit,
      alreadyPaid: item.line.alreadyPaid,
      label: item.line.label,
    });
  }

  // A zero-fee row marks the delivery/seat appointment of the latest lab
  // group booked before it. It never creates a payment of its own.
  for (const marker of markers) {
    const target =
      marker.line.manualGroupId ??
      procedures
        .filter(
          (p) =>
            DELIVERY_CLASSES.includes(p.treatmentClass) && p.appointmentOrder < marker.visit
        )
        .sort((a, b) => a.appointmentOrder - b.appointmentOrder)
        .pop()?.groupId;
    if (!target) {
      procedures.push({
        id: marker.line.id,
        code: marker.line.code,
        treatmentClass: 'zero_fee_marker',
        groupId: marker.line.manualGroupId || `marker@visit-${marker.visit}`,
        oopCents: 0,
        appointmentId: `visit-${marker.visit}`,
        appointmentOrder: marker.visit,
        label: marker.line.label,
      });
      continue;
    }
    procedures.push({
      id: marker.line.id,
      code: marker.line.code,
      treatmentClass: 'zero_fee_marker',
      groupId: target,
      oopCents: 0,
      appointmentId: `visit-${marker.visit}`,
      appointmentOrder: marker.visit,
      label: marker.line.label,
    });
  }

  // Lab groups with no explicit zero-fee seat row still deliver at a later
  // appointment: point them at the next appointment on the plan when one
  // exists, otherwise at their own synthetic delivery slot.
  const visits = [...new Set(procedures.map((p) => p.appointmentOrder))].sort((a, b) => a - b);
  return procedures.map((p) => {
    if (!DELIVERY_CLASSES.includes(p.treatmentClass)) return p;
    if (procedures.some((m) => m.groupId === p.groupId && m.treatmentClass === 'zero_fee_marker')) {
      return p;
    }
    const next = visits.find((v) => v > p.appointmentOrder);
    return next
      ? { ...p, deliveryAppointmentId: `visit-${next}`, deliveryAppointmentOrder: next }
      : {
          ...p,
          deliveryAppointmentId: `${p.groupId}::delivery`,
          deliveryAppointmentOrder: p.appointmentOrder + 0.25,
        };
  });
}
