/**
 * Structured manual parsing — shared types.
 *
 * The pipeline is pure and layout-aware: it consumes positioned text
 * extracted from a PDF (per page, per item, with coordinates and font
 * sizes) and produces navigable sections plus typed content chunks with
 * page provenance. Nothing here touches pdfjs or the network, so the
 * whole pipeline is unit-testable with synthetic pages.
 */

/** One positioned text run from a PDF page. Origin is the page's TOP-left. */
export interface PdfTextItem {
  str: string;
  x: number;
  /** Distance from the top of the page (larger = lower). */
  y: number;
  width: number;
  fontSize: number;
  fontName?: string;
}

/** All text on one physical PDF page. */
export interface PdfPageText {
  /** 1-based physical page number (what a PDF viewer shows). */
  pageNumber: number;
  width: number;
  height: number;
  items: PdfTextItem[];
}

/** A visual line assembled from items sharing a baseline. */
export interface ManualLine {
  text: string;
  page: number;
  x: number;
  y: number;
  width: number;
  fontSize: number;
  /** x-position of each item start — the raw signal for column detection. */
  itemXs: number[];
  /** Text of each item, aligned with itemXs. */
  itemTexts: string[];
  /** Set by the repeat/TOC/heading passes. */
  kind: LineKind;
}

export type LineKind =
  | 'body'
  | 'header'
  | 'footer'
  | 'page_number'
  | 'toc_title'
  | 'toc_entry'
  | 'heading';

/** A table-of-contents entry parsed from a contents page. */
export interface TocEntry {
  title: string;
  /** Printed page number as it appears in the TOC. */
  printedPage: number;
  /** Physical page it resolves to (after printed→physical mapping). */
  targetPage: number;
  /** 1 = top level; deeper levels from indentation/numbering. */
  level: number;
  /** Index of the matched heading in the detected heading list, if any. */
  headingIndex?: number;
}

export type ManualChunkType =
  | 'heading'
  | 'paragraph'
  | 'bullet_list'
  | 'numbered_list'
  | 'table'
  | 'table_of_contents'
  | 'notice'
  | 'header'
  | 'footer';

export type ParseConfidence = 'high' | 'medium' | 'low';

/** A navigable section of the manual. */
export interface ManualSection {
  /** Stable slug unique within the document, e.g. "3-glossary-of-terms". */
  id: string;
  title: string;
  /** 1 = top level. */
  level: number;
  /** Physical page the section starts on. */
  page: number;
  parentId: string | null;
  parentTitle: string | null;
  order: number;
  confidence: ParseConfidence;
}

/** Extra structure a chunk carries beyond its searchable text. */
export interface ManualChunkMeta {
  /** List items for bullet_list / numbered_list chunks. */
  items?: string[];
  /** Table rows (first row is the header when headerRow is true). */
  rows?: string[][];
  headerRow?: boolean;
  confidence?: ParseConfidence;
}

/** One stored content chunk with full provenance. */
export interface ManualChunk {
  chunkIndex: number;
  chunkType: ManualChunkType;
  /** Searchable text — the exact source wording, never rewritten. */
  content: string;
  sectionId: string | null;
  sectionTitle: string | null;
  parentSectionTitle: string | null;
  headingLevel: number | null;
  /** Physical page the chunk starts / ends on. */
  page: number | null;
  pageEnd: number | null;
  meta?: ManualChunkMeta;
}

export type ManualNavMode = 'sections' | 'pages';

/** Document-level facts detected during parsing. */
export interface ManualParseMeta {
  parserVersion: number;
  pageCount: number;
  navMode: ManualNavMode;
  confidence: ParseConfidence;
  sectionCount: number;
  /** Share of TOC entries that matched a real heading (0–1, null = no TOC). */
  tocMatchRate: number | null;
  tocPages: number[];
  /** Normalized header/footer lines that were removed from body content. */
  removedHeaders: string[];
  removedFooters: string[];
  detectedTitle: string | null;
  detectedCarrier: string | null;
  detectedManualType: string | null;
  /** ISO date string when an effective date was found. */
  detectedEffectiveDate: string | null;
}

export interface ParsedManual {
  meta: ManualParseMeta;
  sections: ManualSection[];
  chunks: ManualChunk[];
  toc: TocEntry[];
}

/**
 * Manager corrections applied on top of a parse without re-running it.
 * Keyed by section id; stored on the document row so a re-parse can try
 * to re-apply them by title.
 */
export interface SectionOverride {
  title?: string;
  hidden?: boolean;
  /** Fold this section's content into the previous visible section. */
  mergeIntoPrevious?: boolean;
}

export type SectionOverrides = Record<string, SectionOverride>;

/** Bump when parsing behavior changes enough that a re-parse is worthwhile. */
export const PARSER_VERSION = 1;
