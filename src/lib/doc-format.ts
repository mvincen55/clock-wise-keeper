/**
 * Turns stored office-document text into renderable blocks. Handles both
 * clean Markdown (new uploads — ingest-doc extracts structure) and the
 * messy plain text of earlier extractions: hard-wrapped lines merge back
 * into paragraphs, stray page numbers and lone bullet marks disappear,
 * bullet/numbered items reassemble, and short standalone lines become
 * headings.
 */

export type DocBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'para'; text: string }
  | { type: 'bullets'; items: string[] }
  | { type: 'numbered'; items: string[] };

const PAGE_NUMBER = /^\d{1,3}$/;
const LONE_BULLET = /^[•·▪◦o*-]$/;
const MD_HEADING = /^(#{1,4})\s+(.*)$/;
const BULLET_START = /^[•·▪◦]\s+|^[-*]\s+/;
const NUMBER_START = /^\d{1,2}[.)]\s+/;
const SHORT = 60;

const isBlank = (line: string) => line.trim() === '';

/** Heading heuristic for plain-text lines (see module comment). */
function looksLikeHeading(line: string, next: string | undefined): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > SHORT) return false;
  if (/[.,;:!?]$/.test(t)) return false;
  if (!/^[A-Z0-9]/.test(t)) return false;
  // A heading introduces something longer than itself — a long line, a
  // list, or a break. Short-line neighbors mean we're inside a block of
  // short lines (a letterhead/address), not at a heading.
  if (next === undefined || isBlank(next)) return true;
  const n = next.trim();
  return n.length > SHORT || BULLET_START.test(n) || LONE_BULLET.test(n) || NUMBER_START.test(n);
}

export function parseDocBlocks(content: string): DocBlock[] {
  const lines = content.replace(/\r\n?/g, '\n').split('\n');
  const blocks: DocBlock[] = [];
  let para: string[] = [];
  let listItems: string[] | null = null;
  let listType: 'bullets' | 'numbered' = 'bullets';
  let pendingBullet = false;

  const flushPara = () => {
    if (para.length > 0) {
      blocks.push({ type: 'para', text: para.join(' ').replace(/\s+/g, ' ').trim() });
      para = [];
    }
  };
  const flushList = () => {
    if (listItems && listItems.length > 0) {
      blocks.push({ type: listType, items: listItems });
    }
    listItems = null;
  };
  const flushAll = () => {
    flushPara();
    flushList();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    if (isBlank(line)) {
      // Blank lines end paragraphs. Lists stay open across them (the
      // messy extractions blank-line between every item) and close when
      // a non-list block starts.
      flushPara();
      continue;
    }
    if (PAGE_NUMBER.test(line)) continue;
    if (LONE_BULLET.test(line)) {
      // The extraction put the bullet mark on its own line; the item's
      // text follows.
      flushPara();
      pendingBullet = true;
      if (!listItems) {
        listItems = [];
        listType = 'bullets';
      }
      continue;
    }

    const md = line.match(MD_HEADING);
    if (md) {
      flushAll();
      pendingBullet = false;
      blocks.push({ type: 'heading', level: md[1].length, text: md[2].trim() });
      continue;
    }

    if (pendingBullet) {
      listItems!.push(line);
      pendingBullet = false;
      continue;
    }

    if (BULLET_START.test(line)) {
      flushPara();
      if (!listItems || listType !== 'bullets') {
        flushList();
        listItems = [];
        listType = 'bullets';
      }
      listItems.push(line.replace(BULLET_START, '').trim());
      continue;
    }

    if (NUMBER_START.test(line)) {
      flushPara();
      if (!listItems || listType !== 'numbered') {
        flushList();
        listItems = [];
        listType = 'numbered';
      }
      listItems.push(line.replace(NUMBER_START, '').trim());
      continue;
    }

    // Continuation of the previous list item (wrapped line)?
    if (listItems && listItems.length > 0 && para.length === 0 && !isBlank(lines[i - 1] ?? '')) {
      listItems[listItems.length - 1] = `${listItems[listItems.length - 1]} ${line}`.trim();
      continue;
    }
    flushList();

    if (looksLikeHeading(line, lines[i + 1])) {
      flushPara();
      blocks.push({ type: 'heading', level: 3, text: line });
      continue;
    }

    para.push(line);
  }
  flushAll();
  return blocks;
}
