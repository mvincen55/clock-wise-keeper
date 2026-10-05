// phi-scrub — the last gate before staff free text reaches the AI gateway.
//
// The gateway has no BAA. The office rule is absolute: "No patient data. Ever.
// Not in tables, not in checklist titles, not in AI prompts." Convention and a
// UI reminder are mitigations; this file is the enforcement.
//
// What it strips: anything person-level. Full names ("Jane Doe", "Mr. Doe",
// "jane doe", "DOE, JANE"), phone numbers, emails, SSNs, dates of birth, and
// chart/MRN-style identifiers.
// What it deliberately keeps: first names on their own — the office speaks to
// its own people by first name, and that is not patient data — and the
// capitalised phrases of office life that are not people at all: carriers
// ("Delta Dental"), manual sections ("Timely Filing"), places ("Salt Lake
// City", "North Carolina"). See phi-vocab.ts for the word lists behind that.
//
// How a name is recognised, in order:
//   1. Dictionary pairs, any case: a known first name followed by a known
//      surname ("call sarah johnson", "JANE DOE"), or "surname, first"
//      ("Doe, Jane"). Catches lower-case and shouted names.
//   2. Capitalised runs ("Sarah Whitman"): still redacted, unless the run is
//      office/insurance/document/place vocabulary — then it is a phrase.

import {
  FIRST_NAMES,
  NON_NAME_WORDS,
  PLACE_PREFIXES,
  STATES,
  SURNAME_HOMOGRAPHS,
  SURNAMES,
} from "./phi-vocab.ts";

export type ScrubResult = {
  /** The text safe to send onward, with person-level spans replaced. */
  text: string;
  /** True when anything was replaced — the caller may choose to refuse. */
  redacted: boolean;
  /** Coarse labels of what was hit, for logging without logging the value. */
  hits: string[];
};

