/**
 * Stage 2 — find the furniture: repeated page headers/footers, standalone
 * page numbers, and the printed→physical page mapping.
 *
 * A line is furniture when the SAME text (digits normalized away) recurs
 * in the same band — top or bottom of the page — across a meaningful share
 * of pages. Carrier manuals repeat their name, the manual title, and the
 * carrier's address on every page; none of that is content, and none of it
 * may become a section.
 */
import type { ManualLine } from './types';

/** Top/bottom share of the page height treated as the furniture bands. */
const TOP_BAND = 0.16;
const BOTTOM_BAND = 0.84;

const PAGE_NUMBER_ONLY = /^(?:page\s+)?\d{1,4}(?:\s+of\s+\d{1,4})?$/i;
/** "12 | Delta Dental" / "Delta Dental | 12" style furniture lines. */
const PAGE_NUMBER_EDGE = /^(\d{1,4})\s*[|·—-]\s+.{1,80}$|^.{1,80}\s+[|·—-]\s*(\d{1,4})$/;

export const normalizeRepeatKey = (text: string): string =>
  text
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/[^\p{L}#]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export interface RepeatScan {
  /** Normalized keys of repeated top-band lines. */
  headerKeys: Set<string>;
  /** Normalized keys of repeated bottom-band lines. */
  footerKeys: Set<string>;
  /** Representative original text per removed key (for the parse report). */
  removedHeaders: string[];
  removedFooters: string[];
  /** printed page number → physical page number. */
  printedToPhysical: Map<number, number>;
}

/**
 * Detect repeated headers/footers and page numbers, and MARK the lines
 * in place (kind: header/footer/page_number). Returns the scan summary.
 */
export function classifyRepeats(pageLines: ManualLine[][], pageHeight: number): RepeatScan {
  const pageCount = pageLines.length;
  // On a short document nothing repeats "enough" — require at least 3 hits
  // and a quarter of pages, so a phrase reused twice in prose survives.
  const threshold = Math.max(3, Math.ceil(pageCount * 0.25));

  const topCounts = new Map<string, { count: number; sample: string }>();
  const bottomCounts = new Map<string, { count: number; sample: string }>();

  const bandOf = (line: ManualLine): 'top' | 'bottom' | null => {
    if (line.y <= pageHeight * TOP_BAND) return 'top';
    if (line.y >= pageHeight * BOTTOM_BAND) return 'bottom';
    return null;
  };

  for (const lines of pageLines) {
    // Count each key once per page so a two-line address block still
    // counts page-wise, not line-wise.
    const seenTop = new Set<string>();
    const seenBottom = new Set<string>();
    for (const line of lines) {
      const band = bandOf(line);
      if (!band) continue;
      const key = normalizeRepeatKey(line.text);
      if (key.length < 3) continue;
      const bucket = band === 'top' ? topCounts : bottomCounts;
      const seen = band === 'top' ? seenTop : seenBottom;
      if (seen.has(key)) continue;
      seen.add(key);
      const entry = bucket.get(key) ?? { count: 0, sample: line.text };
      entry.count += 1;
      bucket.set(key, entry);
    }
  }

  const headerKeys = new Set<string>();
  const removedHeaders: string[] = [];
  for (const [key, { count, sample }] of topCounts) {
    if (count >= threshold) {
      headerKeys.add(key);
      removedHeaders.push(sample);
    }
  }
  const footerKeys = new Set<string>();
  const removedFooters: string[] = [];
  for (const [key, { count, sample }] of bottomCounts) {
    if (count >= threshold) {
      footerKeys.add(key);
      removedFooters.push(sample);
    }
  }

  const printedToPhysical = new Map<number, number>();

  for (const lines of pageLines) {
    for (const line of lines) {
      const band = bandOf(line);
      const key = normalizeRepeatKey(line.text);

      if (band && PAGE_NUMBER_ONLY.test(line.text)) {
        line.kind = 'page_number';
        const printed = parseInt(line.text.replace(/\D+/g, ' ').trim().split(' ')[0], 10);
        if (Number.isFinite(printed) && !printedToPhysical.has(printed)) {
          printedToPhysical.set(printed, line.page);
        }
        continue;
      }
      if (band && PAGE_NUMBER_EDGE.test(line.text)) {
        // A "12 | Manual name" line is furniture even when the wording
        // varies too much to repeat-match.
        line.kind = band === 'top' ? 'header' : 'footer';
        const match = line.text.match(PAGE_NUMBER_EDGE);
        const printed = parseInt(match?.[1] ?? match?.[2] ?? '', 10);
        if (Number.isFinite(printed) && !printedToPhysical.has(printed)) {
          printedToPhysical.set(printed, line.page);
        }
        continue;
      }
      if (band === 'top' && headerKeys.has(key)) {
        line.kind = 'header';
        continue;
      }
      if (band === 'bottom' && footerKeys.has(key)) {
        line.kind = 'footer';
      }
    }
  }

  return { headerKeys, footerKeys, removedHeaders, removedFooters, printedToPhysical };
}

/** Resolve a printed page reference to a physical page (identity fallback). */
export function resolvePrintedPage(
  printed: number,
  printedToPhysical: Map<number, number>
): number {
  const direct = printedToPhysical.get(printed);
  if (direct !== undefined) return direct;
  // Fall back to the dominant offset between printed and physical numbers,
  // so unmapped references still land near the right page.
  if (printedToPhysical.size >= 2) {
    const offsets = new Map<number, number>();
    for (const [p, physical] of printedToPhysical) {
      const offset = physical - p;
      offsets.set(offset, (offsets.get(offset) ?? 0) + 1);
    }
    let bestOffset = 0;
    let bestCount = -1;
    for (const [offset, count] of offsets) {
      if (count > bestCount) {
        bestOffset = offset;
        bestCount = count;
      }
    }
    return printed + bestOffset;
  }
  return printed;
}
