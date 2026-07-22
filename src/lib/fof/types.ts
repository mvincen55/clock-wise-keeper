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
  footnotes: string[];
  signatureIntro: string;
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
  overridden: {
    patientPortion: boolean;
    discount: boolean;
    prepayTotal: boolean;
    installments: boolean[];
  };
}
