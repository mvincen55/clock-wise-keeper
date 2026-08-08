/** Deterministic transaction classification — no guessing, no proximity. */
import { describe, it, expect } from 'vitest';
import { classifyTransaction } from '@/lib/account-balance/classify';

const classify = (
  rawDescription: string,
  opts: { tooth?: string; chargeCents?: number | null; paymentCents?: number | null } = {}
) =>
  classifyTransaction({
    rawDescription,
    tooth: opts.tooth ?? '',
    chargeCents: opts.chargeCents ?? null,
    paymentCents: opts.paymentCents ?? null,
  }).classification;

describe('patient payments', () => {
  it('classifies card payments as PATIENT_PAYMENT', () => {
    expect(classify('VISA Payment', { paymentCents: -11900 })).toBe('PATIENT_PAYMENT');
    expect(classify('MC Payment', { paymentCents: -5000 })).toBe('PATIENT_PAYMENT');
    expect(classify('AMEX Payment', { paymentCents: -5000 })).toBe('PATIENT_PAYMENT');
    expect(classify('DISC Payment', { paymentCents: -5000 })).toBe('PATIENT_PAYMENT');
  });

  it('classifies named cash/check payments as PATIENT_PAYMENT', () => {
    expect(classify('Cash Payment - Thank You', { paymentCents: -2000 })).toBe('PATIENT_PAYMENT');
    expect(classify('Check Payment', { paymentCents: -2000 })).toBe('PATIENT_PAYMENT');
  });

  it('a patient card payment is NEVER an insurance payment', () => {
    expect(classify('VISA Payment', { paymentCents: -11900 })).not.toBe('INSURANCE_PAYMENT');
  });

  it('does not become insurance by timing, amount, or proximity — the rule is text-only', () => {
    // Same amount an insurance check might have, still a card payment.
    expect(classify('VISA Payment', { paymentCents: -38555 })).toBe('PATIENT_PAYMENT');
  });
});

describe('insurance rows', () => {
  it('classifies carrier payments as INSURANCE_PAYMENT', () => {
    expect(classify('Dental Ins Payment - Altus', { paymentCents: -8000 })).toBe('INSURANCE_PAYMENT');
    expect(classify('Ins Payment', { paymentCents: -8000 })).toBe('INSURANCE_PAYMENT');
  });

  it('a $0 insurance-payment row stays INSURANCE_PAYMENT — never a denial', () => {
    expect(classify('Dental Ins Payment - Altus', { paymentCents: 0 })).toBe('INSURANCE_PAYMENT');
  });

  it('insurance wins over card words inside the same description', () => {
    expect(classify('Dental Ins Payment - Visa Dental', { paymentCents: -8000 })).toBe(
      'INSURANCE_PAYMENT'
    );
  });

  it('classifies write-offs as INSURANCE_CONTRACT_ADJUSTMENT', () => {
    expect(classify('Altus Write-Off', { paymentCents: -4200 })).toBe('INSURANCE_CONTRACT_ADJUSTMENT');
    expect(classify('Delta Write Off', { paymentCents: -4200 })).toBe('INSURANCE_CONTRACT_ADJUSTMENT');
  });
});

describe('adjustments and fees', () => {
  it('classifies courtesy credits', () => {
    expect(classify('Courtesy Credit', { paymentCents: -7500 })).toBe('COURTESY_ADJUSTMENT');
  });

  it('classifies cancellation and no-show fees when an amount was charged', () => {
    expect(classify('CANCELLATION W/OUT NOTICE', { chargeCents: 7500 })).toBe(
      'CANCELLATION_OR_NO_SHOW_FEE'
    );
    expect(classify('NO SHOW', { chargeCents: 5000 })).toBe('CANCELLATION_OR_NO_SHOW_FEE');
  });

  it('a $0 NO SHOW note is a zero-dollar event, not a fee', () => {
    expect(classify('NO SHOW', { chargeCents: 0, paymentCents: 0 })).toBe('ZERO_DOLLAR_EVENT');
    expect(classify('NO SHOW')).toBe('ZERO_DOLLAR_EVENT');
  });

  it('classifies internal provider adjustments', () => {
    expect(classify('In-Office Provider Prod Adj', { chargeCents: 11900 })).toBe(
      'INTERNAL_PROVIDER_ADJUSTMENT'
    );
    expect(classify('In-Office Provider Payment Adj', { paymentCents: -9770 })).toBe(
      'INTERNAL_PROVIDER_ADJUSTMENT'
    );
  });
});

describe('treatment, narrative, and unknowns', () => {
  it('recognizes treatment charges by dental vocabulary or tooth number', () => {
    expect(classify('Resin-Three surfaces, posterior', { tooth: '29', chargeCents: 39500 })).toBe(
      'TREATMENT_CHARGE'
    );
    expect(classify('Periodic oral evaluation', { chargeCents: 6500 })).toBe('TREATMENT_CHARGE');
    expect(classify('MYSTERY LINE', { tooth: '12', chargeCents: 1000 })).toBe('TREATMENT_CHARGE');
  });

  it('classifies balance forward rows', () => {
    expect(classify('Balance Forward')).toBe('BALANCE_FORWARD');
  });

  it('classifies $0 narrative rows as zero-dollar events', () => {
    expect(classify('PT RESCHEDULED DUE TO OFFICE')).toBe('ZERO_DOLLAR_EVENT');
  });

  it('marks unnameable money as UNKNOWN instead of guessing', () => {
    expect(classify('MISC 1234', { chargeCents: 5000 })).toBe('UNKNOWN');
    expect(classify('ADJ', { paymentCents: -5000 })).toBe('UNKNOWN');
  });
});
