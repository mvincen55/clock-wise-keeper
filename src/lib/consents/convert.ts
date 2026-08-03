import {
  FORM_CATEGORIES,
  SIGNATURE_ROLES,
  makeBlock,
  type ConsentBlock,
  type ConsentBlockType,
  type ConsentSectionKind,
  type ConsentTemplateContent,
  type FormCategory,
  type SignatureRole,
} from './types';

/**
 * Turns the extracted text of an uploaded office form into template blocks.
 *
 * Two callers:
 *  - the local fallback converter (`heuristicConvert`) used when the
 *    consent-ai edge function is unavailable, and
 *  - `sanitizeBlocks`, which every AI conversion passes through so the
 *    review screen only ever sees well-formed blocks regardless of what
 *    the model returned.
 *
 * Conversions are never auto-published: both paths land on the side-by-side
 * review screen where a manager approves, edits, re-runs, or discards.
 */

// ---------------------------------------------------------------------------
// Category + section-kind detection
// ---------------------------------------------------------------------------

const CATEGORY_KEYWORDS: [FormCategory, RegExp][] = [
  ['financial', /financial|payment|fee agreement|balance|billing/i],
  ['sedation', /sedation|nitrous|anesthesia consent|iv sedation/i],
  ['implant', /implant/i],
  ['endodontic', /root canal|endodontic|pulp/i],
  ['periodontal', /scaling and root planing|periodontal|srp|sonic|ultrasonic|perio/i],
  ['surgical_consent', /extraction|surgical|surgery|bone graft|socket|biopsy/i],
  ['orthodontic', /orthodontic|braces|aligner/i],
  ['restorative', /crown|filling|restorative|denture|bridge|onlay|veneer/i],
  ['medication', /medication|prescription|antibiotic|drug/i],
  ['preoperative', /pre-?op|before your (surgery|procedure|appointment)/i],
  ['postoperative', /post-?op|after your (surgery|procedure|extraction)|home care instructions/i],
  ['office_policy', /office policy|cancellation|no-?show|privacy practices/i],
  ['general_consent', /consent/i],
];

export function guessCategory(name: string, text: string): FormCategory {
  const haystack = `${name}\n${text.slice(0, 2000)}`;
  for (const [category, pattern] of CATEGORY_KEYWORDS) {
    if (pattern.test(haystack)) return category;
  }
  return 'other';
}

const SECTION_KIND_KEYWORDS: [ConsentSectionKind, RegExp][] = [
  ['serious_risks', /serious|severe|rare (but|complications)|less common risk/i],
  ['risks', /\brisks?\b|complications/i],
  ['benefits', /benefits?/i],
  ['alternatives', /alternatives?|other options/i],
  ['declining', /declin|refus|no treatment|without treatment/i],
  ['consent_statement', /\bconsent\b.*(statement|acknowledg)|i (hereby )?(consent|authorize)|informed consent/i],
  ['questions', /questions.*(answer|ask)|opportunity to ask/i],
  ['purpose', /purpose|why (this|the) (treatment|procedure)/i],
  ['description', /description|about (this|the) procedure|what is/i],
  ['preop', /before (your|the) (procedure|surgery|appointment)|pre-?operative/i],
  ['postop', /after (your|the) (procedure|surgery|extraction)|post-?operative|home care/i],
];

export function guessSectionKind(heading: string): ConsentSectionKind {
  for (const [kind, pattern] of SECTION_KIND_KEYWORDS) {
    if (pattern.test(heading)) return kind;
  }
  return 'other';
}

// ---------------------------------------------------------------------------
// Heuristic line classification
// ---------------------------------------------------------------------------

const BULLET_RE = /^\s*(?:[-•*▪◦‣·]|\d{1,2}[.)])\s+(.*)$/;
const CHECKBOX_RE = /^\s*(?:\[\s?\]|☐|□|❑|◻)\s*(.*)$/;
const YESNO_RE = /(?:\byes\b[\s/|]*\bno\b|☐\s*yes.*☐\s*no|\[\s?\]\s*yes.*\[\s?\]\s*no)/i;
const BLANK_LINE_RE = /_{3,}/;

