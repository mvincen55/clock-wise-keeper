import { scrubFreeText } from './phi-scrub.ts';

/** Defense in depth, not a de-identification certification. No raw values in errors. */
export function fofTextNeedsReview(value: string): boolean {
  return scrubFreeText(value, value.length).redacted ||
    /\b(?:member|subscriber|policy|account|claim)\s*(?:id|number|no\.?|#)\s*[:#-]?\s*[a-z0-9-]{3,}/i.test(value) ||
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(value);
}

export function fofTrainingWriteAllowed(role: string, trainingEnabled: unknown): boolean {
  return (role === 'owner' || role === 'manager') && trainingEnabled === true;
}

export function fofRuleNeedsReview(value: string): boolean {
  return fofTextNeedsReview(value) ||
    /\b(?:this|current|our)\s+(?:patient|case|form)\b|\b(?:patient|pt)\s+(?:owes|paid|has|needs)\b|\b(?:tooth|teeth)\s*#?\s*\d/i.test(value);
}

// The practice has confirmed there is no BAA for the AI service. Do not
// enable patient-form transmission via a client flag or a Training toggle.
export const FOF_PATIENT_CONTEXT_ENABLED = false;
