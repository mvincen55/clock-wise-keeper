/**
 * Payment classification of a procedure code.
 *
 * This is a SUGGESTION layer only. Order of authority:
 *   1. the staff member's per-plan choice on the builder row,
 *   2. the organization's stored classification (`procedure_meta`),
 *   3. the organization's work-up code list on `fof_settings`,
 *   4. the CDT-range suggestion below.
 *
 * The suggestion never overrides office configuration, and it is completely
 * independent of the insurance category on the same line.
 */

import type { PaymentPolicy, TreatmentClass } from './types';

function codeNumber(code: string): number | null {
  const match = /^D(\d{4})$/i.exec(code.trim());
  return match ? parseInt(match[1], 10) : null;
}

/** CDT-range suggestion used when nothing is configured for the code. */
export function suggestTreatmentClass(code: string): TreatmentClass {
  const n = codeNumber(code);
  if (n === null) return 'other_no_delivery';
  // Diagnostic imaging and diagnostic models read as work-up.
  if (n >= 300 && n < 400) return 'work_up';
  if (n === 470) return 'work_up';
  // Implant placement, second-stage surgery and surgical guides.
  if ((n >= 6000 && n < 6055) || (n >= 6190 && n < 6200)) return 'implant_surgical';
  // Implant abutments/crowns and fixed bridge work.
  if (n >= 6055 && n < 6800) return 'restorative_lab';
  // Crowns, inlays/onlays, veneers.
  if (n >= 2500 && n < 3000) return 'restorative_lab';
  // Complete/partial dentures.
  if (n >= 5000 && n < 5900) return 'denture_partial';
  return 'other_no_delivery';
}

export interface ClassifyOptions {
  /** Per-plan staff choice for this line. */
  manualClass?: TreatmentClass | null;
  /** Organization's stored classification for the code (`procedure_meta`). */
  configuredClass?: TreatmentClass | null;
  /** Zero-fee delivery markers identify a milestone without adding money. */
  feeCents?: number;
}

export function resolveTreatmentClass(
  code: string,
  policy: PaymentPolicy,
  options: ClassifyOptions = {}
): TreatmentClass {
  if (options.manualClass) return options.manualClass;
  if (options.configuredClass) return options.configuredClass;
  const upper = code.trim().toUpperCase();
  if (upper !== '' && policy.workUpCodes.includes(upper)) return 'work_up';
  return suggestTreatmentClass(code);
}
