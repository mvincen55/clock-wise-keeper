/**
 * Stage 4 — detect real section headings and reconcile them with the TOC.
 *
 * A heading earns the label through layout evidence — font size above the
 * body text, ALL-CAPS emphasis, outline numbering — never just "short
 * line", which is how carrier addresses used to become sections. When a
 * parsed TOC exists it is the authority for the top-level structure: TOC
 * entries are matched to detected headings (or anchored to their target
 * page), and headings the TOC doesn't know about become subsections.
 */
import type { ManualLine, TocEntry } from './types';

const OUTLINE_NUMBERING = /^(\d+(?:\.\d+)*)[.)]?\s+\S/;
/** CDT procedure codes ("D2740 Crown — …") are table rows, never headings. */
const CDT_CODE = /^D\d{4}\b/;
const ENDS_LIKE_PROSE = /[.,;:]$/;
const MONEY_OR_DATE = /\$\d|%|\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/;

export interface HeadingCandidate {
  line: ManualLine;
  page: number;
  text: string;
  level: number;
  /** True when the heading came from / was confirmed by the TOC. */
  fromToc: boolean;
}

const letters = (text: string): string => text.replace(/[^\p{L}]+/gu, '');

const isMostlyCaps = (text: string): boolean => {
  const alpha = letters(text);
  if (alpha.length < 4) return false;
  const caps = alpha.replace(/[^\p{Lu}]+/gu, '');
  return caps.length / alpha.length >= 0.8;
};

/** Loose title equality: case/punctuation/numbering-insensitive. */
export const normalizeTitle = (text: string): string =>
  text
    .toLowerCase()
    .replace(/^\d+(\.\d+)*[.)]?\s+/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const titlesMatch = (a: string, b: string): boolean => {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  // One side may carry a suffix the other lacks ("Glossary" vs "Glossary
  // of Terms") — accept containment for reasonably long titles.
  if (na.length >= 6 && nb.length >= 6 && (na.includes(nb) || nb.includes(na))) return true;
  // Token overlap for wrapped/abbreviated titles.
  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  const shared = [...ta].filter(t => tb.has(t)).length;
  return shared >= 2 && shared / Math.min(ta.size, tb.size) >= 0.7;
};

/**
 * Detect heading candidates from layout. Levels come from font-size tiers
 * (largest = 1); outline numbering depth refines within a tier.
 */
