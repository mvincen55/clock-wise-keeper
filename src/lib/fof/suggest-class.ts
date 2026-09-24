import type { PaymentClass } from './payment-policy';

/**
 * Payment classification for a code the office registry has not classified,
 * derived from the CDT code range. Standard D codes use it automatically so a
 * form never stalls on a routine code; custom office codes get it only as a
 * one-click suggestion, and a saved office classification always wins.
 */
export function suggestPaymentClass(code: string): PaymentClass {
  const match = /^D(\d{4})$/i.exec(code.trim());
  if (!match) return 'other';
  const n = Number(match[1]);
  if (n === 6190 || n === 5982) return 'workup';
  if (n < 1000) return 'workup';
  if (n >= 2500 && n < 3000) return 'restoration';
  if (n >= 5000 && n < 5900) return 'denture';
  if (n >= 6010 && n < 6055) return 'implant';
  if ((n >= 6055 && n < 6200) || (n >= 6200 && n < 6800)) return 'restoration';
  return 'other';
}
