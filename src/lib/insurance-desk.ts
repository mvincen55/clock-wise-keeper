/**
 * Insurance Desk domain logic (pure, testable).
 *
 * Bridges stored document rows to the manual reader: rebuilds the section
 * tree from structured chunk rows, normalizes legacy flat-text documents
 * through the same shape, applies manager section overrides, and expands
 * carrier terminology for search. No React, no Supabase client.
 */
import type { Json, Tables } from '@/integrations/supabase/types';
import {
  applySectionOverrides,
  structureFromLegacyText,
  type ManualChunk,
  type ManualChunkType,
  type ManualSection,
  type ParseConfidence,
  type SectionOverrides,
} from '@/lib/manual-parse';
import type { OfficeDoc } from '@/lib/doc-library';

export type ManualChunkRow = Pick<
  Tables<'office_doc_chunks'>,
  | 'id'
  | 'doc_id'
  | 'chunk_index'
  | 'chunk_type'
  | 'content'
  | 'section_id'
  | 'section_title'
  | 'parent_section_title'
  | 'heading_level'
  | 'page_number'
  | 'page_end'
  | 'meta'
  | 'parse_version'
>;

const CHUNK_TYPES: ManualChunkType[] = [
  'heading',
  'paragraph',
  'bullet_list',
  'numbered_list',
  'table',
  'table_of_contents',
  'notice',
  'header',
  'footer',
];

/** Chunk types that never render in the clean reader. */
export const FURNITURE_TYPES: ReadonlySet<string> = new Set([
  'header',
  'footer',
  'table_of_contents',
]);

const asChunkType = (value: string): ManualChunkType =>
  (CHUNK_TYPES as string[]).includes(value) ? (value as ManualChunkType) : 'paragraph';

const metaOf = (meta: Json | null): ManualChunk['meta'] => {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return undefined;
  const m = meta as Record<string, unknown>;
  const out: NonNullable<ManualChunk['meta']> = {};
  if (Array.isArray(m.items)) out.items = m.items.filter((i): i is string => typeof i === 'string');
  if (Array.isArray(m.rows)) {
    out.rows = m.rows
      .filter((r): r is unknown[] => Array.isArray(r))
      .map(r => r.filter((c): c is string => typeof c === 'string'));
  }
  if (typeof m.headerRow === 'boolean') out.headerRow = m.headerRow;
  if (m.confidence === 'high' || m.confidence === 'medium' || m.confidence === 'low') {
    out.confidence = m.confidence;
  }
  return Object.keys(out).length > 0 ? out : undefined;
};

/** Normalize a stored chunk row to the parser's chunk shape. */
export function chunkFromRow(row: ManualChunkRow): ManualChunk {
  return {
    chunkIndex: row.chunk_index,
    chunkType: asChunkType(row.chunk_type),
    content: row.content,
    sectionId: row.section_id,
    sectionTitle: row.section_title,
    parentSectionTitle: row.parent_section_title,
    headingLevel: row.heading_level,
    page: row.page_number,
    pageEnd: row.page_end,
    meta: metaOf(row.meta),
  };
}

/**
 * Rebuild the section list from stored chunks (sections aren't stored as
 * rows — heading chunks and section ids carry everything needed). Nesting
 * comes from heading levels, the standard outline rule.
 */
export function sectionsFromChunks(chunks: ManualChunk[]): ManualSection[] {
  const sections: ManualSection[] = [];
  const seen = new Set<string>();
  const stack: ManualSection[] = [];

  for (const chunk of chunks) {
    if (!chunk.sectionId || seen.has(chunk.sectionId)) continue;
    seen.add(chunk.sectionId);
    const level =
      chunk.chunkType === 'heading' && chunk.headingLevel ? chunk.headingLevel : 1;
    while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    const section: ManualSection = {
      id: chunk.sectionId,
      title: chunk.sectionTitle ?? chunk.sectionId,
      level,
      page: chunk.page ?? 0,
      parentId: parent?.id ?? null,
      parentTitle: parent?.title ?? chunk.parentSectionTitle,
      order: sections.length,
      confidence: chunk.meta?.confidence ?? 'high',
    };
    sections.push(section);
    stack.push(section);
  }
  return sections;
}

