/**
 * Stage 1 — assemble positioned text items into visual lines.
 *
 * PDF text arrives as fragments in draw order, not reading order. Items
 * that share a baseline (within a tolerance scaled to the font size)
 * belong to one line; sorting each line's fragments by x restores the
 * reading order, and the gap between fragments decides whether they join
 * seamlessly or with a space.
 */
import type { ManualLine, PdfPageText, PdfTextItem } from './types';

/** Fragments whose baselines differ by less than this share a line. */
const baselineTolerance = (fontSize: number): number => Math.max(2.5, fontSize * 0.45);

/** A gap wider than ~half a character means the PDF omitted the space. */
const needsSpace = (gap: number, fontSize: number): boolean => gap > Math.max(1, fontSize * 0.12);

export function assemblePageLines(page: PdfPageText): ManualLine[] {
  const items = page.items
    .filter(item => item.str.trim() !== '')
    .slice()
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const groups: PdfTextItem[][] = [];
  for (const item of items) {
    const current = groups[groups.length - 1];
    if (
      current &&
      Math.abs(item.y - current[0].y) <= baselineTolerance(Math.max(item.fontSize, current[0].fontSize))
    ) {
      current.push(item);
    } else {
      groups.push([item]);
    }
  }

  return groups.map(group => {
    const sorted = group.slice().sort((a, b) => a.x - b.x);
    let text = '';
    let cursorEnd = Number.NEGATIVE_INFINITY;
    const itemXs: number[] = [];
    const itemTexts: string[] = [];
    for (const item of sorted) {
      const fragment = item.str.replace(/\s+/g, ' ').trim();
      if (!fragment) continue;
      if (text !== '') {
        const gap = item.x - cursorEnd;
        text += needsSpace(gap, item.fontSize) || /\s$/.test(item.str) ? ' ' : '';
      }
      itemXs.push(item.x);
      itemTexts.push(fragment);
      text += fragment;
      cursorEnd = item.x + item.width;
    }
    const fontSize = Math.max(...sorted.map(i => i.fontSize));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    return {
      text: text.trim(),
      page: page.pageNumber,
      x: first.x,
      y: first.y,
      width: last.x + last.width - first.x,
      fontSize,
      itemXs,
      itemTexts,
      kind: 'body' as const,
    };
  }).filter(line => line.text !== '');
}

export function assembleLines(pages: PdfPageText[]): ManualLine[][] {
  return pages.map(assemblePageLines);
}

/**
 * The document's body font size — the mode of line font sizes weighted by
 * text length, so a page of large headings can't outvote the running text.
 */
export function bodyFontSize(pageLines: ManualLine[][]): number {
  const weights = new Map<number, number>();
  for (const lines of pageLines) {
    for (const line of lines) {
      const size = Math.round(line.fontSize * 2) / 2;
      weights.set(size, (weights.get(size) ?? 0) + line.text.length);
    }
  }
  let best = 10;
  let bestWeight = -1;
  for (const [size, weight] of weights) {
    if (weight > bestWeight) {
      best = size;
      bestWeight = weight;
    }
  }
  return best;
}
