/**
 * Deterministic transaction classification for the Account Balance Explainer.
 *
 * Rules only — no model, no remote call, no guessing from timing or amounts.
 * Critical invariants enforced here and covered by tests:
 *   · a patient credit-card payment is NEVER an insurance payment
 *   · nothing becomes "insurance" by proximity to a procedure
 *   · a $0 insurance-payment row means only "insurance posted $0.00" —
 *     it is classified INSURANCE_PAYMENT, never interpreted as a denial
 */
import type { LedgerClassification } from './types';

export interface ClassificationInput {
  rawDescription: string;
  tooth: string;
  chargeCents: number | null;
  paymentCents: number | null;
}

export interface ClassificationResult {
  classification: LedgerClassification;
  /** 0–1 — how confidently the rules matched. */
  confidence: number;
}

const BALANCE_FORWARD = /\b(balance\s+forward|bal\.?\s*fwd|brought\s+forward)\b/i;

// Insurance FIRST so "Dental Ins Payment - Visa Dental" can never fall
// through to the card-payment rule below.
const INSURANCE_PAYMENT = /\b(dental\s+)?ins(urance)?\.?\s+(payment|pmt|check|ck)\b/i;
const INSURANCE_ADJUSTMENT = /\bwrite[\s-]?off\b|\bcontract\s+adj(ustment)?\b|\bins(urance)?\.?\s+adj(ustment)?\b/i;

const CARD_PAYMENT = /\b(visa|mastercard|amex|discover|disc|mc)\b.*\b(payment|pmt)\b|\b(payment|pmt)\b.*\b(visa|mastercard|amex|discover|disc|mc)\b/i;
const OTHER_PATIENT_PAYMENT = /\b(cash|check|chk|card|credit\s+card|debit|patient|pt|online|ach)\b.*\b(payment|pmt)\b|\b(payment|pmt)\b.*\b(cash|check|chk|card|credit\s+card|debit|patient|pt|online|ach)\b/i;

const COURTESY = /\bcourtesy\b|\bgoodwill\b/i;
const CANCELLATION = /\bcancellation\b|\bcancelled?\s+(appt|appointment)\b|\bbroken\s+app(ointmen)?t\b|\bno[\s-]?show\b|\bmissed\s+app(ointmen)?t\b|\bw\/?out\s+notice\b/i;
const INTERNAL_ADJ = /\bin[\s-]?office\s+provider\s+(prod|payment)\.?\s+adj\b|\bprovider\s+(prod|production|payment)\.?\s+adj(ustment)?\b/i;

/** Vocabulary that marks a charge as dental treatment. */
const TREATMENT_WORDS =
  /\b(exam|evaluation|prophylaxis|cleaning|bitewing|periapical|panoramic|x[\s-]?rays?|image|radiograph|resin|amalgam|filling|crown|core\s+buildup|buildup|extraction|root\s+canal|endodontic|pulp|sealant|fluoride|denture|partial|implant|scaling|debridement|planing|perio|veneer|onlay|inlay|bridge|pontic|abutment|whitening|nightguard|occlusal|composite|porcelain|ceramic)\b/i;

export function classifyTransaction(input: ClassificationInput): ClassificationResult {
  const desc = input.rawDescription.trim();
  const charge = input.chargeCents ?? 0;
  const payment = input.paymentCents ?? 0;

  if (BALANCE_FORWARD.test(desc)) {
    return { classification: 'BALANCE_FORWARD', confidence: 0.95 };
  }

  // Insurance rules run before any payment rule — see module header.
  if (INSURANCE_PAYMENT.test(desc)) {
    return { classification: 'INSURANCE_PAYMENT', confidence: 0.95 };
  }
  if (INSURANCE_ADJUSTMENT.test(desc)) {
    return { classification: 'INSURANCE_CONTRACT_ADJUSTMENT', confidence: 0.95 };
  }

  if (CARD_PAYMENT.test(desc) || OTHER_PATIENT_PAYMENT.test(desc)) {
    return { classification: 'PATIENT_PAYMENT', confidence: 0.95 };
  }

  if (COURTESY.test(desc)) {
    return { classification: 'COURTESY_ADJUSTMENT', confidence: 0.9 };
  }

  if (INTERNAL_ADJ.test(desc)) {
    return { classification: 'INTERNAL_PROVIDER_ADJUSTMENT', confidence: 0.95 };
  }

  if (CANCELLATION.test(desc)) {
    // "NO SHOW" is only a fee when an amount was actually charged;
    // otherwise it is a narrative note.
    if (charge > 0) {
      return { classification: 'CANCELLATION_OR_NO_SHOW_FEE', confidence: 0.9 };
    }
    if (charge === 0 && payment === 0) {
      return { classification: 'ZERO_DOLLAR_EVENT', confidence: 0.85 };
    }
  }

  if (charge > 0) {
    if (TREATMENT_WORDS.test(desc) || input.tooth.trim() !== '') {
      return { classification: 'TREATMENT_CHARGE', confidence: 0.85 };
    }
    // A charge we cannot name is an UNKNOWN monetary transaction —
    // Smart Review will ask, we never guess.
    return { classification: 'UNKNOWN', confidence: 0.3 };
  }

  if (payment !== 0) {
    // Generic "Payment" with no source named: still a payment on the
    // account, but low confidence — staff can reclassify.
    if (/\b(payment|pmt)\b/i.test(desc)) {
      return { classification: 'PATIENT_PAYMENT', confidence: 0.6 };
    }
    if (/\badj(ustment)?\b/i.test(desc)) {
      return { classification: 'UNKNOWN', confidence: 0.3 };
    }
    return { classification: 'UNKNOWN', confidence: 0.3 };
  }

  // No money moved: a narrative row.
  if (desc !== '') {
    return { classification: 'ZERO_DOLLAR_EVENT', confidence: 0.8 };
  }
  return { classification: 'UNKNOWN', confidence: 0.2 };
}
