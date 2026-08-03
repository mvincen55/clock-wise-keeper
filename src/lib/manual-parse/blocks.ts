/**
 * Stage 5 — build content blocks from classified lines.
 *
 * By this point furniture (headers, footers, page numbers) and TOC rows
 * are marked and headings are known. What remains is body text: merge
 * hard-wrapped lines back into paragraphs, reassemble bullet and numbered
 * lists, recognize simple column-aligned tables, and keep notices
 * distinct. Original wording is preserved exactly — only layout noise is
 * removed.
 */
import type { HeadingCandidate } from './headings';
import type { ManualLine, ParseConfidence } from './types';

export type ContentBlock =
  | { type: 'heading'; text: string; level: number; page: number; sectionKey: number }
  | { type: 'paragraph'; text: string; page: number; pageEnd: number }
  | { type: 'bullet_list'; items: string[]; page: number; pageEnd: number }
  | { type: 'numbered_list'; items: string[]; page: number; pageEnd: number }
  | { type: 'notice'; text: string; page: number; pageEnd: number }
  | {
      type: 'table';
      rows: string[][];
      headerRow: boolean;
      page: number;
      pageEnd: number;
      confidence: ParseConfidence;
    };

const BULLET_START = /^[•·▪◦‣>*]\s+|^[-–—]\s+/;
const LONE_BULLET = /^[•·▪◦‣o*-]$/;
const NUMBERED_START = /^\(?(\d{1,3})[.)]\s+/;
const NOTICE_START = /^(note|important|notice|reminder|warning|caution)[:\s—-]/i;
const SENTENCE_END = /[.!?:;]["')\]]?$/;

/** Column gap (PDF units) that separates table cells on one line. */
const CELL_GAP = 18;

interface ColumnarLine {
  line: ManualLine;
  cells: { x: number; text: string }[];
}

/** Split a line into cells wherever its items sit apart horizontally. */
function toCells(line: ManualLine): { x: number; text: string }[] {
  const cells: { x: number; text: string }[] = [];
  for (let i = 0; i < line.itemTexts.length; i++) {
    const x = line.itemXs[i];
    const text = line.itemTexts[i];
    const last = cells[cells.length - 1];
    if (last && x - (line.itemXs[i - 1] + estimateWidth(line, i - 1)) < CELL_GAP) {
      last.text = `${last.text} ${text}`.trim();
    } else {
      cells.push({ x, text });
    }
  }
  return cells;
}

/** Approximate an item's width when pdfjs merged fragments unevenly. */
function estimateWidth(line: ManualLine, index: number): number {
  const next = line.itemXs[index + 1];
  if (next !== undefined) {
    return Math.min(next - line.itemXs[index], line.itemTexts[index].length * line.fontSize * 0.55);
  }
  return line.itemTexts[index].length * line.fontSize * 0.55;
}

/** Two rows belong to one table when most cell columns line up. */
function columnsAlign(a: ColumnarLine, b: ColumnarLine): boolean {
  const tolerance = 14;
  let aligned = 0;
  for (const cell of b.cells) {
    if (a.cells.some(c => Math.abs(c.x - cell.x) <= tolerance)) aligned += 1;
  }
  return aligned >= 2 && aligned >= Math.min(a.cells.length, b.cells.length);
}

/**
 * Build blocks for one page's body lines. `headingLines` maps a line to
 * its heading candidate; `sectionKey` is the candidate's index so the
 * sectionizer can associate blocks with sections without re-matching.
 */
export function buildBlocks(
  pageLines: ManualLine[][],
  headings: HeadingCandidate[]
): ContentBlock[] {
  const headingByLine = new Map<ManualLine, { h: HeadingCandidate; index: number }>();
  headings.forEach((h, index) => headingByLine.set(h.line, { h, index }));

  const blocks: ContentBlock[] = [];
  let para: { text: string; page: number; pageEnd: number } | null = null;
  let list: { type: 'bullet_list' | 'numbered_list'; items: string[]; page: number; pageEnd: number } | null =
    null;
  let pendingBullet = false;
  let table: { rows: ColumnarLine[]; page: number } | null = null;

  const flushPara = () => {
    if (para) {
      blocks.push({ type: 'paragraph', text: para.text, page: para.page, pageEnd: para.pageEnd });
      para = null;
    }
  };
  const flushList = () => {
    if (list && list.items.length > 0) {
      blocks.push({ ...list, items: list.items.map(i => i.trim()).filter(Boolean) });
    }
    list = null;
    pendingBullet = false;
  };
  const flushTable = () => {
    if (!table) return;
    const t = table;
    table = null;
    if (t.rows.length < 3) {
      // Not enough evidence for a table — the "rows" were probably just
      // spaced-out prose. Re-run them through the paragraph path.
      for (const row of t.rows) appendProse(row.line);
      return;
    }
    const widths = t.rows.map(r => r.cells.length);
    const maxWidth = Math.max(...widths);
    const ragged = widths.filter(w => w !== maxWidth).length / t.rows.length;
    blocks.push({
      type: 'table',
      rows: t.rows.map(r => r.cells.map(c => c.text)),
      // First row is a header when it aligns with the columns but reads
      // differently (no digits where the body has digits, or all short).
      headerRow: !/\d/.test(t.rows[0].cells.map(c => c.text).join(' ')),
      page: t.page,
      pageEnd: t.rows[t.rows.length - 1].line.page,
      confidence: ragged > 0.34 ? 'low' : ragged > 0.1 ? 'medium' : 'high',
    });
  };
  const flushAll = () => {
    // Table first: an under-evidenced "table" re-enters the open paragraph
    // as prose, so it must run before the paragraph flushes.
    flushTable();
    flushPara();
    flushList();
  };

  const appendProse = (line: ManualLine) => {
    const text = line.text;
    if (para) {
      para.text = `${para.text} ${text}`.replace(/\s+/g, ' ').trim();
      para.pageEnd = line.page;
      if (SENTENCE_END.test(text)) {
        // Keep paragraphs bounded — flush at sentence ends once they get
        // long, so a whole page never fuses into one wall of text.
        if (para.text.length > 700) flushPara();
      }
    } else {
      para = { text, page: line.page, pageEnd: line.page };
    }
  };

  for (const lines of pageLines) {
    const bodyLines = lines.filter(
      l => l.kind === 'body' || l.kind === 'heading' || headingByLine.has(l)
    );
    for (let i = 0; i < bodyLines.length; i++) {
      const line = bodyLines[i];
      const heading = headingByLine.get(line);

      if (heading) {
        flushAll();
        blocks.push({
          type: 'heading',
          text: heading.h.text,
          level: heading.h.level,
          page: heading.h.page,
          sectionKey: heading.index,
        });
        continue;
      }

      const text = line.text;

      // ---- tables: consecutive multi-cell lines with aligned columns ----
      const cells = toCells(line);
      if (cells.length >= 2 && !BULLET_START.test(text) && !NUMBERED_START.test(text)) {
        const columnar: ColumnarLine = { line, cells };
        if (table && columnsAlign(table.rows[table.rows.length - 1], columnar)) {
          table.rows.push(columnar);
          continue;
        }
        flushTable();
        if (!para && !list) {
          table = { rows: [columnar], page: line.page };
          continue;
        }
        // Inside a paragraph/list, a lone columnar line is just spacing.
      } else {
        flushTable();
      }

      // ---- lists ----
      if (LONE_BULLET.test(text)) {
        flushTable();
        flushPara();
        if (!list || list.type !== 'bullet_list') {
          flushList();
          list = { type: 'bullet_list', items: [], page: line.page, pageEnd: line.page };
        }
        pendingBullet = true;
        continue;
      }
      if (pendingBullet && list) {
        list.items.push(text);
        list.pageEnd = line.page;
        pendingBullet = false;
        continue;
      }
      if (BULLET_START.test(text)) {
        flushTable();
        flushPara();
        if (!list || list.type !== 'bullet_list') {
          flushList();
          list = { type: 'bullet_list', items: [], page: line.page, pageEnd: line.page };
        }
        list.items.push(text.replace(BULLET_START, '').trim());
        list.pageEnd = line.page;
        continue;
      }
      if (NUMBERED_START.test(text) && text.length <= 400) {
        flushTable();
        flushPara();
        if (!list || list.type !== 'numbered_list') {
          flushList();
          list = { type: 'numbered_list', items: [], page: line.page, pageEnd: line.page };
        }
        list.items.push(text.replace(NUMBERED_START, '').trim());
        list.pageEnd = line.page;
        continue;
      }
      // Wrapped continuation of the previous list item.
      if (list && list.items.length > 0 && !SENTENCE_END.test(list.items[list.items.length - 1])) {
        list.items[list.items.length - 1] = `${list.items[list.items.length - 1]} ${text}`.trim();
        list.pageEnd = line.page;
        continue;
      }
      flushList();

      // ---- notices ----
      if (NOTICE_START.test(text)) {
        flushTable();
        flushPara();
        // Pull the notice's wrapped lines in until a sentence ends.
        let notice = text;
        let pageEnd = line.page;
        while (
          i + 1 < bodyLines.length &&
          !headingByLine.has(bodyLines[i + 1]) &&
          !SENTENCE_END.test(notice) &&
          notice.length < 600
        ) {
          i += 1;
          notice = `${notice} ${bodyLines[i].text}`.replace(/\s+/g, ' ').trim();
          pageEnd = bodyLines[i].page;
        }
        blocks.push({ type: 'notice', text: notice, page: line.page, pageEnd });
        continue;
      }

      appendProse(line);
    }
    // Paragraphs may continue across a page break only when the text is
    // clearly mid-sentence; otherwise the break ends the paragraph.
    if (para !== null && SENTENCE_END.test((para as { text: string }).text)) flushPara();
  }
  flushAll();
  return blocks;
}
