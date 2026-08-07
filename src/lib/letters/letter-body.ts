/**
 * Letter markup — the storable text format for office correspondence, and
 * the pure functions that turn it into printable structure.
 *
 * The format extends the Broken Appointments convention (plain text,
 * blank-line paragraphs, **bold** runs) just far enough for normal office
 * letters, staying deterministic and injection-safe — the parser only ever
 * emits known structures, never raw HTML:
 *
 *   - paragraphs separated by blank lines
 *   - **bold** and _italic_ runs
 *   - "- " bullet lists and "1. " numbered lists (one item per line)
 *   - "::center" / "::right" on the first line of a paragraph for alignment
 *   - {{placeholder}} tokens (resolved separately, see resolvePlaceholders)
 *
 * Everything here is string-in / data-out. Patient values pass through
 * browser memory only (see src/lib/letters/types.ts).
 */

export interface LetterRun {
  text: string;
  bold: boolean;
  italic: boolean;
}

export type LetterAlign = 'left' | 'center' | 'right';

export type LetterBlock =
  | { kind: 'p'; align: LetterAlign; runs: LetterRun[] }
  | { kind: 'ul'; items: LetterRun[][] }
  | { kind: 'ol'; items: LetterRun[][] };

/** **bold** and _italic_ runs; unmatched markers pass through as text. */
export function parseRuns(text: string): LetterRun[] {
  const runs: LetterRun[] = [];
  // Split on bold first so _..._ inside a bold run still italicizes.
  const boldParts = text.split(/\*\*(.+?)\*\*/gs);
  boldParts.forEach((part, i) => {
    const bold = i % 2 === 1;
    const italicParts = part.split(/_(.+?)_/gs);
    italicParts.forEach((sub, j) => {
      if (sub === '') return;
      runs.push({ text: sub, bold, italic: j % 2 === 1 });
    });
  });
  return runs;
}

const BULLET = /^[-•]\s+/;
const NUMBERED = /^\d+[.)]\s+/;

/** Parse letter markup into printable blocks. */
export function parseLetterBody(text: string): LetterBlock[] {
  const blocks: LetterBlock[] = [];
  const paragraphs = text.replace(/\r\n/g, '\n').split(/\n{2,}/);

  for (const rawPara of paragraphs) {
    const para = rawPara.trim();
    if (para === '') continue;

    let align: LetterAlign = 'left';
    let content = para;
    const alignMatch = /^::(center|right)\s*/.exec(content);
    if (alignMatch) {
      align = alignMatch[1] as LetterAlign;
      content = content.slice(alignMatch[0].length);
    }

    const lines = content.split('\n').map(l => l.trim()).filter(l => l !== '');
    if (lines.length === 0) continue;

    if (lines.every(l => BULLET.test(l))) {
      blocks.push({ kind: 'ul', items: lines.map(l => parseRuns(l.replace(BULLET, ''))) });
    } else if (lines.every(l => NUMBERED.test(l))) {
      blocks.push({ kind: 'ol', items: lines.map(l => parseRuns(l.replace(NUMBERED, ''))) });
    } else {
      blocks.push({ kind: 'p', align, runs: parseRuns(lines.join(' ')) });
    }
  }

  return blocks;
}

/** The safe template variables every letter surface understands. */
export const LETTER_PLACEHOLDERS = [
  'patient_name',
  'first_name',
  'today',
  'provider_name',
  'office_name',
] as const;

export type LetterPlaceholder = (typeof LETTER_PLACEHOLDERS)[number];

const PLACEHOLDER_TOKEN = /\{\{\s*([a-z0-9_]+)\s*\}\}/gi;

/** Every distinct {{placeholder}} key present in the text, in order. */
export function placeholdersIn(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(PLACEHOLDER_TOKEN)) {
    const key = match[1].toLowerCase();
    if (!found.includes(key)) found.push(key);
  }
  return found;
}

/**
 * Resolve {{placeholder}} tokens from a value map (memory-only merge data).
 * Missing/blank values render as a written-in blank line ("print blank"
 * support) or stay as tokens for the editing preview.
 */
export function resolvePlaceholders(
  text: string,
  values: Record<string, string>,
  { missing = 'blank' }: { missing?: 'blank' | 'keep' } = {},
): string {
  return text.replace(PLACEHOLDER_TOKEN, (token, rawKey: string) => {
    const key = rawKey.toLowerCase();
    const value = values[key]?.trim();
    if (value) return value;
    return missing === 'blank' ? '____________' : token;
  });
}

/**
 * Derived merge values: a first name typed nowhere falls back to the first
 * word of the patient/recipient name, so {{first_name}} keeps working
 * without a second field.
 */
export function withDerivedValues(values: Record<string, string>): Record<string, string> {
  const out = { ...values };
  if (!out.first_name?.trim() && out.patient_name?.trim()) {
    out.first_name = out.patient_name.trim().split(/\s+/)[0];
  }
  return out;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/**
 * ISO YYYY-MM-DD → the professional long form used on letterhead,
 * e.g. "August 7, 2026". Unparseable input passes through untouched.
 */
export function formatLetterDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return iso;
  const [, y, mo, d] = m;
  const month = MONTHS[Number(mo) - 1];
  if (!month) return iso;
  return `${month} ${Number(d)}, ${y}`;
}

/** Today's local date as ISO YYYY-MM-DD (letter datelines are local). */
export function todayISO(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