// ---------------------------------------------------------------------------
// The unified reader model
// ---------------------------------------------------------------------------

export interface ReaderManual {
  doc: OfficeDoc;
  /** Visible sections after manager overrides. */
  sections: ManualSection[];
  /** Detected sections BEFORE overrides — what section review edits. */
  rawSections: ManualSection[];
  /** Renderable chunks (furniture and hidden sections removed). */
  chunks: ManualChunk[];
  /** True when the chunks carry real page/section metadata. */
  structured: boolean;
  navMode: 'sections' | 'pages';
  confidence: ParseConfidence;
}

export const docOverrides = (doc: OfficeDoc): SectionOverrides | null => {
  const raw = doc.section_overrides;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as SectionOverrides;
};

/**
 * Assemble the reader model for one document from its stored chunk rows.
 * Structured documents use their stored metadata; legacy documents run
 * through the text heuristics so the same reader can show them (clearly
 * marked lower-confidence until a manager re-parses the PDF).
 */
export function buildReaderManual(doc: OfficeDoc, rows: ManualChunkRow[]): ReaderManual {
  const currentRows = rows
    .filter(r => r.parse_version === (doc.current_parse_version ?? 1))
    .sort((a, b) => a.chunk_index - b.chunk_index);

  const structured =
    doc.parse_status !== 'legacy' && currentRows.some(r => r.section_id !== null);

  let chunks: ManualChunk[];
  let sections: ManualSection[];
  if (structured) {
    chunks = currentRows.map(chunkFromRow);
    sections = sectionsFromChunks(chunks);
  } else {
    const legacy = structureFromLegacyText(currentRows.map(r => r.content).join('\n\n'));
    chunks = legacy.chunks;
    sections = legacy.sections;
  }

  const { sections: visible, remap, hidden } = applySectionOverrides(
    sections,
    docOverrides(doc)
  );
  const titleById = new Map(visible.map(s => [s.id, s.title]));

  const readerChunks = chunks
    .filter(c => !FURNITURE_TYPES.has(c.chunkType))
    .filter(c => !(c.sectionId && hidden.has(c.sectionId)))
    .map(c => {
      const mappedId = c.sectionId ? (remap.get(c.sectionId) ?? c.sectionId) : null;
      // Heading chunks of merged sections disappear (their content lives on
      // under the surviving section); renamed sections re-title in place.
      if (c.sectionId && remap.has(c.sectionId) && c.chunkType === 'heading') return null;
      return {
        ...c,
        sectionId: mappedId,
        sectionTitle: mappedId ? (titleById.get(mappedId) ?? c.sectionTitle) : c.sectionTitle,
        content:
          c.chunkType === 'heading' && c.sectionId
            ? (titleById.get(c.sectionId) ?? c.content)
            : c.content,
      };
    })
    .filter((c): c is ManualChunk => c !== null);

  const navMode = doc.parse_status === 'fallback' ? 'pages' : 'sections';
  const confidence: ParseConfidence = structured
    ? ((doc.parse_confidence as ParseConfidence | null) ?? 'medium')
    : visible.length > 1
      ? 'medium'
      : 'low';

  return {
    doc,
    sections: visible,
    rawSections: sections,
    chunks: readerChunks,
    structured,
    navMode,
    confidence,
  };
}

// ---------------------------------------------------------------------------
// Manual display helpers
// ---------------------------------------------------------------------------

export const MANUAL_TYPE_LABELS: Record<string, string> = {
  processing: 'Processing manual',
  provider: 'Provider manual',
  reference: 'Reference guide',
};

export const manualTypeLabel = (doc: OfficeDoc): string => {
  const type = (doc.manual_type ?? '').toLowerCase();
  return MANUAL_TYPE_LABELS[type] ?? (doc.manual_type || 'Carrier manual');
};