const SIGNATURE_ROLE_RES: [SignatureRole, RegExp][] = [
  ['guardian', /parent|guardian/i],
  ['witness', /witness/i],
  ['doctor', /doctor|dentist|provider signature|dds|dmd/i],
  ['hygienist', /hygienist/i],
  ['assistant', /assistant/i],
  ['patient', /patient|client|signature of person/i],
];

function signatureRoleFor(line: string): SignatureRole {
  for (const [role, pattern] of SIGNATURE_ROLE_RES) {
    if (pattern.test(line)) return role;
  }
  return 'patient';
}

function isHeading(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3 || trimmed.length > 80) return false;
  if (/[.:]$/.test(trimmed) && trimmed.length < 60 && /^[A-Z]/.test(trimmed) && !/[a-z].*[.!?]$/.test(trimmed)) {
    return !trimmed.includes('_');
  }
  // ALL CAPS lines (allowing digits/punctuation) read as headings.
  const letters = trimmed.replace(/[^a-zA-Z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase();
}

/**
 * Convert extracted document text into blocks without AI. Deliberately
 * conservative: unrecognized lines become paragraphs the manager can retype,
 * never dropped content.
 */
export function heuristicConvert(name: string, text: string): ConsentTemplateContent {
  const blocks: ConsentBlock[] = [];
  const lines = text
    .split(/\r?\n/)
    .map(l => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  blocks.push(makeBlock('title', { label: name || 'Untitled Form' }));

  let paragraph: string[] = [];
  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(makeBlock('paragraph', { body: paragraph.join(' ') }));
    paragraph = [];
  };
  let bullets: string[] = [];
  const flushBullets = () => {
    if (bullets.length === 0) return;
    blocks.push(makeBlock('bullets', { items: bullets }));
    bullets = [];
  };
  const flushAll = () => { flushParagraph(); flushBullets(); };

  for (const line of lines) {
    const bullet = line.match(BULLET_RE);
    const checkbox = line.match(CHECKBOX_RE);

    if (/signature/i.test(line) && (BLANK_LINE_RE.test(line) || /signature\s*[:_]?\s*$/i.test(line))) {
      flushAll();
      blocks.push(makeBlock('signature', { role: signatureRoleFor(line), required: true }));
      if (/date/i.test(line)) blocks.push(makeBlock('date', { label: 'Date', required: true }));
      continue;
    }
    if (/^date\b/i.test(line) && BLANK_LINE_RE.test(line)) {
      flushAll();
      blocks.push(makeBlock('date', { label: 'Date', required: true }));
      continue;
    }
    if (/patient('s)? name/i.test(line) && BLANK_LINE_RE.test(line)) {
      flushAll();
      blocks.push(makeBlock('patient_name', { label: 'Patient Name', required: true }));
      continue;
    }
    if (/tooth|teeth/i.test(line) && (BLANK_LINE_RE.test(line) || /#/.test(line)) && line.length < 60) {
      flushAll();
      blocks.push(makeBlock('tooth_numbers', { label: 'Tooth Number(s)' }));
      continue;
    }
    if (/procedure/i.test(line) && BLANK_LINE_RE.test(line) && line.length < 70) {
      flushAll();
      blocks.push(makeBlock('procedure', { label: 'Procedure' }));
      continue;
    }
    if (/(?:fee|cost|amount|total)\b/i.test(line) && (BLANK_LINE_RE.test(line) || /\$\s*_{2,}/.test(line)) && line.length < 70) {
      flushAll();
      blocks.push(makeBlock('cost', { label: 'Treatment Cost' }));
      continue;
    }
    if (/initial/i.test(line) && (BLANK_LINE_RE.test(line) || /\(initial s?\)/i.test(line)) && line.length < 160) {
      flushAll();
      blocks.push(makeBlock('initials', {
        label: line.replace(BLANK_LINE_RE, '').replace(/\(initials?\)/i, '').trim(),
        required: true,
      }));
      continue;
    }
    if (YESNO_RE.test(line)) {
      flushAll();
      blocks.push(makeBlock('yesno', {
        label: line.replace(YESNO_RE, '').replace(/[☐□]/g, '').trim() || 'Yes / No',
      }));
      continue;
    }
    if (checkbox) {
      flushAll();
      blocks.push(makeBlock('checkbox', { label: checkbox[1] || 'Checkbox' }));
      continue;
    }
    if (bullet) {
      flushParagraph();
      bullets.push(bullet[1]);
      continue;
    }
    if (isHeading(line)) {
      flushAll();
      const label = line.replace(/[.:]\s*$/, '');
      blocks.push(makeBlock('section', { label, kind: guessSectionKind(label) }));
      continue;
    }
    flushBullets();
    paragraph.push(line);
    // Sentences that end cleanly close the paragraph so text keeps its shape.
    if (/[.!?]$/.test(line) && paragraph.join(' ').length > 200) flushParagraph();
  }
  flushAll();

  // A consent form always ends with a signature area; add one if the scan
  // lost it so the review screen shows a complete, usable template.
  if (!blocks.some(b => b.type === 'signature')) {
    blocks.push(makeBlock('section', { label: 'Consent', kind: 'consent_statement' }));
    blocks.push(makeBlock('signature', { role: 'patient', required: true }));
    blocks.push(makeBlock('date', { label: 'Date', required: true }));
  }

  return { blocks };
}

// ---------------------------------------------------------------------------
// AI output sanitizing
// ---------------------------------------------------------------------------

const VALID_TYPES = new Set<ConsentBlockType>([
  'title', 'section', 'instruction', 'paragraph', 'bullets', 'checkbox',
  'yesno', 'short_answer', 'long_answer', 'date', 'tooth_numbers',
  'procedure', 'provider', 'patient_name', 'cost', 'initials', 'signature',
  'medications', 'logo', 'divider', 'page_break',
]);

const VALID_KINDS = new Set<ConsentSectionKind>([
  'description', 'purpose', 'benefits', 'risks', 'serious_risks',
  'alternatives', 'declining', 'questions', 'consent_statement',
  'preop', 'postop', 'other',
]);

const str = (v: unknown): string | undefined =>
  typeof v === 'string' && v.trim() ? v.trim() : undefined;

/**
 * Coerce whatever a model returned into well-formed blocks: unknown types
 * degrade to paragraphs (content is never dropped), ids are reassigned,
 * and invalid roles/kinds fall back to safe defaults.
 */
export function sanitizeBlocks(raw: unknown): ConsentTemplateContent {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { blocks?: unknown[] }).blocks)
      ? (raw as { blocks: unknown[] }).blocks
      : [];

  const blocks: ConsentBlock[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const type = str(o.type) as ConsentBlockType | undefined;
    const label = str(o.label);
    const body = str(o.body) ?? str(o.text);
    const items = Array.isArray(o.items)
      ? o.items.map(i => (typeof i === 'string' ? i.trim() : '')).filter(Boolean)
      : undefined;

    if (!type || !VALID_TYPES.has(type)) {
      const salvage = body ?? label ?? (items ? items.join('; ') : undefined);
      if (salvage) blocks.push(makeBlock('paragraph', { body: salvage }));
      continue;
    }

    const block = makeBlock(type, { label, body, items });
    if (typeof o.required === 'boolean') block.required = o.required;
    if (type === 'signature') {
      const role = str(o.role) as SignatureRole | undefined;
      block.role = role && SIGNATURE_ROLES.includes(role) ? role : 'patient';
      block.required = block.required ?? true;
    }
    if (type === 'section') {
      const kind = str(o.kind) as ConsentSectionKind | undefined;
      block.kind = kind && VALID_KINDS.has(kind) ? kind : guessSectionKind(label ?? '');
      if (!block.label) block.label = 'Section';
    }
    if ((type === 'bullets' || type === 'medications') && (!items || items.length === 0)) {
      continue; // an empty list renders as nothing — drop it
    }
    blocks.push(block);
  }

  return { blocks };
}

/** Validate a category string from AI/user input to the known set. */
export function sanitizeCategory(raw: unknown): FormCategory {
  return typeof raw === 'string' && (FORM_CATEGORIES as readonly string[]).includes(raw)
    ? (raw as FormCategory)
    : 'other';
}