export function detectHeadings(
  pageLines: ManualLine[][],
  bodySize: number
): HeadingCandidate[] {
  interface Raw {
    line: ManualLine;
    size: number;
    numbered: string | null;
  }
  const raws: Raw[] = [];

  for (const lines of pageLines) {
    for (const line of lines) {
      if (line.kind !== 'body') continue;
      const text = line.text;
      if (text.length < 3 || text.length > 110) continue;
      if (ENDS_LIKE_PROSE.test(text)) continue;
      if (CDT_CODE.test(text)) continue;
      if (MONEY_OR_DATE.test(text)) continue;
      if (!/^[\p{Lu}\p{N}"“]/u.test(text)) continue;
      if (/^[•·▪◦*-]/.test(text)) continue;

      const sizeRatio = line.fontSize / bodySize;
      const numbered = text.match(OUTLINE_NUMBERING)?.[1] ?? null;
      const emphatic = sizeRatio >= 1.12;
      const caps = isMostlyCaps(text) && text.length <= 80;
      // Layout evidence required: bigger font, or caps emphasis, or outline
      // numbering at body size (e.g. "4.2 Claim Documentation").
      if (!emphatic && !caps && !(numbered && sizeRatio >= 0.98)) continue;
      // Numbered lines that read like list items ("1. Submit the claim …")
      // are only headings when they carry other emphasis.
      if (numbered && !numbered.includes('.') && !emphatic && !caps) continue;

      raws.push({ line, size: Math.round(line.fontSize * 2) / 2, numbered });
    }
  }
  if (raws.length === 0) return [];

  // Font-size tiers: distinct sizes above body size, descending → levels.
  const tierSizes = [...new Set(raws.filter(r => r.size > bodySize * 1.05).map(r => r.size))]
    .sort((a, b) => b - a)
    .slice(0, 3);

  return raws.map(({ line, size, numbered }) => {
    const tier = tierSizes.indexOf(size);
    let level = tier >= 0 ? tier + 1 : tierSizes.length > 0 ? tierSizes.length + 1 : 1;
    if (numbered && numbered.includes('.')) {
      level = Math.max(level, Math.min(4, numbered.split('.').length));
    }
    return { line, page: line.page, text: line.text, level: Math.min(4, level), fromToc: false };
  });
}

export interface TocReconciliation {
  headings: HeadingCandidate[];
  /** Share of TOC entries confirmed by a detected heading (0–1). */
  matchRate: number;
}

/**
 * Reconcile TOC entries with detected headings. Matched headings adopt the
 * TOC's level and are marked authoritative; unmatched TOC entries become
 * synthetic headings anchored to the top of their target page, so the
 * navigation never loses a section the carrier lists.
 */
export function reconcileWithToc(
  headings: HeadingCandidate[],
  toc: TocEntry[],
  pageLines: ManualLine[][]
): TocReconciliation {
  if (toc.length === 0) return { headings, matchRate: 0 };

  const used = new Set<HeadingCandidate>();
  let matched = 0;
  const fromToc: HeadingCandidate[] = [];

  for (const entry of toc) {
    // A heading anywhere from one page before to two pages after the TOC's
    // target — printed/physical drift and long sections both happen.
    const candidate = headings.find(
      h =>
        !used.has(h) &&
        h.page >= entry.targetPage - 1 &&
        h.page <= entry.targetPage + 2 &&
        titlesMatch(h.text, entry.title)
    ) ??
      // Fall back to a title match anywhere — some TOCs' printed numbers
      // drift badly, and a unique title is still trustworthy.
      headings.find(h => !used.has(h) && titlesMatch(h.text, entry.title));

    if (candidate) {
      used.add(candidate);
      matched += 1;
      entry.headingIndex = fromToc.length;
      fromToc.push({ ...candidate, level: entry.level, fromToc: true });
      continue;
    }

    // No visual heading found (e.g. the section title rendered at body
    // size): anchor a synthetic heading to the first body line of the
    // target page so the section still exists and jumps still work.
    const pageIndex = pageLines.findIndex(
      lines => lines.length > 0 && lines[0].page === entry.targetPage
    );
    if (pageIndex >= 0) {
      const anchor = pageLines[pageIndex].find(l => l.kind === 'body');
      if (anchor) {
        entry.headingIndex = fromToc.length;
        fromToc.push({
          line: anchor,
          page: entry.targetPage,
          text: entry.title,
          level: entry.level,
          fromToc: true,
        });
      }
    }
  }

  // Headings the TOC doesn't know about stay as subsections (never above
  // the TOC's own levels).
  const maxTocLevel = Math.max(...toc.map(e => e.level));
  const extras = headings
    .filter(h => !used.has(h))
    .map(h => ({ ...h, level: Math.max(h.level, maxTocLevel + 1) }));

  const all = [...fromToc, ...extras].sort(
    (a, b) => a.page - b.page || a.line.y - b.line.y
  );

  // Dedupe: a synthetic TOC anchor and a detected heading can share a line.
  const seen = new Set<ManualLine>();
  const deduped: HeadingCandidate[] = [];
  for (const h of all) {
    if (seen.has(h.line)) {
      // Prefer the TOC's version of a duplicated heading.
      if (h.fromToc) {
        const i = deduped.findIndex(d => d.line === h.line);
        if (i >= 0) deduped[i] = h;
      }
      continue;
    }
    seen.add(h.line);
    deduped.push(h);
  }

  return { headings: deduped, matchRate: matched / toc.length };
}
