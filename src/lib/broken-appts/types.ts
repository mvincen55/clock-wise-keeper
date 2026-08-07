/**
 * Broken Appointments — shared types.
 *
 * HIPAA boundary (same contract as src/lib/fof/types.ts): BaPatientFields,
 * BaCanceledAppt, and every wizard value derived from them describe patient
 * data that exists ONLY in browser memory and on the printed page. Nothing
 * in this module (or anything importing these types) may send those values
 * to Supabase, storage APIs, URLs, analytics, or logs. Templates, rung
 * parameters, and office settings are de-identified configuration and are
 * the only Broken Appointments data persisted server-side.
 */

/** Rule 3: retrievable timestamped message = late cancel; otherwise no-show. */
export type BrokenApptType = 'LC' | 'NS';

export type Rung = 1 | 2 | 3 | 4 | 5;

/** Org-configurable module settings (broken_appt_settings row). */
export interface BaSettings {
  feeAmount: number;
  noticeBusinessHours: number;
  historyWindowYears: number;
  vipPrepayFloor: number;
  /** Blank = fall back to org_branding.phone. */
  officePhone: string;
  /** ISO dates excluded from business-hour math, in addition to weekends. */
  officeClosedDates: string[];
  /** Per-office wording for the nav entry and page heading. */
  moduleNavLabel: string;
  /** Letter closing; blank name falls back to the practice name. */
  signatureName: string;
  signatureTitle: string;
}

/** A letter or text-reply template ({{merge_field}} placeholders only). */
export interface BaTemplate {
  id: string;
  kind: 'letter' | 'reply';
  /** letter: 9101A / 9100A / 9106 / 9107 · reply: on_time, rung1, rung3, rung4, rung5, ns_outreach */
  code: string;
  title: string;
  body: string;
  sortOrder: number;
}

/** Patient-entered fields. Memory-only — never persisted or transmitted. */
export interface BaPatientFields {
  firstName: string;
  lastName: string;
  addressLine1: string;
  /** Apt/Unit/Suite line; blank disappears from the printed block entirely. */
  addressLine2: string;
  city: string;
  state: string;
  zip: string;
  /** The broken appointment's date (ISO YYYY-MM-DD). */
  apptDateISO: string;
}

/** A canceled future appointment (Rung 4 letter table row). Memory-only. */
export interface BaCanceledAppt {
  date: string;
  time: string;
  provider: string;
  visitType: string;
}
