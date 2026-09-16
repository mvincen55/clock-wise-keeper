import type { PaymentClass } from './payment-policy';

/**
 * A starting payment classification for a code the office registry has not
 * classified yet, derived from the CDT code range only. It is a suggestion
 * staff confirm with one click on the form; it never applies silently, so
 * collection timing stays an explicit office decision.
 */
export function suggestPaymentClass(code: string): PaymentClass {
  const match = /^D(\d{4})$/i.exec(code.trim());
  if (!match) return 'other';
  const n = Number(match[1]);
  if (n < 1000) return 'workup';
  if (n >= 2500 && n < 3000) return 'restoration';
  if (n >= 5000 && n < 5900) return 'denture';
  if (n >= 6010 && n < 6055) return 'implant';
  if ((n >= 6055 && n < 6200) || (n >= 6200 && n < 6800)) return 'restoration';
  return 'other';
}
