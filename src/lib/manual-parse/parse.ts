/**
 * Stages 6–8 — the orchestrator. Runs line assembly, furniture removal,
 * TOC detection, heading detection and reconciliation, block building;
 * then folds blocks into sections and typed chunks, scores parsing
 * confidence, and detects document metadata (title, carrier, manual type,
 * effective date).
 *
 * The honesty rule runs through everything: when the document resists
 * sectioning (one heading across a long PDF), the parse FALLS BACK to
 * page-based navigation and says so via navMode/confidence — it never
 * pretends a 100-page manual is one section.
 */
import { buildBlocks, type ContentBlock } from './blocks';
import { detectHeadings, reconcileWithToc } from './headings';
import { assembleLines, bodyFontSize } from './lines';
import { classifyRepeats } from './repeats';
import { detectToc } from './toc';
import type {
  ManualChunk,
  ManualLine,
  ManualParseMeta,
  ManualSection,
  ParseConfidence,
  ParsedManual,
  PdfPageText,
  SectionOverrides,
  TocEntry,
} from './types';
import { PARSER_VERSION } from './types';

/** Target size for a stored content chunk (search + reader granularity). */
const CHUNK_TARGET_CHARS = 1500;

export const slugify = (text: string): string =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'section';

// ---------------------------------------------------------------------------
// Metadata detection
// ---------------------------------------------------------------------------

const KNOWN_CARRIERS = [
  'delta dental',
  'metlife',
  'cigna',
  'aetna',
  'guardian',
  'united concordia',
  'humana',
  'blue cross blue shield',
  'bcbs',
  'anthem',
  'principal',
  'ameritas',
  'renaissance',
  'dentaquest',
  'mcna',
  'liberty dental',
  'careington',
  'unitedhealthcare',
];

const MONTHS =
  'January|February|March|April|May|June|July|August|September|October|November|December';
const LONG_DATE = new RegExp(`(${MONTHS})\\s+(\\d{1,2}),?\\s+(\\d{4})`, 'i');
const SLASH_DATE = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/;

function detectEffectiveDate(text: string): string | null {
  // Prefer a date introduced by "effective"; fall back to a bare long date
  // on the cover.
  const effective = text.match(
    new RegExp(`effective(?:\\s+date)?[:\\s]+(?:(${MONTHS})\\s+(\\d{1,2}),?\\s+(\\d{4})|(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4}))`, 'i')
  );
  const source = effective
    ? effective[0]
    : (text.match(LONG_DATE)?.[0] ?? '');
  if (!source) return null;
  const long = source.match(LONG_DATE);
  if (long) {
    const month = `${MONTHS}`.toLowerCase().split('|').indexOf(long[1].toLowerCase()) + 1;
    return `${long[3]}-${String(month).padStart(2, '0')}-${String(parseInt(long[2], 10)).padStart(2, '0')}`;
  }
  const slash = source.match(SLASH_DATE);
  if (slash) {
    return `${slash[3]}-${slash[1].padStart(2, '0')}-${slash[2].padStart(2, '0')}`;
  }
  return null;
}

function detectMetadata(
  pageLines: ManualLine[][],
  bodySize: number
): Pick<
  ManualParseMeta,
  'detectedTitle' | 'detectedCarrier' | 'detectedManualType' | 'detectedEffectiveDate'
> {
  const frontLines = pageLines.slice(0, 3).flat();
  const frontText = frontLines.map(l => l.text).join('\n');

  // Title: the biggest text near the top of page one, joined across
  // adjacent lines sharing that size.
  let detectedTitle: string | null = null;
  const first = pageLines[0] ?? [];
  if (first.length > 0) {
    const maxSize = Math.max(...first.map(l => l.fontSize));
    if (maxSize >= bodySize * 1.15) {
      detectedTitle =
        first
          .filter(l => l.fontSize >= maxSize * 0.9)
          .slice(0, 3)
          .map(l => l.text)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim() || null;
    }
  }

  let detectedCarrier: string | null = null;
  for (const carrier of KNOWN_CARRIERS) {
    // Capture the document's own casing/suffix: "Delta Dental of Massachusetts".
    const pattern = new RegExp(
      `${carrier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s+of\\s+[A-Z][A-Za-z ]{2,30})?`,
      'i'
    );
    const match = frontText.match(pattern);
    if (match) {
      detectedCarrier = match[0].replace(/\s+/g, ' ').trim();
      break;
    }
  }

  const typeMatch = frontText.match(
    /\b(processing(?:\s+policy)?|provider|office\s+reference|dental\s+benefit)\s+(manual|handbook|guide)\b/i
  );
  const detectedManualType = typeMatch
    ? /processing/i.test(typeMatch[1])
      ? 'processing'
      : /provider/i.test(typeMatch[1])
        ? 'provider'
        : 'reference'
    : null;

  return {
    detectedTitle,
    detectedCarrier,
    detectedManualType,
    detectedEffectiveDate: detectEffectiveDate(frontText),
  };
}

