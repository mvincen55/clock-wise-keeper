// phi-scrub — the last gate before staff free text reaches the AI gateway.
//
// The gateway has no BAA. The office rule is absolute: "No patient data. Ever.
// Not in tables, not in checklist titles, not in AI prompts." Convention and a
// UI reminder are mitigations; this file is the enforcement.
//
// What it strips: anything person-level. Full names ("Jane Doe", "Mr. Doe"),
// phone numbers, emails, SSNs, dates of birth, and chart/MRN-style identifiers.
// What it deliberately keeps: first names on their own — the office speaks to
// its own people by first name, and that is not patient data.

export type ScrubResult = {
  /** The text safe to send onward, with person-level spans replaced. */
  text: string;
  /** True when anything was replaced — the caller may choose to refuse. */
  redacted: boolean;
  /** Coarse labels of what was hit, for logging without logging the value. */
  hits: string[];
};

const TITLE_NAME = /\b(?:Mr|Mrs|Ms|Miss|Mx|Dr)\.?\s+[A-Z][a-z'’-]{1,20}(?:\s+[A-Z][a-z'’-]{1,20})?/g;
// Two to four capitalised words in a row. The extra reach matters: it lets a
// sentence-opening word ("Call Sarah Whitman") be peeled off in passNames
// while the actual name behind it is still caught.
const FULL_NAME = /\b[A-Z][a-z'’-]{1,20}(?:\s+[A-Z][a-z'’-]{1,20}){1,3}(?:\s+(?:Jr|Sr|II|III)\.?)?\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PHONE = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const DOB = /\b(?:dob|d\.o\.b\.?|born)\b[:\s]*[\d/.-]{6,10}/gi;
const CHART = /\b(?:mrn|chart|patient|pt)\s*#?\s*\d{3,}/gi;

/**
 * Ordinary words that get capitalised at the start of a sentence and would
 * otherwise be read as the first half of a name ("Call Sarah", "Ask Megan").
 * A leading word from this list is peeled off before the name test runs.
 */
const SENTENCE_WORDS = new Set([
  "call", "ask", "tell", "email", "text", "remind", "check", "confirm", "send",
  "see", "let", "have", "get", "give", "help", "meet", "follow", "thank",
  "the", "a", "an", "and", "but", "if", "when", "while", "with", "for", "to",
  "i", "we", "they", "he", "she", "it", "this", "that", "today", "tomorrow",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "morning", "afternoon", "goal", "sprint", "team", "office", "new", "next",
  "add", "make", "write", "review", "update", "finish", "start", "keep",
]);

/**
 * Phrases that look like a full name but are ordinary office vocabulary. Kept
 * so routine goals and checklist titles don't get pointlessly mangled.
 */
const ALLOW = new Set([
  "front desk", "team meeting", "morning huddle", "day sheet", "treatment plan",
  "purple envelope", "office copy", "bank copy", "new patient", "hygiene recall",
  "insurance verification", "training library", "office ai", "team sprint",
]);

/** Strip person-level spans out of one free-text string. */
export function scrubFreeText(input: unknown, max = 4000): ScrubResult {
  const raw = typeof input === "string" ? input.slice(0, max) : "";
  if (!raw) return { text: "", redacted: false, hits: [] };

  const hits: string[] = [];
  let out = raw;

  const pass = (re: RegExp, label: string, replacement: string) => {
    out = out.replace(re, (match) => {
      if (ALLOW.has(match.toLowerCase().trim())) return match;
      if (!hits.includes(label)) hits.push(label);
      return replacement;
    });
  };

  /**
   * The full-name pass, which needs more care than a flat replace: a sentence
   * that opens with a capitalised ordinary word ("Call Sarah") must keep that
   * word and, if only a lone first name is left, redact nothing at all.
   */
  const passNames = () => {
    out = out.replace(FULL_NAME, (match) => {
      if (ALLOW.has(match.toLowerCase().trim())) return match;
      const words = match.split(/\s+/);
      const kept: string[] = [];
      while (words.length && SENTENCE_WORDS.has(words[0].toLowerCase())) {
        kept.push(words.shift() as string);
      }
      // One word left is a first name, and first names are how this office
      // talks about its own people. Nothing to redact.
      if (words.length < 2) return match;
      if (!hits.includes("full_name")) hits.push("full_name");
      return [...kept, "[a person]"].join(" ");
    });
  };

  // Order matters: the most specific patterns run first.
  pass(EMAIL, "email", "[removed]");
  pass(SSN, "ssn", "[removed]");
  pass(DOB, "dob", "[removed]");
  pass(CHART, "chart_id", "[removed]");
  pass(PHONE, "phone", "[removed]");
  pass(TITLE_NAME, "titled_name", "[a person]");
  passNames();

  return { text: out, redacted: hits.length > 0, hits };
}

/** Scrub a whole list of titles, dropping empties. */
export function scrubList(items: (string | null | undefined)[], max = 120): {
  values: string[];
  redacted: boolean;
} {
  let redacted = false;
  const values: string[] = [];
  for (const item of items) {
    const r = scrubFreeText(item, max);
    if (r.redacted) redacted = true;
    if (r.text.trim()) values.push(r.text.trim());
  }
  return { values, redacted };
}

/**
 * True when a string still reads as person-level after scrubbing — used where
 * refusing is safer than sending a redacted version (document verification).
 */
export function looksPersonLevel(input: unknown): boolean {
  return scrubFreeText(input).redacted;
}

/** Log what was caught without ever logging the caught value. */
export function logScrub(surface: string, result: ScrubResult): void {
  if (result.redacted) {
    console.log(`phi-scrub: ${surface} redacted [${result.hits.join(",")}]`);
  }
}
