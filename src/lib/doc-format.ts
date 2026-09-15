/**
 * Turns stored office-document text into renderable blocks. Handles both
 * clean Markdown (new uploads — ingest-doc extracts structure) and the
 * messy plain text of earlier extractions: hard-wrapped lines merge back
 * into paragraphs, stray page numbers and lone bullet marks disappear,
 * bullet/numbered items reassemble, and short standalone lines become
 * headings.
 *
 * Two real-world shapes drive the list and table rules:
 *   - PDF extractions separate list marks from their text. A run of lone
 *     bullet marks is followed by that many items (blank-line separated),
 *     and a list number sits alone on its own line above its label.
 *   - Google Docs Markdown exports escape punctuation, wrap headings and
 *     labels in bold, indent nested bullets, use `:-:` table separators,
 *     and put an empty header row above tables whose real header is bold.
 */

export type DocBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; text: string }
  | { type: 'table'; rows: string[][]; text: string; hasHeader?: boolean }
  | { type: 'bullets'; items: string[]; depths?: number[] }
  | { type: 'numbered'; items: string[]; depths?: number[] };

const PAGE_NUMBER = /^\d{1,3}$/;
const LONE_BULLET = /^[•·▪◦o*\-✅✓✔☐]$/;
const LONE_NUMBER = /^\d{1,2}[.)]$/;
const MD_HEADING = /^(#{1,6})(?:\s+(.*))?$/;
const BULLET_START = /^[•·▪◦✅✓✔☐➢►]\s+|^[-*–]\s+/;
const NUMBER_START = /^\d{1,2}[.)]\s+/;
const BOLD_LINE = /^\*\*(.+?)\*\*:?$/;
const HTML_COMMENT = /<!--[\s\S]*?-->/g;
const MD_ESCAPE = /\\([\\*_#!+\-.()[\]{}>~`])/g;
const TABLE_SEPARATOR = /^:?-+:?$/;
const SHORT = 60;
const LABEL_MAX = 80;
const HEADING_MIN = 3;

/**
 * Export artifacts that are not content: HTML comments, bold marks, Markdown
 * escapes, non-breaking spaces, and line-break entities outside tables.
 */
export function cleanInlineText(text: string): string {
  return text
    .replace(HTML_COMMENT, '')
    .replace(/\u00a0/g, ' ')
    .replace(MD_ESCAPE, '$1')
    .replace(/\*{2,}/g, '')
    .replace(/&#1[03];/g, ' ');
}

const splitTableRow = (line: string): string[] =>
  line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '').split(/(?<!\\)\|/);

export const parseDocTableRow = (line: string): string[] =>
  splitTableRow(line).map(cell =>
    cleanInlineText(cell.replace(/\\\|/g, '|').replace(/&#10;|<br\s*\/?\s*>/gi, '\n'))
      .split('\n')
      .map(part => part.trim())
      .filter(Boolean)
      .join('\n')
  );

const isTableRow = (line: string) => /^\|.*\|$/.test(line.trim());
const isBlank = (line: string) => line.trim() === '';

/** Every non-empty cell of the raw row is bold: the export's real header row. */
const isBoldRow = (line: string): boolean => {
  const cells = splitTableRow(line).map(cell => cell.trim()).filter(Boolean);
  return cells.length > 0 && cells.every(cell => /^(\*\*|\\\*\\\*).*(\*\*|\\\*\\\*)$/.test(cell));
};

// Words a real section title never ends on: a short line ending in one of
// these is a sentence wrapped mid-thought ("Front desk will be responsible
// for clearing the…"), not a heading.
const TRAILING_CONNECTIVE = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'nor',
  'to', 'of', 'in', 'on', 'at', 'for', 'with', 'by', 'from', 'into', 'onto',
  'about', 'after', 'before', 'during', 'per', 'via', 'as', 'than', 'then',
  'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'has', 'have', 'had', 'will', 'would', 'shall', 'should',
  'can', 'could', 'may', 'might', 'must',
  'that', 'this', 'these', 'those', 'their', 'your', 'our', 'its', 'his', 'her',
  'if', 'when', 'while', 'where', 'which', 'who', 'whom', 'whose', 'what', 'how', 'why',
]);

function nextNonBlank(lines: string[], from: number): string | undefined {
  for (let j = from; j < lines.length && j <= from + 3; j++) {
    if (!isBlank(lines[j])) return lines[j];
  }
  return undefined;
}

const lastWordOf = (text: string): string =>
  (text.split(/\s+/).pop() ?? '').replace(/[^A-Za-z']/g, '').toLowerCase();

/** Heading heuristic for plain-text lines (see module comment). */
function looksLikeHeading(line: string, lines: string[], i: number): boolean {
  const t = line.trim();
  if (t.length < HEADING_MIN || t.length > SHORT) return false;
  if (/[.,;:!?]$/.test(t)) return false;
  if (!/^[A-Z0-9]/.test(t)) return false;
  // Titles don't end on articles, prepositions, or auxiliaries — wrapped
  // sentences do ("…responsible for clearing the" / "…can range from
  // counseling to").
  if (TRAILING_CONNECTIVE.has(lastWordOf(t))) return false;
  // A continuation that starts lowercase means this line is the head of a
  // wrapped sentence, never a section boundary ("The back door near Pano
  // machine is" / "not a legal fire exit…").
  const continuation = nextNonBlank(lines, i + 1);
  if (continuation !== undefined && /^[a-z]/.test(continuation.trim())) return false;
  // A heading introduces something longer than itself — a long line, a
  // list, or a break. Short-line neighbors mean we're inside a block of
  // short lines (a letterhead/address), not at a heading.
  const next = lines[i + 1];
  if (next === undefined || isBlank(next)) return true;
  const n = next.trim();
  return n.length > SHORT || BULLET_START.test(n) || LONE_BULLET.test(n) || NUMBER_START.test(n);
}

/** "Work Schedule & Punctuality" is a label; "Call the lab and confirm the case" is a step. */
function isTitleCase(text: string): boolean {
  const words = text.replace(/[^A-Za-z\s'-]/g, ' ').split(/\s+/).filter(word => word.length >= 4);
  if (words.length === 0) return false;
  return words.filter(word => /^[A-Z]/.test(word)).length / words.length >= 0.7;
}

/**
 * A short label introducing the content beneath it (a sub-section), as
 * opposed to a wrapped sentence or one item of a list whose next sibling
 * follows immediately.
 */
function looksLikeLabel(text: string, lines: string[], i: number): boolean {
  const t = text.trim();
  if (t.length < HEADING_MIN || t.length > LABEL_MAX) return false;
  if (/[.;!?,]$/.test(t)) return false;
  const body = t.replace(/:$/, '').trim();
  if (TRAILING_CONNECTIVE.has(lastWordOf(body))) return false;
  const next = nextNonBlank(lines, i + 1)?.trim();
  if (next !== undefined && /^[a-z]/.test(next)) return false;
  if (next !== undefined && (NUMBER_START.test(next) || LONE_NUMBER.test(next))) return false;
  return /:$/.test(t) || isTitleCase(body);
}

/** A whole line in bold, short and unpunctuated, is the author's sub-heading. */
function boldLabel(rawLine: string, lines: string[], i: number): string | null {
  const match = rawLine.trim().match(BOLD_LINE);
  if (!match) return null;
  const inner = cleanInlineText(match[1]).trim().replace(/:$/, '');
  if (inner.length < HEADING_MIN || inner.length > LABEL_MAX) return null;
  if (/[.;!?,]$/.test(inner)) return null;
  const next = nextNonBlank(lines, i + 1)?.trim();
  if (next !== undefined && /^[a-z]/.test(next)) return null;
  // A bold sentence is emphasis, not a heading.
  if (inner.length > 40 && !isTitleCase(inner) && !NUMBER_START.test(inner)) return null;
  return inner;
}

const stripColon = (text: string): string => text.trim().replace(/:$/, '').trim();

const openingWords = (text: string): string => text.trim().split(/\s+/).slice(0, 2).join(' ').toLowerCase();

/** Most of the open list's items start with the same two words, and so does this line. */
function sharesItemPrefix(items: string[], line: string): boolean {
  if (items.length < 2) return false;
  const prefix = openingWords(line);
  if (prefix.split(' ').length < 2) return false;
  const matching = items.filter(item => openingWords(item) === prefix).length;
  return matching >= 2 && matching * 2 >= items.length;
}

type OpenList = { type: 'bullets' | 'numbered'; items: string[]; indents: number[] };

export function parseDocBlocks(content: string): DocBlock[] {
  const rawLines = content.replace(/\r\n?/g, '\n').split('\n');
  // Cleaned copies keep their indentation: nesting depth comes from it.
  const lines = rawLines.map(cleanInlineText);
  // A document with real markdown headings is structured: its author (or
  // extractor) already decided what the sections are. Never GUESS extra
  // headings from plain lines there — ALL-CAPS callouts, "V1) ..." visit
  // plans, and instruction lines would pollute the outline. The heuristic
  // exists only for legacy plain-text extractions with no structure at all.
  const hasMarkdownHeadings = lines.some(l => {
    const md = l.trim().match(MD_HEADING);
    return !!md && !!(md[2] ?? '').trim();
  });
  const blocks: DocBlock[] = [];
  let para: string[] = [];
  let list: OpenList | null = null;
  // Lone bullet marks promise that many items to come (blank-line separated).
  let pendingBullets = 0;
  // A list number on its own line waits for the text on the next line.
  let pendingNumber: string | null = null;
  // Derived sub-headings (bold labels, "1. Label:") nest one level under the
  // section they appear in.
  let lastHeadingLevel = 2;
  // Numbered labels become sub-headings only as a run counting up from 1;
  // a lone "8." after seven list items is the eighth item.
  let lastDerivedNumber: number | null = null;

  const pushHeading = (level: number, text: string, derived = false) => {
    blocks.push({ type: 'heading', level, text });
    if (!derived) {
      lastHeadingLevel = level;
      lastDerivedNumber = null;
    }
  };
  const numberedLabelIsHeading = (number: string, label: string, i: number): boolean => {
    const n = parseInt(number, 10);
    if (n !== 1 && lastDerivedNumber !== n - 1) return false;
    if (!looksLikeLabel(label, lines, i)) return false;
    lastDerivedNumber = n;
    return true;
  };
  const derivedLevel = () => Math.min(lastHeadingLevel + 1, 6);
  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ type: 'para', text: para.join(' ').replace(/\s+/g, ' ').trim() });
      para = [];
    }
  };
  const flushList = () => {
    if (list && list.items.length > 0) {
      // Depth is the rank of each item's indentation among the list's
      // distinct indents, so 2-space and 4-space nesting both work.
      const ranks = [...new Set(list.indents)].sort((a, b) => a - b);
      const depths = list.indents.map(indent => ranks.indexOf(indent));
      blocks.push(
        depths.some(depth => depth > 0)
          ? { type: list.type, items: list.items, depths }
          : { type: list.type, items: list.items }
      );
    }
    list = null;
    pendingBullets = 0;
  };
  const flushAll = () => {
    flushPara();
    flushList();
  };
  const ensureList = (type: OpenList['type']): OpenList => {
    if (!list || list.type !== type) {
      flushList();
      list = { type, items: [], indents: [] };
    }
    return list;
  };
  const addItem = (type: OpenList['type'], text: string, indent: number) => {
    flushPara();
    const open = ensureList(type);
    open.items.push(text.trim());
    open.indents.push(indent);
  };
  const pushTable = (rows: string[][], hasHeader: boolean) => {
    const text = rows
      .map(row => '| ' + row.map(cell => cell.replace(/\|/g, '\\|').replace(/\n/g, '<br>')).join(' | ') + ' |')
      .join('\n');
    blocks.push(hasHeader ? { type: 'table', rows, text } : { type: 'table', rows, text, hasHeader: false });
  };

  for (let i = 0; i < lines.length; i++) {
    const rawTrimmed = rawLines[i].trim();
    const line = lines[i].trim();
    const indent = lines[i].length - lines[i].trimStart().length;

    if (line === '') {
      // Blank lines end paragraphs. Lists stay open across them (the
      // messy extractions blank-line between every item) and close when
      // a non-list block starts.
      flushPara();
      continue;
    }

    // A separator row proves the author intended a table. Never guess columns
    // from whitespace: codes, descriptions, and fees can all contain spaces.
    if (isTableRow(rawTrimmed) && isTableRow(rawLines[i + 1] ?? '')) {
      let header = parseDocTableRow(rawTrimmed);
      const separator = parseDocTableRow(rawLines[i + 1]);
      if (separator.length === header.length && separator.every(cell => TABLE_SEPARATOR.test(cell))) {
        let body: string[][] = [];
        let end = i + 2;
        while (end < rawLines.length) {
          if (isBlank(rawLines[end]) && isTableRow(rawLines[end + 1] ?? '')) { end++; continue; }
          if (!isTableRow(rawLines[end])) break;
          // A row followed by its own separator starts the next table.
          if (isTableRow(rawLines[end + 1] ?? '') && parseDocTableRow(rawLines[end + 1]).every(cell => TABLE_SEPARATOR.test(cell))) break;
          const cells = parseDocTableRow(rawLines[end]);
          if (cells.length !== header.length) break;
          body.push(cells);
          end++;
        }
        let hasHeader = header.some(cell => cell !== '');
        // Google Docs exports an empty header row and puts the real header,
        // in bold, as the first body row.
        if (!hasHeader && body.length > 0 && isBoldRow(rawLines[i + 2])) {
          header = body[0];
          body = body.slice(1);
          hasHeader = true;
        }
        flushAll();
        pendingNumber = null;
        if (header.length === 1) {
          // A one-column table is a list; its header, when present, is its title.
          if (hasHeader) pushHeading(derivedLevel(), header[0], true);
          const items = body.map(row => row[0]).filter(Boolean);
          if (items.length > 0) blocks.push({ type: 'bullets', items });
        } else {
          pushTable(hasHeader ? [header, ...body] : [header.map(() => ''), ...body], hasHeader);
        }
        i = end - 1;
        continue;
      }
    }

    if (PAGE_NUMBER.test(line)) continue;

    if (LONE_BULLET.test(line)) {
      // The extraction put the bullet mark on its own line; the item's
      // text follows (possibly after more marks and blank lines).
      flushPara();
      ensureList('bullets');
      pendingBullets++;
      continue;
    }

    if (LONE_NUMBER.test(line)) {
      flushPara();
      pendingNumber = line;
      pendingBullets = 0;
      continue;
    }

    const md = line.match(MD_HEADING);
    if (md) {
      flushAll();
      pendingNumber = null;
      const text = (md[2] ?? '').trim();
      if (text) pushHeading(md[1].length, text);
      continue;
    }

    const bold = boldLabel(rawTrimmed, lines, i);

    if (pendingNumber !== null) {
      const number = pendingNumber;
      pendingNumber = null;
      const label = bold ?? line;
      if (numberedLabelIsHeading(number, label, i)) {
        flushAll();
        pushHeading(derivedLevel(), `${number} ${stripColon(label)}`, true);
      } else {
        addItem('numbered', label, indent);
      }
      continue;
    }

    if (bold !== null) {
      const numbered = bold.match(NUMBER_START);
      if (!numbered || numberedLabelIsHeading(numbered[0], bold.replace(NUMBER_START, ''), i)) {
        flushAll();
        pushHeading(derivedLevel(), bold, true);
        continue;
      }
      addItem('numbered', bold.replace(NUMBER_START, ''), indent);
      continue;
    }

    if (NUMBER_START.test(line)) {
      const rest = line.replace(NUMBER_START, '').trim();
      if (numberedLabelIsHeading(line.match(NUMBER_START)![0], rest, i)) {
        // "1. Work Schedule & Punctuality:" introduces the bullets beneath
        // it — a sub-section, not one item of a list that restarts at 1.
        flushAll();
        pushHeading(derivedLevel(), stripColon(line), true);
      } else {
        addItem('numbered', rest, indent);
      }
      continue;
    }

    if (BULLET_START.test(line)) {
      addItem('bullets', line.replace(BULLET_START, ''), indent);
      continue;
    }

    // Continuation of the previous list item (wrapped line)? A whole line in
    // bold is a statement of its own, and a line right after a bare list
    // mark is that mark's item, never the tail of the item before.
    const boldOnly = BOLD_LINE.test(rawTrimmed);
    const previous = (lines[i - 1] ?? '').trim();
    const followsMark = LONE_BULLET.test(previous) || LONE_NUMBER.test(previous);
    if (list && list.items.length > 0 && para.length === 0 && !boldOnly && !followsMark && previous !== '') {
      list.items[list.items.length - 1] = `${list.items[list.items.length - 1]} ${line}`.trim();
      continue;
    }

    if (pendingBullets > 0) {
      addItem('bullets', line, indent);
      pendingBullets--;
      continue;
    }
    // An extraction that lost a bullet mark: the line opens exactly like the
    // items above it ("I agree to…", "Employees must…").
    if (list && list.type === 'bullets' && para.length === 0 && sharesItemPrefix(list.items, line)) {
      addItem('bullets', line, indent);
      continue;
    }
    flushList();

    if (!hasMarkdownHeadings && looksLikeHeading(line, lines, i)) {
      flushPara();
      pushHeading(3, line);
      continue;
    }

    para.push(line);
  }
  flushAll();
  return blocks;
}
