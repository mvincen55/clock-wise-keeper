/**
 * Validation for structured manual payloads.
 *
 * The client parses PDFs locally (layout-aware, deterministic) and sends
 * typed chunks with page/section provenance. The server never trusts the
 * shape: everything is re-checked and bounded here before a row is
 * written. Content text is stored verbatim — validation bounds sizes and
 * types, it never rewrites carrier wording.
 */

export const CHUNK_TYPES = new Set([
  "heading",
  "paragraph",
  "bullet_list",
  "numbered_list",
  "table",
  "table_of_contents",
  "notice",
  "header",
  "footer",
]);

export const CONFIDENCES = new Set(["high", "medium", "low"]);
export const NAV_MODES = new Set(["sections", "pages"]);

const MAX_CHUNKS = 4000;
const MAX_CHUNK_CHARS = 12_000;
const MAX_TOTAL_CHARS = 2_500_000;
const MAX_LABEL = 300;
const MAX_META_JSON = 24_000;
const MAX_PAGE = 5000;

export interface StructuredChunkRow {
  chunk_index: number;
  chunk_type: string;
  content: string;
  section_id: string | null;
  section_title: string | null;
  parent_section_title: string | null;
  heading_level: number | null;
  page_number: number | null;
  page_end: number | null;
  meta: unknown | null;
}

export interface StructuredParse {
  chunks: StructuredChunkRow[];
  charCount: number;
  navMode: string;
  confidence: string;
  pageCount: number;
  sectionCount: number;
  parseMeta: Record<string, unknown>;
}

const label = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_LABEL);
};

const pageNo = (value: unknown): number | null => {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  return value >= 1 && value <= MAX_PAGE ? value : null;
};

// The wire payload is untrusted JSON; every field is re-checked below.
type Wire = Record<string, unknown>;

/**
 * Validate a client-supplied structured parse. Returns the rows to store
 * or throws with a caller-safe message.
 */
export function validateStructured(raw: unknown): StructuredParse {
  if (!raw || typeof raw !== "object") throw new Error("Missing structured parse");
  const chunksIn = (raw as Wire).chunks;
  if (!Array.isArray(chunksIn) || chunksIn.length === 0) {
    throw new Error("Structured parse has no chunks");
  }
  if (chunksIn.length > MAX_CHUNKS) {
    throw new Error(`Too many chunks (max ${MAX_CHUNKS})`);
  }

  let total = 0;
  const chunks: StructuredChunkRow[] = [];
  for (let i = 0; i < chunksIn.length; i++) {
    const c = chunksIn[i];
    if (!c || typeof c !== "object") throw new Error(`Chunk ${i} is not an object`);
    const type = CHUNK_TYPES.has(c.chunkType) ? (c.chunkType as string) : null;
    if (!type) throw new Error(`Chunk ${i} has an unknown type`);
    const content = typeof c.content === "string" ? c.content.trim() : "";
    if (!content) throw new Error(`Chunk ${i} has no content`);
    if (content.length > MAX_CHUNK_CHARS) {
      throw new Error(`Chunk ${i} is too large (max ${MAX_CHUNK_CHARS} chars)`);
    }
    total += content.length;
    if (total > MAX_TOTAL_CHARS) throw new Error("Document text exceeds the size limit");

    let meta: unknown = null;
    if (c.meta && typeof c.meta === "object") {
      const json = JSON.stringify(c.meta);
      // Oversized table/list metadata degrades to text-only content rather
      // than failing the whole ingest.
      if (json.length <= MAX_META_JSON) meta = c.meta;
    }

    const headingLevel =
      typeof c.headingLevel === "number" && Number.isInteger(c.headingLevel)
        ? Math.min(6, Math.max(1, c.headingLevel))
        : null;

    chunks.push({
      chunk_index: chunks.length,
      chunk_type: type,
      content,
      section_id: label(c.sectionId),
      section_title: label(c.sectionTitle),
      parent_section_title: label(c.parentSectionTitle),
      heading_level: headingLevel,
      page_number: pageNo(c.page),
      page_end: pageNo(c.pageEnd) ?? pageNo(c.page),
      meta,
    });
  }

  const bodyChars = chunks
    .filter((c) => !["header", "footer", "table_of_contents"].includes(c.chunk_type))
    .reduce((n, c) => n + c.content.length, 0);
  if (bodyChars < 40) throw new Error("Structured parse contains no body text");

  const rawMeta = (raw as Wire).meta;
  const metaIn = (rawMeta && typeof rawMeta === "object" ? rawMeta : {}) as Wire;
  const navMode = NAV_MODES.has(String(metaIn.navMode)) ? String(metaIn.navMode) : "sections";
  const confidence = CONFIDENCES.has(String(metaIn.confidence)) ? String(metaIn.confidence) : "low";
  const pageCount = pageNo(metaIn.pageCount) ?? 0;
  const sectionCount =
    typeof metaIn.sectionCount === "number" && Number.isInteger(metaIn.sectionCount)
      ? Math.max(0, Math.min(100_000, metaIn.sectionCount))
      : 0;

  // Keep only the parse-report fields the app reads; bound the rest out.
  const parseMeta: Record<string, unknown> = {
    parserVersion: typeof metaIn.parserVersion === "number" ? metaIn.parserVersion : 0,
    navMode,
    confidence,
    pageCount,
    sectionCount,
    tocMatchRate: typeof metaIn.tocMatchRate === "number" ? metaIn.tocMatchRate : null,
    tocPages: Array.isArray(metaIn.tocPages) ? metaIn.tocPages.filter(Number.isInteger).slice(0, 50) : [],
    removedHeaders: Array.isArray(metaIn.removedHeaders)
      ? metaIn.removedHeaders.filter((s: unknown) => typeof s === "string").slice(0, 30)
      : [],
    removedFooters: Array.isArray(metaIn.removedFooters)
      ? metaIn.removedFooters.filter((s: unknown) => typeof s === "string").slice(0, 30)
      : [],
    detectedTitle: label(metaIn.detectedTitle),
    detectedCarrier: label(metaIn.detectedCarrier),
    detectedManualType: label(metaIn.detectedManualType),
    detectedEffectiveDate: label(metaIn.detectedEffectiveDate),
  };

  // A long document that came out as a single section is exactly the
  // failure mode this rebuild exists to stop — refuse to store it as if
  // it were fine (the client's own fallback produces page navigation
  // instead, which passes).
  if (pageCount > 6 && navMode === "sections" && sectionCount <= 1) {
    throw new Error(
      "Parse rejected: a long document resolved to a single section. Re-parse with page fallback."
    );
  }

  return { chunks, charCount: total, navMode, confidence, pageCount, sectionCount, parseMeta };
}