export const effectiveYear = (doc: OfficeDoc): string | null => {
  if (doc.effective_date) return doc.effective_date.slice(0, 4);
  const inTitle = doc.title.match(/\b(20\d{2})\b/);
  return inTitle ? inTitle[1] : null;
};

export const formatEffectiveDate = (doc: OfficeDoc): string | null => {
  if (!doc.effective_date) return null;
  const [y, m, d] = doc.effective_date.split('-').map(n => parseInt(n, 10));
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

/** Current manuals first (newest effective), then archived. */
export function orderManuals<T extends OfficeDoc>(docs: T[]): T[] {
  return docs.slice().sort((a, b) => {
    const status = (a.doc_status === 'archived' ? 1 : 0) - (b.doc_status === 'archived' ? 1 : 0);
    if (status !== 0) return status;
    const effective = (b.effective_date ?? '').localeCompare(a.effective_date ?? '');
    if (effective !== 0) return effective;
    return a.title.localeCompare(b.title);
  });
}

// ---------------------------------------------------------------------------
// Search terminology
// ---------------------------------------------------------------------------

/**
 * Carrier-manual synonyms. Searches run the typed query PLUS variant
 * queries (each hit keeps its best rank) — safer than OR inside one
 * websearch string, whose precedence surprises.
 */
export const INSURANCE_SYNONYMS: Record<string, string[]> = {
  'timely filing': ['filing deadline', 'claim submission period'],
  predetermination: ['pre-treatment estimate', 'preauthorization', 'prior authorization'],
  downgrade: ['alternate benefit', 'alternative benefit'],
  'alternate benefit': ['downgrade', 'alternative benefit'],
  attachment: ['radiograph', 'supporting documentation'],
  'missing tooth': ['missing tooth clause', 'extracted prior'],
  frequency: ['frequency limitation', 'limitation'],
  eligibility: ['eligible', 'coverage'],
  appeal: ['appeals', 'reconsideration', 'grievance'],
  'coordination of benefits': ['COB', 'dual coverage'],
  crown: ['crowns', 'full coverage restoration'],
};

/** The typed query plus up to three synonym-substituted variants. */
export function insuranceQueryVariants(query: string): string[] {
  const q = query.trim();
  if (!q) return [];
  const lower = q.toLowerCase();
  const variants: string[] = [q];
  for (const [key, synonyms] of Object.entries(INSURANCE_SYNONYMS)) {
    if (!new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(lower)) {
      continue;
    }
    for (const synonym of synonyms) {
      const variant = lower.replace(new RegExp(`\\b${key}\\b`, 'i'), synonym);
      if (variant !== lower && !variants.some(v => v.toLowerCase() === variant)) {
        variants.push(variant);
      }
    }
  }
  return variants.slice(0, 4);
}

/** Insurance Desk quick access — every shortcut is a real scoped search. */
export interface InsuranceShortcut {
  key: string;
  label: string;
  query: string;
  hint: string;
}

export const INSURANCE_SHORTCUTS: InsuranceShortcut[] = [
  { key: 'claims', label: 'Claims & attachments', query: 'claim attachment', hint: 'Submission and documentation rules' },
  { key: 'eligibility', label: 'Eligibility & benefits', query: 'eligibility', hint: 'Verifying coverage' },
  { key: 'frequency', label: 'Frequencies & limitations', query: 'frequency limitation', hint: 'How often services are covered' },
  { key: 'downgrades', label: 'Downgrades & alternate benefits', query: 'alternate benefit', hint: 'Alternate benefit provisions' },
  { key: 'predetermination', label: 'Predeterminations', query: 'predetermination', hint: 'Pre-treatment estimates' },
  { key: 'timely-filing', label: 'Timely filing', query: 'timely filing', hint: 'Claim submission deadlines' },
  { key: 'participation', label: 'Provider participation', query: 'participating provider', hint: 'Network obligations' },
  { key: 'appeals', label: 'Appeals & corrections', query: 'appeal', hint: 'Disputing a determination' },
];