// ---------------------------------------------------------------------------
// Sections + chunks from blocks
// ---------------------------------------------------------------------------

interface SectionizeResult {
  sections: ManualSection[];
  chunks: ManualChunk[];
}

function sectionize(blocks: ContentBlock[], toc: TocEntry[]): SectionizeResult {
  const sections: ManualSection[] = [];
  const chunks: ManualChunk[] = [];
  const stack: ManualSection[] = [];
  const usedIds = new Set<string>();

  let current: ManualSection | null = null;
  let buffer: { parts: string[]; page: number | null; pageEnd: number | null } = {
    parts: [],
    page: null,
    pageEnd: null,
  };

  const chunkFor = (
    type: ManualChunk['chunkType'],
    content: string,
    page: number | null,
    pageEnd: number | null,
    meta?: ManualChunk['meta']
  ): ManualChunk => ({
    chunkIndex: chunks.length,
    chunkType: type,
    content,
    sectionId: current?.id ?? null,
    sectionTitle: current?.title ?? null,
    parentSectionTitle: current?.parentTitle ?? null,
    headingLevel: type === 'heading' ? (current?.level ?? null) : null,
    page,
    pageEnd: pageEnd ?? page,
    meta,
  });

  const flushBuffer = () => {
    if (buffer.parts.length === 0) return;
    chunks.push(chunkFor('paragraph', buffer.parts.join('\n\n'), buffer.page, buffer.pageEnd));
    buffer = { parts: [], page: null, pageEnd: null };
  };

  for (const block of blocks) {
    if (block.type === 'heading') {
      flushBuffer();
      while (stack.length > 0 && stack[stack.length - 1].level >= block.level) stack.pop();
      const parent = stack[stack.length - 1] ?? null;
      let id = `${slugify(block.text)}`;
      if (usedIds.has(id)) id = `${id}-p${block.page}-${sections.length}`;
      usedIds.add(id);
      const section: ManualSection = {
        id,
        title: block.text,
        level: block.level,
        page: block.page,
        parentId: parent?.id ?? null,
        parentTitle: parent?.title ?? null,
        order: sections.length,
        confidence: 'high',
      };
      sections.push(section);
      stack.push(section);
      current = section;
      chunks.push({
        chunkIndex: chunks.length,
        chunkType: 'heading',
        content: block.text,
        sectionId: section.id,
        sectionTitle: section.title,
        parentSectionTitle: section.parentTitle,
        headingLevel: section.level,
        page: block.page,
        pageEnd: block.page,
      });
      continue;
    }

    if (block.type === 'paragraph') {
      const joined = buffer.parts.join('\n\n');
      if (joined.length + block.text.length > CHUNK_TARGET_CHARS) flushBuffer();
      buffer.parts.push(block.text);
      buffer.page = buffer.page ?? block.page;
      buffer.pageEnd = block.pageEnd;
      continue;
    }

    flushBuffer();
    if (block.type === 'bullet_list' || block.type === 'numbered_list') {
      chunks.push(
        chunkFor(block.type, block.items.join('\n'), block.page, block.pageEnd, {
          items: block.items,
        })
      );
    } else if (block.type === 'notice') {
      chunks.push(chunkFor('notice', block.text, block.page, block.pageEnd));
    } else if (block.type === 'table') {
      chunks.push(
        chunkFor(
          'table',
          block.rows.map(r => r.join(' | ')).join('\n'),
          block.page,
          block.pageEnd,
          { rows: block.rows, headerRow: block.headerRow, confidence: block.confidence }
        )
      );
      if (block.confidence === 'low' && current) current.confidence = 'medium';
    }
  }
  flushBuffer();

  // Keep the TOC itself for provenance — typed so readers and search skip it.
  if (toc.length > 0) {
    chunks.push({
      chunkIndex: chunks.length,
      chunkType: 'table_of_contents',
      content: toc.map(e => `${e.title} — ${e.printedPage}`).join('\n'),
      sectionId: null,
      sectionTitle: null,
      parentSectionTitle: null,
      headingLevel: null,
      page: null,
      pageEnd: null,
    });
  }

  return { sections, chunks };
}

