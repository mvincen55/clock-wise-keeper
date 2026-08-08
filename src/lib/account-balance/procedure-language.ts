/**
 * Patient-friendly procedure wording — deterministic mappings only.
 *
 * Known Dentrix descriptions translate to plain language; unknown ones get
 * conservative capitalization cleanup and are flagged for staff verification.
 * Nothing here invents wording, and no remote model is ever consulted.
 */

export interface FriendlyWording {
  /** Patient-facing label (tooth number appended by the caller when present). */
  label: string;
  /** Short noun for balance-calculation summary lines ("filling", "crown"…). */
  family: string;
  /** True when the label is a verified mapping (not a cleanup guess). */
  known: boolean;
}

interface WordingRule {
  pattern: RegExp;
  label: string | ((m: RegExpMatchArray) => string);
  family: string;
}

/**
 * Ordered rules — first match wins. Patterns are anchored on words so
 * "Resin-Three surfaces, posterior" and "RESIN THREE SURF POST" both hit.
 */
const RULES: WordingRule[] = [
  { pattern: /periodic\s+oral\s+eval/i, label: 'Routine dental exam', family: 'exam' },
  { pattern: /comprehensive\s+oral\s+eval/i, label: 'Comprehensive dental exam', family: 'exam' },
  { pattern: /limited\s+oral\s+eval/i, label: 'Focused (problem) dental exam', family: 'exam' },
  { pattern: /prophylaxis[\s-]*adult|adult\s+prophy/i, label: 'Adult cleaning', family: 'cleaning' },
  { pattern: /prophylaxis[\s-]*child|child\s+prophy/i, label: 'Child cleaning', family: 'cleaning' },
  { pattern: /prophylaxis/i, label: 'Dental cleaning', family: 'cleaning' },
  {
    pattern: /bitewing[s]?[\s-]*(single|one|two|three|four)?\s*(image|images|film|films)?/i,
    label: m => {
      const count = (m[1] ?? '').toLowerCase();
      const n = { single: '1', one: '1', two: '2', three: '3', four: '4' }[count];
      return n ? `Bitewing X-rays, ${n} image${n === '1' ? '' : 's'}` : 'Bitewing X-rays';
    },
    family: 'X-rays',
  },
  {
    pattern: /intraoral[\s-]*periapical\s+first/i,
    label: 'Periapical X-ray',
    family: 'X-rays',
  },
  {
    pattern: /intraoral[\s-]*periapical\s+each\s+add/i,
    label: 'Additional periapical X-ray',
    family: 'X-rays',
  },
  { pattern: /periapical/i, label: 'Periapical X-ray', family: 'X-rays' },
  { pattern: /panoramic/i, label: 'Panoramic X-ray', family: 'X-rays' },
  {
    pattern: /resin[\s-]*(one|two|three|four|1|2|3|4)\s*surf(ace)?s?,?\s*(anterior|posterior)?/i,
    label: m => {
      const n = { one: '1', two: '2', three: '3', four: '4' }[(m[1] ?? '').toLowerCase()] ?? m[1];
      return `${n}-surface tooth-colored filling`;
    },
    family: 'filling',
  },
  { pattern: /resin\s+based\s+composite|composite\s+filling/i, label: 'Tooth-colored filling', family: 'filling' },
  { pattern: /amalgam[\s-]*(one|two|three|four|1|2|3|4)?\s*surf/i, label: 'Silver filling', family: 'filling' },
  { pattern: /crown\s+porcelain\s*\/?\s*ceramic|porcelain\s*\/?\s*ceramic\s+crown/i, label: 'Porcelain/ceramic crown', family: 'crown' },
  { pattern: /crown\s+porcelain\s+fused|pfm\s+crown/i, label: 'Porcelain-fused-to-metal crown', family: 'crown' },
  { pattern: /core\s+buildup(,?\s*including\s+any\s+pins)?/i, label: 'Core buildup', family: 'buildup' },
  { pattern: /root\s+canal|endodontic\s+therapy/i, label: 'Root canal treatment', family: 'root canal' },
  { pattern: /extraction[,]?\s*erupted|simple\s+extraction/i, label: 'Tooth extraction', family: 'extraction' },
  { pattern: /extraction/i, label: 'Tooth extraction', family: 'extraction' },
  { pattern: /sealant/i, label: 'Protective sealant', family: 'sealant' },
  { pattern: /fluoride/i, label: 'Fluoride treatment', family: 'fluoride' },
  { pattern: /scaling\s+and\s+root\s+planing|perio\w*\s+scaling/i, label: 'Deep cleaning (scaling and root planing)', family: 'deep cleaning' },
  { pattern: /full\s+mouth\s+debridement/i, label: 'Full-mouth debridement', family: 'deep cleaning' },
];

/** Conservative cleanup for unknown wording: fix case, keep the words. */
function conservativeCleanup(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (trimmed === '') return '';
  // All-caps Dentrix text becomes sentence case; mixed case is left alone.
  if (trimmed === trimmed.toUpperCase()) {
    const lower = trimmed.toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  }
  return trimmed;
}

/**
 * Translate a Dentrix procedure description. Unknown descriptions are
 * cleaned conservatively and marked `known: false` so the UI requires staff
 * verification instead of hallucinating a friendlier name.
 */
export function friendlyProcedure(rawDescription: string, tooth?: string): FriendlyWording {
  for (const rule of RULES) {
    const m = rawDescription.match(rule.pattern);
    if (m) {
      const base = typeof rule.label === 'function' ? rule.label(m) : rule.label;
      return {
        label: withTooth(base, tooth),
        family: rule.family,
        known: true,
      };
    }
  }
  return {
    label: withTooth(conservativeCleanup(rawDescription), tooth),
    family: '',
    known: false,
  };
}

function withTooth(label: string, tooth?: string): string {
  const t = (tooth ?? '').trim().replace(/^#/, '');
  if (label === '' || t === '' || !/^\d{1,2}[A-Za-z]?$/.test(t)) return label;
  return `${label}, tooth #${t}`;
}

/** Short summary label for the balance calculation ("Tooth #29 filling"). */
export function summaryLabelFor(wording: FriendlyWording, tooth?: string): string {
  const t = (tooth ?? '').trim().replace(/^#/, '');
  if (t !== '' && wording.family !== '') {
    return `Tooth #${t} ${wording.family === 'X-rays' ? 'X-rays' : wording.family}`;
  }
  if (wording.family !== '') {
    return wording.family.charAt(0).toUpperCase() + wording.family.slice(1);
  }
  return wording.label;
}
