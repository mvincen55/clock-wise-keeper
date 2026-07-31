/**
 * Privacy detection — the gate before any schedule analysis.
 *
 * Scans OCR output for likely patient-identifying content. If anything is
 * found, processing stops: nothing is saved, the frame is destroyed, and the
 * user is asked to enable the PMS privacy view and retry. There is no
 * "redact and continue" path — nothing leaves the device either way, and the
 * detector reports only violation KINDS and COUNTS, never the matched text.
 *
 * Known employee/provider names are allowed (they are needed for column
 * mapping) but they stay local like everything else.
 */
import type { OcrWord, PrivacyCheckResult, PrivacyViolationKind } from './types';

const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/;
const DOB = /\b(?:dob|d\.o\.b|birth|born)\b|(?:\b(?:19|20)\d{2}[/-]\d{1,2}[/-]\d{1,2}\b)|(?:\b\d{1,2}[/-]\d{1,2}[/-](?:19|20)\d{2}\b)/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const ACCOUNT_NUMBER = /\b(?:acct|account|chart|mrn|member|id)\s*#?\s*:?\s*\d{4,}\b|\b\d{7,}\b/i;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const INSURANCE = /\b(?:policy|group|subscriber|insur\w*|carrier)\b\s*#?\s*:?\s*[A-Za-z0-9-]{5,}/i;
const STREET_ADDRESS = /\b\d{1,5}\s+[A-Za-z]+\s+(?:st|street|ave|avenue|rd|road|blvd|lane|ln|dr|drive|ct|court|way)\b\.?/i;
const CLINICAL_WORDS =
  /\b(?:diagnos\w*|abscess|lesion|biopsy|pathology|medicated|prescri\w*|rx|allerg\w*|premed\w*|anxiet\w*|sedat\w*|pregnan\w*|hiv|diabet\w*)\b/i;

/** "Sm., John" / "John S." / "Doe, Jane" — a name-shaped token pair. */
const NAME_PAIR = /\b[A-Z][a-z]{1,}\s*,\s*[A-Z][a-z]+\b|\b[A-Z][a-z]{2,}\s+[A-Z]\.(?!\w)/;
/** Bare paired initials like "J.D." near other data. */
const PAIRED_INITIALS = /\b[A-Z]\.\s?[A-Z]\.(?!\w)/;

/** Words per line beyond which a note reads as free-text narrative. */
const LONG_NOTE_WORDS = 14;

export interface KnownNames {
  /** Lowercased tokens of employee/provider names — allowed for column mapping. */
  tokens: Set<string>;
}

export function buildKnownNames(names: string[]): KnownNames {
  const tokens = new Set<string>();
  for (const name of names) {
    for (const part of name.split(/\s+/)) {
      const t = part.trim().toLowerCase().replace(/[^a-z'-]/g, '');
      if (t.length > 1) tokens.add(t);
    }
  }
  return { tokens };
}

/** True when every capitalized token in the text is a known staff name. */
function coveredByKnownNames(text: string, known: KnownNames): boolean {
  const caps: string[] = text.match(/[A-Z][a-z]+/g) ?? [];
  if (caps.length === 0) return false;
  return caps.every(c => known.tokens.has(c.toLowerCase()));
}

interface LineIn {
  text: string;
  words: OcrWord[];
}

export function groupWordsIntoLines(words: OcrWord[]): LineIn[] {
  // Cluster by vertical midpoint: words whose centers sit within half a
  // word-height of each other read as one line.
  const sorted = [...words].sort(
    (a, b) => (a.bbox.y0 + a.bbox.y1) / 2 - (b.bbox.y0 + b.bbox.y1) / 2
  );
  const lines: Array<{ mid: number; height: number; words: OcrWord[] }> = [];
  for (const w of sorted) {
    const mid = (w.bbox.y0 + w.bbox.y1) / 2;
    const height = w.bbox.y1 - w.bbox.y0;
    const line = lines.find(l => Math.abs(l.mid - mid) < Math.max(l.height, height) * 0.6);
    if (line) {
      line.words.push(w);
      line.mid = (line.mid * (line.words.length - 1) + mid) / line.words.length;
    } else {
      lines.push({ mid, height, words: [w] });
    }
  }
  return lines.map(l => ({
    words: l.words.sort((a, b) => a.bbox.x0 - b.bbox.x0),
    text: l.words
      .sort((a, b) => a.bbox.x0 - b.bbox.x0)
      .map(w => w.text)
      .join(' ')
      .trim(),
  }));
}

/**
 * Run the privacy check over OCR output. Returns kinds + counts only.
 */
export function checkPrivacy(words: OcrWord[], known: KnownNames): PrivacyCheckResult {
  const counts = new Map<PrivacyViolationKind, number>();
  const hit = (kind: PrivacyViolationKind) => counts.set(kind, (counts.get(kind) ?? 0) + 1);

  const lines = groupWordsIntoLines(words);

  for (const line of lines) {
    const text = line.text;
    if (text.length === 0) continue;

    if (SSN.test(text)) hit('account_number');
    if (PHONE.test(text)) hit('phone_number');
    if (EMAIL.test(text)) hit('email_address');
    if (DOB.test(text)) hit('date_of_birth');
    if (INSURANCE.test(text)) hit('insurance_identifier');
    else if (ACCOUNT_NUMBER.test(text)) hit('account_number');
    if (STREET_ADDRESS.test(text)) hit('street_address');
    if (CLINICAL_WORDS.test(text)) hit('clinical_narrative');

    if (NAME_PAIR.test(text) && !coveredByKnownNames(text, known)) hit('full_name');

    // Initials only count when the line also carries other data — bare
    // initials alone are how many privacy views label appointments.
    if (PAIRED_INITIALS.test(text) && /\d/.test(text)) hit('initials_with_context');

    const wordCount = text.split(/\s+/).length;
    if (wordCount > LONG_NOTE_WORDS) hit('long_free_text');
  }

  const violations = [...counts.entries()].map(([kind, count]) => ({ kind, count }));
  return { passed: violations.length === 0, violations };
}
