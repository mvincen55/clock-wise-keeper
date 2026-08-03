/**
 * Stage 3 — find and parse table-of-contents pages.
 *
 * A TOC page announces itself ("Table of Contents" / "Contents") or is
 * dominated by leader lines — "Section title ....... 12". Those rows are
 * navigation data, not body text: they are parsed into entries (title,
 * printed page, nesting level) and the lines are marked so they never
 * render as content, and never count as sections.
 */
import { resolvePrintedPage } from './repeats';
import type { ManualLine, TocEntry } from './types';

const TOC_TITLE = /^(table\s+of\s+)?contents$/i;
/** "Title ..... 12" — a run of ≥3 leader dots before a page number. */
const LEADER_ENTRY = /^(.{2,140}?)\s*[.·․…]{3,}\s*(\d{1,4})$/;
/** "Title    12" — no leaders, but a clear gap before a trailing number. */
const GAP_ENTRY = /^(.{2,140}?)\s{2,}(\d{1,4})$/;
const NUMBERING = /^(\d+(?:\.\d+)*)[.)]?\s+/;

export interface TocScan {
  entries: TocEntry[];
  tocPages: number[];
}

interface RawEntry {
  title: string;
  printedPage: number;
  x: number;
  page: number;
}

const cleanTitle = (raw: string): string =>
  raw
    .replace(/[.·․…]{2,}\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Parse one line as a TOC entry, tolerating split leader/number items. */
function parseEntryLine(line: ManualLine): RawEntry | null {
  const viaLeader = line.text.match(LEADER_ENTRY);
  const match = viaLeader ?? line.text.match(GAP_ENTRY);
  if (!match) {
    // pdfjs often splits "title", "......", "12" into separate items on
    // one line; the joined text then lacks the double space the regexes
    // need. Fall back to item-level structure: last item numeric, earlier
    // items carry the title.
    const texts = line.itemTexts;
    if (texts.length >= 2 && /^\d{1,4}$/.test(texts[texts.length - 1])) {
      const title = cleanTitle(texts.slice(0, -1).join(' '));
      if (title.length >= 2 && !/^\d+$/.test(title)) {
        return {
          title,
          printedPage: parseInt(texts[texts.length - 1], 10),
          x: line.x,
          page: line.page,
        };
      }
    }
    return null;
  }
  const title = cleanTitle(match[1]);
  if (title.length < 2 || /^\d+$/.test(title)) return null;
  return { title, printedPage: parseInt(match[2], 10), x: line.x, page: line.page };
}

/**
 * Detect TOC pages, mark their lines, and parse the entries.
 * Mutates line kinds (toc_title / toc_entry) like the other passes.
 */
export function detectToc(
  pageLines: ManualLine[][],
  printedToPhysical: Map<number, number>
): TocScan {
  const tocPages: number[] = [];
  const raw: RawEntry[] = [];

  // Only the front of the document can host a TOC — a fee table late in
  // the manual can look leader-like but must stay content.
  const frontLimit = Math.max(8, Math.ceil(pageLines.length * 0.25));

  let previousWasToc = false;
  for (const lines of pageLines) {
    if (lines.length === 0) continue;
    const pageNumber = lines[0].page;
    if (pageNumber > frontLimit && !previousWasToc) break;

    const body = lines.filter(l => l.kind === 'body');
    const titled = body.find(l => TOC_TITLE.test(l.text.trim()));
    const entryLines = body.filter(l => parseEntryLine(l) !== null);
    // A TOC page either says so, or is mostly entries; continuation pages
    // (TOC spilling past one page) only need a majority of entries.
    const share = body.length > 0 ? entryLines.length / body.length : 0;
    const isToc =
      (titled !== undefined && entryLines.length >= 2) ||
      (entryLines.length >= 4 && share >= 0.5) ||
      (previousWasToc && entryLines.length >= 2 && share >= 0.4);
    previousWasToc = isToc;
    if (!isToc) continue;

    tocPages.push(pageNumber);
    if (titled) titled.kind = 'toc_title';
    let pendingTitle: string | null = null;
    for (const line of body) {
      const entry = parseEntryLine(line);
      if (entry) {
        line.kind = 'toc_entry';
        raw.push(
          pendingTitle ? { ...entry, title: cleanTitle(`${pendingTitle} ${entry.title}`) } : entry
        );
        pendingTitle = null;
      } else if (line !== titled && line.text.length <= 120 && !/[.:;]$/.test(line.text)) {
        // A wrapped entry: its first half sits alone, the leaders and the
        // number land on the following line. Held only within the page.
        line.kind = 'toc_entry';
        pendingTitle = pendingTitle ? `${pendingTitle} ${line.text}` : line.text;
      } else {
        pendingTitle = null;
      }
    }
  }

  if (raw.length < 3) return { entries: [], tocPages: [] };

  // Nesting level: explicit numbering depth wins; otherwise indentation
  // relative to the leftmost entry column.
  const minX = Math.min(...raw.map(e => e.x));
  const entries: TocEntry[] = raw.map(e => {
    const numbering = e.title.match(NUMBERING);
    const level = numbering
      ? Math.min(3, numbering[1].split('.').length)
      : e.x - minX > 12
        ? 2
        : 1;
    return {
      title: e.title,
      printedPage: e.printedPage,
      targetPage: resolvePrintedPage(e.printedPage, printedToPhysical),
      level,
    };
  });

  // A TOC that jumps around wildly is probably a misread fee table —
  // require the printed pages to be non-decreasing for most entries.
  let ordered = 0;
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].printedPage >= entries[i - 1].printedPage) ordered += 1;
  }
  if (ordered / Math.max(1, entries.length - 1) < 0.7) {
    return { entries: [], tocPages: [] };
  }

  return { entries, tocPages };
}
