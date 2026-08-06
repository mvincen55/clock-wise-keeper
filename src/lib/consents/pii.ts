/**
 * Patient-identifier scanner for outgoing AI text.
 *
 * The Forms & Consents AI works on TEMPLATE wording only — if someone pastes
 * a filled form (or a section typed for a specific patient) into the builder,
 * this catches the obvious identifiers before the text leaves the browser.
 * The AI panel BLOCKS the request on any hit and shows the excerpts.
 *
 * Deliberately conservative: template forms are full of words like
 * "Patient Name: ____", "Date of Birth", and signature-role labels, so every
 * pattern requires actual data (digits, a real name) next to the label.
 * A miss here still gets scrubbed server-side (scrubMessages); a false
 * positive would block managers from editing their own wording.
 */

export interface PiiHit {
  kind: 'dob' | 'chart_number' | 'ssn' | 'patient_phone' | 'patient_name';
  excerpt: string;
}

const EXCERPT_MAX = 70;

const excerptOf = (text: string): string =>
  text.trim().length > EXCERPT_MAX ? `${text.trim().slice(0, EXCERPT_MAX)}…` : text.trim();

const digitsOf = (text: string): string => text.replace(/\D/g, '');

/** True when the allow list (office branding strings) covers this match. */
function allowed(match: string, allow: string[]): boolean {
  const lower = match.trim().toLowerCase();
  const digits = digitsOf(match);
  // "Mrs. Hartwell" is the office's own doctor when branding says
  // "Hartwell Dental" — compare the bare name too, not just the full match.
  const bareName = lower.replace(/^(?:mr|mrs|ms|dr)\.\s+/, '');
  return allow.some(entry => {
    const entryLower = entry.trim().toLowerCase();
    if (!entryLower) return false;
    if (entryLower.includes(lower) || lower.includes(entryLower)) return true;
    if (bareName !== lower && bareName.length >= 3 && entryLower.includes(bareName)) return true;
    // Phone formats vary — compare digits when the match carries a number.
    const entryDigits = digitsOf(entry);
    return digits.length >= 7 && entryDigits.length >= 7 && entryDigits.includes(digits);
  });
}

const DATE = String.raw`\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}`;

// A date explicitly labeled as a birth date. Labels without digits
// ("DOB: ____") never match — the date itself is required.
const DOB_LABELED = new RegExp(
  String.raw`(?:\bDOB\b|date\s+of\s+birth|\bborn\b)[:\s]*(?:on\s+)?${DATE}`,
  'gi',
);
// A full MM/DD/YYYY within a few words of "birth" (either side).
const DOB_NEARBY = new RegExp(
  String.raw`(?:birth[^\n]{0,30}?(${DATE})|(${DATE})[^\n]{0,30}?birth)`,
  'gi',
);

// Chart/record/account numbers: the label plus real digits.
const CHART = /\b(?:chart|record|account|acct)\s*(?:#|no\.?|number)?\s*[:#]?\s*\d{3,}/gi;

const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

// A phone number attributed to the patient (the office's own phone is
// excluded via the allow list; unlabeled phones are template letterhead).
const PATIENT_PHONE = /\bpatient(?:'s)?[^.\n]{0,40}?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/gi;

// An honorific followed by an actual capitalized name. "Mr./Mrs./Ms." alone
// (a signature-line label) has no name after it and never matches.
const HONORIFIC_NAME = /\b(?:Mr|Mrs|Ms)\.\s+[A-Z][a-z]{2,}\b/g;

function collect(
  text: string,
  regex: RegExp,
  kind: PiiHit['kind'],
  allow: string[],
  hits: PiiHit[],
): void {
  for (const match of text.matchAll(regex)) {
    const value = match[0];
    if (allowed(value, allow)) continue;
    const excerpt = excerptOf(value);
    const digits = digitsOf(value);
    // The labeled and proximity patterns can both hit one DOB — report once.
    const duplicate = hits.some(
      h =>
        h.kind === kind &&
        (h.excerpt === excerpt || (digits.length >= 6 && digitsOf(h.excerpt).includes(digits))),
    );
    if (!duplicate) hits.push({ kind, excerpt });
  }
}

/**
 * Scan text bound for the AI for patient identifiers.
 * `allow` carries the office's own branding strings (name, phone, address)
 * so a consent form that names the practice is never flagged.
 */
export function scanForPatientIdentifiers(
  text: string,
  allow: string[] = [],
): { hits: PiiHit[] } {
  const hits: PiiHit[] = [];
  if (!text.trim()) return { hits };

  collect(text, DOB_LABELED, 'dob', allow, hits);
  collect(text, DOB_NEARBY, 'dob', allow, hits);
  collect(text, CHART, 'chart_number', allow, hits);
  collect(text, SSN, 'ssn', allow, hits);
  collect(text, PATIENT_PHONE, 'patient_phone', allow, hits);
  collect(text, HONORIFIC_NAME, 'patient_name', allow, hits);

  return { hits };
}

export const PII_KIND_LABELS: Record<PiiHit['kind'], string> = {
  dob: 'Date of birth',
  chart_number: 'Chart or record number',
  ssn: 'Social Security number',
  patient_phone: 'Patient phone number',
  patient_name: 'Patient name',
};
