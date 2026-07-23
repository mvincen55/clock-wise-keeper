/**
 * Financial Options Form (FOF) — shared types.
 *
 * HIPAA boundary: FofPatientFields / FofAmounts / FofOverrides describe
 * patient data that exists ONLY in browser memory. Nothing in this module
 * (or anything importing these types) may send those values to Supabase,
 * storage, URLs, or logs. Templates and practice info are de-identified
 * configuration and are the only FOF data persisted server-side.
 */

export type Cents = number;

export interface FofPracticeInfo {
  practiceName: string;
  addressLine1: string;
  addressLine2: string;
  phone: string;
  website: string;
}

export interface FofTemplate {
  id: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  discountPercent: number;
  discountLabel: string;
  showInsuranceEstimate: boolean;
  showWriteOff: boolean;
  showPrepayOption: boolean;
  showInstallmentOption: boolean;
  installmentCount: number;
  installmentLabels: string[];
  /**
   * Footnote slots with fixed asterisk markers on the printed form:
   * validity ↔ Total Cost (*), prepay ↔ discount rows (**),
   * insurance ↔ insurance rows (***). contactNote and extraNotes print
   * unmarked. Empty string = omitted (and its marker disappears).
   */
  validityNote: string;
  prepayNote: string;
  insuranceNote: string;
  contactNote: string;
  /** Additional unmarked footnote paragraphs. */
  footnotes: string[];
  signatureIntro: string;
  /** >0 = membership template: this % comes off automatically (Illumitrac). */
  membershipDiscountPercent: number;
  /** Whether the 65+ discount rules apply to this template. */
  seniorDiscountApplies: boolean;
}

/** Patient-entered fields. Memory-only — never persisted. */
export interface FofPatientFields {
  patientName: string;
  dateISO: string;
  treatment: string;
}

/** Patient-specific dollar amounts in integer cents. Memory-only — never persisted. */
export interface FofAmounts {
  totalCents: Cents | null;
  insuranceEstimateCents: Cents | null;
  writeOffCents: Cents | null;
  /** Discretionary flat discount; printed only when non-zero. */
  officeDiscountCents?: Cents | null;
  /** What the discount is for; blank prints as plain "Office Discount". */
  officeDiscountLabel?: string;
  /** Existing credit on the patient's account; printed only when non-zero. */
  patientCreditCents?: Cents | null;
  /** Rule-derived discount (membership/senior); printed only when non-zero. */
  autoDiscount?: { label: string; cents: Cents } | null;
  /**
   * Base for the prepay discount percentage. Normally omitted (percent of
   * the remaining portion); the Illumitrac senior +5% passes the
   * pre-discount total here so 10% + 5% equals a true 15% of the same base.
   */
  prepayDiscountBaseCents?: Cents | null;
}

/** Manual overrides of computed values. Memory-only — never persisted. */
export interface FofOverrides {
  patientPortionCents?: Cents;
  discountCents?: Cents;
  prepayTotalCents?: Cents;
  installmentsCents?: (Cents | undefined)[];
}

export interface FofComputedValues {
  patientPortionCents: Cents;
  discountCents: Cents;
  prepayTotalCents: Cents;
  installmentsCents: Cents[];
}

export interface FofComputation {
  computed: FofComputedValues;
  effective: FofComputedValues;
  /** Labels for the installment rows actually computed (visit plan aware). */
  installmentLabels: string[];
  overridden: {
    patientPortion: boolean;
    discount: boolean;
    prepayTotal: boolean;
    installments: boolean[];
  };
}
