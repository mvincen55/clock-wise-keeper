/**
 * Schedule-note classification — local only.
 *
 * Visible schedule notes are inspected here, in the browser, and converted to
 * controlled operational codes. The raw note never leaves this module: the
 * classifier returns a code + confidence, and callers store only the code,
 * the minutes, and whether the closer confirmed it. When the classifier is
 * not confident, it says UNCLASSIFIED and the closer picks — it never guesses.
 */
import type { BlockCode, PhraseRule } from './types';

interface LexiconEntry {
  code: Exclude<BlockCode, 'UNCLASSIFIED'>;
  /** All patterns matched against a normalized (lowercase, squashed) note. */
  patterns: RegExp[];
}

// Built-in operational lexicon. Deliberately conservative: these phrases are
// about the OFFICE (providers, rooms, blocks) — anything else stays
// unclassified rather than guessed.
const LEXICON: LexiconEntry[] = [
  {
    code: 'PROVIDER_OUT_EARLY',
    patterns: [/\bout early\b/, /\bleav(?:e|es|ing) early\b/, /\bgone after\b/, /\bout at \d/],
  },
  {
    code: 'PROVIDER_STARTS_LATE',
    patterns: [/\bstarts? late\b/, /\bin late\b/, /\barriv(?:es|ing) late\b/, /\bstarts? at \d/],
  },
  {
    code: 'PROVIDER_OFF',
    patterns: [
      /\b(?:doctor|dr|doc|provider|hygienist)\.? (?:is )?off\b/,
      /\bday off\b/,
      /\bnot in today\b/,
      /\bvacation\b/,
      /\bpto\b/,
      /\bout of office\b/,
      /\bout today\b/,
    ],
  },
  { code: 'LUNCH_BLOCK', patterns: [/\blunch\b/, /\bmeal break\b/] },
  {
    code: 'MEETING_BLOCK',
    patterns: [/\bmeeting\b/, /\bhuddle\b/, /\bstaff mtg\b/, /\bteam mtg\b/],
  },
  {
    code: 'TRAINING_BLOCK',
    patterns: [/\btraining\b/, /\bcontinuing ed(?:ucation)?\b/, /\bce course\b/, /\bce day\b/, /\bseminar\b/],
  },
  {
    code: 'ADMIN_BLOCK',
    patterns: [/\badmin(?:istrative)? time\b/, /\badmin\b/, /\bpaperwork\b/, /\bcharting\b/],
  },
  {
    code: 'EMERGENCY_RESERVE',
    patterns: [/\bemergency only\b/, /\breserved? emergency\b/, /\bemerg(?:ency)? reserve\b/, /\bsame.?day emergency\b/],
  },
  {
    code: 'EQUIPMENT_UNAVAILABLE',
    patterns: [
      /\boperatory (?:is )?down\b/,
      /\bop \d* ?down\b/,
      /\bequipment (?:unavailable|down|broken)\b/,
      /\bchair (?:down|broken)\b/,
      /\bno suction\b/,
      /\bcompressor\b/,
    ],
  },
  {
    code: 'STAFFING_LIMITATION',
    patterns: [/\bno assistant\b/, /\bno asst\b/, /\bshort staffed\b/, /\bno hygienist\b/, /\bno front desk\b/],
  },
  {
    code: 'OFFICE_CLOSED',
    patterns: [/\boffice closed\b/, /\bclosed\b/, /\bholiday\b/],
  },
  {
    code: 'OTHER_OPERATIONAL_BLOCK',
    patterns: [/\bblocked\b/, /\bblock\b/, /\bhold\b/, /\bbuffer\b/, /\bdo not book\b/, /\bdnb\b/],
  },
];

/** Ordered so specific codes win over the OTHER_OPERATIONAL_BLOCK catch-all. */
const ORDERED = LEXICON;

export interface NoteClassification {
  code: BlockCode;
  /** 0–1. UNCLASSIFIED always carries 0. */
  confidence: number;
}

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s:.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Sanitize a manager-authored phrase rule. Rules must stay short, generic,
 * single-line office phrases — never names or narratives. Returns null when
 * the phrase is unusable.
 */
export function sanitizePhrase(raw: string): string | null {
  const cleaned = normalize(raw);
  if (cleaned.length < 2 || cleaned.length > 40) return null;
  if (cleaned.split(' ').length > 6) return null;
  // Phone-ish or DOB-ish content has no business in a phrase rule.
  if (/\d{3}[\s.-]?\d{3,4}/.test(cleaned)) return null;
  return cleaned;
}

/**
 * Classify one schedule note into an operational code.
 *
 * Office phrase rules (already sanitized) are checked first — the office's
 * own shorthand outranks the built-in lexicon. The note text goes no further
 * than this function.
 */
export function classifyNote(note: string, officeRules: PhraseRule[] = []): NoteClassification {
  const text = normalize(note);
  if (text.length === 0) return { code: 'UNCLASSIFIED', confidence: 0 };

  for (const rule of officeRules) {
    const phrase = sanitizePhrase(rule.phrase);
    if (phrase && text.includes(phrase)) {
      return { code: rule.code, confidence: 0.95 };
    }
  }

  const matches: Array<{ code: BlockCode; strength: number }> = [];
  for (const entry of ORDERED) {
    for (const pattern of entry.patterns) {
      if (pattern.test(text)) {
        matches.push({ code: entry.code, strength: pattern.source.length });
        break;
      }
    }
  }

  if (matches.length === 0) return { code: 'UNCLASSIFIED', confidence: 0 };
  if (matches.length === 1) return { code: matches[0].code, confidence: 0.9 };

  // Multiple codes matched. The catch-all never outranks a specific code; two
  // genuinely different specific codes mean we are not confident enough.
  const specific = matches.filter(m => m.code !== 'OTHER_OPERATIONAL_BLOCK');
  if (specific.length === 1) return { code: specific[0].code, confidence: 0.85 };
  if (specific.length === 0) return { code: 'OTHER_OPERATIONAL_BLOCK', confidence: 0.9 };

  const codes = new Set(specific.map(m => m.code));
  if (codes.size === 1) return { code: specific[0].code, confidence: 0.9 };
  return { code: 'UNCLASSIFIED', confidence: 0 };
}
