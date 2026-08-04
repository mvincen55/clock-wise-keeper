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

/**
 * Ledger letter codes — the ladder is driven by the highest code already
 * posted within the history window, so the paper trail the policy mandates
 * is also the progression driver. Higher number = further up the ladder.
 * (They replace draft codes 9101A/9101B/9100A/9106/9107 1:1 in that order;
 * no letters were ever issued under the old codes.)
 */
export type BaLetterCode = '0001' | '0002' | '0003' | '0004' | '0005';

/**
 * The card-state axis (rungs 2–5). The card is only ever charged after a
 * prior Pop-Up promised it — first offenses are posted, never charged.
 * `cardOnFile` is null until the wizard asks; `chargeSucceeded` is only
 * asked at rungs 3–5 when a card is on file.
 */
export interface BaCardState {
  cardOnFile: boolean | null;
  chargeSucceeded: boolean | null;
}

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
  /**
   * ISO date the current policy took effect ('' = unset). Broken
   * appointments before it never count toward the ladder — they only set
   * the entry point (first post-policy break lands at Rung 2).
   */
  policyEffectiveDate: string;
  /** Per-office wording for the nav entry and page heading. */
  moduleNavLabel: string;
  /** Letter closing; blank name falls back to the practice name. */
  signatureName: string;
  signatureTitle: string;
}

/**
 * A letter, text-reply, or card-state snippet template ({{merge_field}}
 * placeholders only). Snippets are the org-editable sentences the card
 * state swaps into letters (txn_charged / txn_posted /
 * txn_posted_card_failed / card_needed / card_have).
 */
export interface BaTemplate {
  id: string;
  kind: 'letter' | 'reply' | 'snippet';
  /** letter: 0001–0005 · reply: on_time, rung1…rung5, ns_outreach · snippet: txn_*, card_* */
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