// A title and the name after it. A capitalised title ("Mrs. Alvarez") is
// trusted on its own; a lower-case one ("mrs alvarez") only when a known
// surname follows, so "the dr said" is left alone.
const TITLE_NAME = /\b(Mr|Mrs|Ms|Miss|Mx|Dr|mr|mrs|ms|miss|mx|dr)\.?\s+([A-Za-z][a-z'’-]{1,20})((?:\s+[A-Z][a-z'’-]{1,20})?)/g;
// Word tokens for the any-case dictionary pass ("first last", "first m. last",
// "first last jr", "last, first"). Tokens are scanned pairwise by hand because
// a global regex would swallow "call sarah" and never see "sarah johnson".
const WORD_TOKEN = /[A-Za-z][A-Za-z'’-]{0,20}\.?,?/g;
const SUFFIXES = new Set(["jr", "sr", "ii", "iii"]);
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

const norm = (w: string) => w.toLowerCase().replace(/[’']/g, "'").replace(/\.$/, "");
const isFirstName = (w: string) => FIRST_NAMES.has(norm(w));
const isSurname = (w: string, afterFirstName: boolean) =>
  SURNAMES.has(norm(w)) || (afterFirstName && SURNAME_HOMOGRAPHS.has(norm(w)));
/** A word that marks a capitalised run as a phrase rather than a person. */
const isVocabulary = (w: string) => {
  const n = norm(w);
  return NON_NAME_WORDS.has(n) || STATES.has(n) || SENTENCE_WORDS.has(n) || ALLOW.has(n);
};

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
   * Dictionary pass, any case: "sarah johnson", "JANE DOE", "Doe, Jane".
   * Both halves must be known names, so ordinary lower-case prose
   * ("megan called about the claim") is never touched.
   */
  const passDictionaryNames = () => {
    type Token = { text: string; start: number; end: number };
    const tokens: Token[] = [];
    for (const m of out.matchAll(WORD_TOKEN)) {
      tokens.push({ text: m[0], start: m.index ?? 0, end: (m.index ?? 0) + m[0].length });
    }
    const bare = (t: Token) => t.text.replace(/[.,]+$/, "");
    const adjacent = (a: Token, b: Token) => /^\s+$/.test(out.slice(a.end, b.start));
    const spans: { start: number; end: number }[] = [];
    for (let i = 0; i < tokens.length - 1; i++) {
      const a = tokens[i];
      const b = tokens[i + 1];
      if (!adjacent(a, b)) continue;
      // "Doe, Jane"
      if (a.text.endsWith(",") && isSurname(bare(a), true) && isFirstName(bare(b)) && bare(b).length > 1) {
        spans.push({ start: a.start, end: b.end });
        i += 1;
        continue;
      }
      if (a.text.endsWith(",") || !isFirstName(bare(a))) continue;
      // "robert j. chen" — skip a single-letter initial.
      let j = i + 1;
      if (bare(b).length === 1 && tokens[j + 1] && adjacent(b, tokens[j + 1])) j += 1;
      const last = tokens[j];
      if (!last || bare(last).length < 2 || !isSurname(bare(last), true)) continue;
      let end = last.end;
      const suffix = tokens[j + 1];
      if (suffix && adjacent(last, suffix) && SUFFIXES.has(bare(suffix).toLowerCase())) {
        end = suffix.end;
        j += 1;
      }
      if (ALLOW.has(out.slice(a.start, end).toLowerCase().trim())) continue;
      spans.push({ start: a.start, end });
      i = j;
    }
    if (spans.length === 0) return;
    if (!hits.includes("full_name")) hits.push("full_name");
    for (const span of spans.reverse()) {
      out = `${out.slice(0, span.start)}[a person]${out.slice(span.end)}`;
    }
  };

  /**
   * The capitalised-run pass, which needs more care than a flat replace: a
   * run that opens with a capitalised ordinary word ("Call Sarah") must keep
   * that word; a run that is office vocabulary or a place ("Delta Dental
   * Processing Manual", "Salt Lake City") is not a person at all; and if only
   * a lone first name is left, nothing is redacted.
   */
  const passNames = () => {
    out = out.replace(FULL_NAME, (match) => {
      if (ALLOW.has(match.toLowerCase().trim())) return match;
      const words = match.split(/\s+/);
      // A place name: "San Diego", "New Bedford", "Fort Worth", "Lake Forest".
      if (words.length >= 2 && PLACE_PREFIXES.has(norm(words[0])) && !isSurname(words[1], false)) {
        return match;
      }
      // Any vocabulary word inside the run makes it a phrase ("Blue Cross
      // Blue Shield", "Timely Filing", "Harbor Dental", "Patient Portal").
      // A vocabulary word at the edges is peeled off instead, so "Patient
      // Robert Chen" still loses the name.
      const kept: string[] = [];
      while (words.length && isVocabulary(words[0])) kept.push(words.shift() as string);
      const tail: string[] = [];
      while (words.length && isVocabulary(words[words.length - 1])) tail.unshift(words.pop() as string);
      if (words.some(isVocabulary)) return match;
      // One word left is a first name, and first names are how this office
      // talks about its own people. Nothing to redact.
      if (words.length < 2) return match;
      if (!hits.includes("full_name")) hits.push("full_name");
      return [...kept, "[a person]", ...tail].join(" ");
    });
  };

  // Order matters: the most specific patterns run first.
  pass(EMAIL, "email", "[removed]");
  pass(SSN, "ssn", "[removed]");
  pass(DOB, "dob", "[removed]");
  pass(CHART, "chart_id", "[removed]");
  pass(PHONE, "phone", "[removed]");
  out = out.replace(TITLE_NAME, (match, title: string, name: string) => {
    const trusted = title[0] === title[0].toUpperCase() ? !isVocabulary(name) : isSurname(name, true);
    if (!trusted) return match;
    if (!hits.includes("titled_name")) hits.push("titled_name");
    return "[a person]";
  });
  passDictionaryNames();
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