/** Page-based fallback: honest navigation when sectioning failed. */
function sectionizeByPage(blocks: ContentBlock[]): SectionizeResult {
  const sections: ManualSection[] = [];
  const byId = new Map<string, ManualSection>();
  const chunks: ManualChunk[] = [];

  const sectionForPage = (page: number): ManualSection => {
    const id = `page-${page}`;
    let section = byId.get(id);
    if (!section) {
      section = {
        id,
        title: `Page ${page}`,
        level: 1,
        page,
        parentId: null,
        parentTitle: null,
        order: sections.length,
        confidence: 'low',
      };
      byId.set(id, section);
      sections.push(section);
    }
    return section;
  };

  for (const block of blocks) {
    const section = sectionForPage(block.page ?? 1);
    const base = {
      sectionId: section.id,
      sectionTitle: section.title,
      parentSectionTitle: null,
      page: block.page,
    };
    if (block.type === 'heading') {
      chunks.push({
        chunkIndex: chunks.length,
        chunkType: 'paragraph',
        content: block.text,
        headingLevel: null,
        pageEnd: block.page,
        ...base,
      });
    } else if (block.type === 'bullet_list' || block.type === 'numbered_list') {
      chunks.push({
        chunkIndex: chunks.length,
        chunkType: block.type,
        content: block.items.join('\n'),
        headingLevel: null,
        pageEnd: block.pageEnd,
        meta: { items: block.items },
        ...base,
      });
    } else if (block.type === 'table') {
      chunks.push({
        chunkIndex: chunks.length,
        chunkType: 'table',
        content: block.rows.map(r => r.join(' | ')).join('\n'),
        headingLevel: null,
        pageEnd: block.pageEnd,
        meta: { rows: block.rows, headerRow: block.headerRow, confidence: block.confidence },
        ...base,
      });
    } else {
      chunks.push({
        chunkIndex: chunks.length,
        chunkType: block.type === 'notice' ? 'notice' : 'paragraph',
        content: block.text,
        headingLevel: null,
        pageEnd: block.pageEnd,
        ...base,
      });
    }
  }
  return { sections, chunks };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function parseManual(pages: PdfPageText[]): ParsedManual {
  const pageLines = assembleLines(pages);
  const bodySize = bodyFontSize(pageLines);
  const pageHeight = pages[0]?.height ?? 792;
  const repeats = classifyRepeats(pageLines, pageHeight);
  const toc = detectToc(pageLines, repeats.printedToPhysical);
  const detected = detectHeadings(pageLines, bodySize);
  const { headings, matchRate } = reconcileWithToc(detected, toc.entries, pageLines);

  // Mark heading lines so block building treats them as boundaries.
  for (const h of headings) h.line.kind = 'heading';

  const blocks = buildBlocks(pageLines, headings);
  const meta = detectMetadata(pageLines, bodySize);

  let result = sectionize(blocks, toc.entries);
  let navMode: ManualParseMeta['navMode'] = 'sections';

  // One section across a long document is a parsing failure, not a
  // one-section document. Fall back to page navigation and say so.
  const topLevel = result.sections.filter(s => s.level === 1).length;
  if (pages.length > 6 && (result.sections.length <= 1 || topLevel === 0)) {
    result = sectionizeByPage(blocks);
    navMode = 'pages';
  }

  const sectionCount = result.sections.length;
  let confidence: ParseConfidence;
  if (navMode === 'pages') {
    confidence = 'low';
  } else if (
    (toc.entries.length >= 3 && matchRate >= 0.5 && sectionCount >= 4) ||
    (toc.entries.length === 0 && sectionCount >= Math.max(3, Math.floor(pages.length / 12)))
  ) {
    confidence = 'high';
  } else if (sectionCount >= 2) {
    confidence = 'medium';
  } else {
    confidence = pages.length <= 6 ? 'medium' : 'low';
  }

  return {
    meta: {
      parserVersion: PARSER_VERSION,
      pageCount: pages.length,
      navMode,
      confidence,
      sectionCount,
      tocMatchRate: toc.entries.length > 0 ? matchRate : null,
      tocPages: toc.tocPages,
      removedHeaders: repeats.removedHeaders,
      removedFooters: repeats.removedFooters,
      ...meta,
    },
    sections: result.sections,
    chunks: result.chunks,
    toc: toc.entries,
  };
}

// ---------------------------------------------------------------------------
// Section overrides (manager corrections)
// ---------------------------------------------------------------------------

export interface EffectiveSections {
  sections: ManualSection[];
  /** Original section id → id it now belongs to (merges collapse here). */
  remap: Map<string, string>;
  /** Section ids whose content is hidden entirely. */
  hidden: Set<string>;
}

/**
 * Apply manager overrides (rename / hide / merge-into-previous) to a
 * parsed section list. Hidden sections disappear with their content;
 * merged sections keep their content under the previous visible section.
 */
export function applySectionOverrides(
  sections: ManualSection[],
  overrides: SectionOverrides | null | undefined
): EffectiveSections {
  const remap = new Map<string, string>();
  const hidden = new Set<string>();
  if (!overrides) return { sections, remap, hidden };

  const out: ManualSection[] = [];
  for (const section of sections) {
    const override = overrides[section.id];
    if (override?.hidden) {
      hidden.add(section.id);
      continue;
    }
    if (override?.mergeIntoPrevious && out.length > 0) {
      remap.set(section.id, out[out.length - 1].id);
      continue;
    }
    out.push(override?.title ? { ...section, title: override.title } : section);
  }
  // Chase merge chains (A merged into B merged into C).
  for (const [from, to] of remap) {
    let target = to;
    const seen = new Set([from]);
    while (remap.has(target) && !seen.has(target)) {
      seen.add(target);
      target = remap.get(target)!;
    }
    remap.set(from, target);
  }
  return { sections: out, remap, hidden };
}
