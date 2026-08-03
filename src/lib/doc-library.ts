/**
 * Document library placement + reader logic (pure, testable).
 *
 * The office knowledge base separates two ideas the old flat `category`
 * conflated:
 *   - library_area — WHERE a document lives in the product
 *     (Workplace | Practice Playbook | shared | unassigned)
 *   - collection   — WHAT the document is
 *     (handbook, hr, insurance, operations, training, reference, other)
 *
 * Everything here is plain data logic shared by the Office Handbook,
 * the Insurance Desk, and document management. No React.
 */
import type { Tables } from '@/integrations/supabase/types';
import type { DocBlock } from '@/lib/doc-format';

export type OfficeDoc = Tables<'office_docs'>;
export type OfficeDocCategory = 'policy' | 'hr' | 'insurance' | 'other';
export type LibraryArea = 'workplace' | 'playbook' | 'shared' | 'unassigned';
export type DocCollection =
  | 'handbook'
  | 'hr'
  | 'insurance'
  | 'operations'
  | 'training'
  | 'reference'
  | 'other';

export const LIBRARY_AREA_LABELS: Record<LibraryArea, string> = {
  workplace: 'Workplace',
  playbook: 'Practice Playbook',
  shared: 'Shared reference',
  unassigned: 'Not placed yet',
};

export const DOC_COLLECTION_LABELS: Record<DocCollection, string> = {
  handbook: 'Handbook & policies',
  hr: 'HR & benefits',
  insurance: 'Insurance carrier manual',
  operations: 'Procedure / SOP',
  training: 'Training material',
  reference: 'General reference',
  other: 'Other',
};

/** Upload flow question 1: where should this document live? */
export const LIBRARY_AREA_OPTIONS: { value: LibraryArea; label: string; hint: string }[] = [
  { value: 'workplace', label: 'Workplace', hint: 'Employee life — handbook, HR, benefits, office info.' },
  { value: 'playbook', label: 'Practice Playbook', hint: 'How the office works — procedures, insurance, operations.' },
  { value: 'shared', label: 'Shared office reference', hint: 'Useful everywhere; no single home.' },
  { value: 'unassigned', label: 'Not sure yet', hint: 'Park it — a manager can place it later.' },
];

/** Upload flow question 2: what kind of document is it? */
export const DOC_COLLECTION_OPTIONS: { value: DocCollection; label: string }[] = [
  { value: 'handbook', label: 'Employee handbook or policy' },
  { value: 'hr', label: 'HR or benefits' },
  { value: 'insurance', label: 'Insurance carrier manual' },
  { value: 'operations', label: 'Procedure or SOP' },
  { value: 'training', label: 'Training material' },
  { value: 'reference', label: 'General reference' },
  { value: 'other', label: 'Other' },
];

const LIBRARY_AREAS = new Set<string>(Object.keys(LIBRARY_AREA_LABELS));
const COLLECTIONS = new Set<string>(Object.keys(DOC_COLLECTION_LABELS));

/** The legacy flat category kept in sync for backwards compatibility. */
export function legacyCategoryFor(collection: DocCollection): OfficeDocCategory {
  switch (collection) {
    case 'handbook':
      return 'policy';
    case 'hr':
      return 'hr';
    case 'insurance':
      return 'insurance';
    default:
      return 'other';
  }
}

/** Mirror of the migration backfill: where a legacy category lands. */
export function placementForLegacyCategory(category: string): {
  libraryArea: LibraryArea;
  collection: DocCollection;
} {
  switch (category) {
    case 'policy':
      return { libraryArea: 'workplace', collection: 'handbook' };
    case 'hr':
      return { libraryArea: 'workplace', collection: 'hr' };
    case 'insurance':
      return { libraryArea: 'playbook', collection: 'insurance' };
    default:
      return { libraryArea: 'unassigned', collection: 'other' };
  }
}

type PlacementSource = Pick<OfficeDoc, 'category'> &
  Partial<Pick<OfficeDoc, 'library_area' | 'collection'>>;

/**
 * A document's placement, tolerating rows cached before the migration ran
 * (missing/unknown fields fall back to the category mapping). Valid stored
 * values — including a deliberate 'unassigned' — always win.
 */
export function resolveDocPlacement(doc: PlacementSource): {
  libraryArea: LibraryArea;
  collection: DocCollection;
} {
  const fallback = placementForLegacyCategory(doc.category);
  return {
    libraryArea: LIBRARY_AREAS.has(doc.library_area ?? '')
      ? (doc.library_area as LibraryArea)
      : fallback.libraryArea,
    collection: COLLECTIONS.has(doc.collection ?? '')
      ? (doc.collection as DocCollection)
      : fallback.collection,
  };
}

export interface LibraryScope {
  areas: LibraryArea[];
  /** null = any collection within the areas. */
  collections: DocCollection[] | null;
}

export function docInScope(doc: PlacementSource, scope: LibraryScope): boolean {
  const placement = resolveDocPlacement(doc);
  if (!scope.areas.includes(placement.libraryArea)) return false;
  return scope.collections === null || scope.collections.includes(placement.collection);
}

/**
 * The standalone Important Numbers page is the primary experience — an
 * imported copy of it must never surface inside a reader.
 */
export const isImportantNumbersTitle = (title: string): boolean =>
  /^\s*important\s+numbers\b/i.test(title);

/**
 * Documents a reader surface shows, primary document first: collection
 * priority follows the scope's order (handbook before hr, etc.), then the
 * most substantial document wins so the real handbook opens by default.
 */
export function readerDocsFor<T extends PlacementSource & Pick<OfficeDoc, 'title' | 'char_count'>>(
  docs: T[],
  scope: LibraryScope
): T[] {
  const priority = (doc: T) => {
    if (!scope.collections) return 0;
    const index = scope.collections.indexOf(resolveDocPlacement(doc).collection);
    return index === -1 ? scope.collections.length : index;
  };
  return docs
    .filter(d => docInScope(d, scope) && !isImportantNumbersTitle(d.title))
    .sort(
      (a, b) =>
        priority(a) - priority(b) ||
        b.char_count - a.char_count ||
        a.title.localeCompare(b.title)
    );
}

// ---------------------------------------------------------------------------
// Reader text helpers
// ---------------------------------------------------------------------------

export const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reassemble a document from its search chunks WITHOUT duplicating the
 * retrieval overlap. ingest-doc seeds each chunk with the tail (~200 chars)
 * of the previous one so answers spanning a boundary stay retrievable —
 * naively joining chunks therefore repeats that tail in the reader. Here
 * the longest suffix-of-previous / prefix-of-next match is dropped before
 * appending; chunks with no detectable overlap fall back to a paragraph
 * join.
 */
export function stitchChunks(parts: string[], maxOverlap = 260, minOverlap = 20): string {
  if (parts.length === 0) return '';
  let out = parts[0];
  for (let p = 1; p < parts.length; p++) {
    const chunk = parts[p];
    const window = out.slice(-maxOverlap);
    let overlap = 0;
    for (let k = Math.min(window.length, chunk.length); k >= minOverlap; k--) {
      if (window.endsWith(chunk.slice(0, k))) {
        overlap = k;
        break;
      }
    }
    if (overlap === 0) {
      out += '\n\n' + chunk;
      continue;
    }
    const rest = chunk.slice(overlap);
    if (!rest) continue;
    // The seam inside a chunk is a single newline; restore the paragraph
    // break the original text had there.
    out += rest.startsWith('\n') && !rest.startsWith('\n\n') ? '\n' + rest : rest;
  }
  return out;
}

export const blockText = (b: DocBlock): string =>
  b.type === 'bullets' || b.type === 'numbered' ? b.items.join(' ') : b.text;

export function snippetAround(content: string, query: string, radius = 130): string {
  const idx = content.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return content.slice(0, radius * 2) + (content.length > radius * 2 ? '…' : '');
  const start = Math.max(0, idx - radius);
  const end = Math.min(content.length, idx + query.length + radius);
  return (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '');
}

export interface OutlineItem {
  id: string;
  text: string;
  blockIndex: number;
  /** Heading level from the source document (1–2 top-level, 3+ nested). */
  level: number;
}

export const sectionAnchorId = (blockIndex: number): string => `doc-sec-${blockIndex}`;

export function outlineFromBlocks(blocks: DocBlock[]): OutlineItem[] {
  return blocks
    .map((block, blockIndex) => ({ block, blockIndex }))
    .filter(({ block }) => block.type === 'heading')
    .map(({ block, blockIndex }) => ({
      id: sectionAnchorId(blockIndex),
      text: (block as { text: string }).text,
      blockIndex,
      level: (block as { level: number }).level,
    }));
}

export interface OutlineTreeNode {
  item: OutlineItem;
  children: OutlineTreeNode[];
}

/**
 * Nest the flat outline by heading level so the contents list can fold
 * subsections under their parent category (## Employee Policies →
 * ### Paid Time Off Policy → #### Time Off Request Form). Levels may skip;
 * a document whose headings are all one level stays a flat list of roots.
 */
export function outlineTree(outline: OutlineItem[]): OutlineTreeNode[] {
  const roots: OutlineTreeNode[] = [];
  const stack: OutlineTreeNode[] = [];
  for (const item of outline) {
    const node: OutlineTreeNode = { item, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].item.level >= item.level) stack.pop();
    if (stack.length === 0) roots.push(node);
    else stack[stack.length - 1].children.push(node);
    stack.push(node);
  }
  return roots;
}

/** Ancestor chain for every outline entry — used to auto-unfold the path to the active section. */
export function outlineAncestors(tree: OutlineTreeNode[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const walk = (nodes: OutlineTreeNode[], trail: string[]) => {
    for (const node of nodes) {
      map.set(node.item.id, trail);
      walk(node.children, [...trail, node.item.id]);
    }
  };
  walk(tree, []);
  return map;
}

/**
 * Who may edit library document text in place: the owner always; managers
 * only when the owner has switched that on in doc_library_settings.
 */
export function canEditLibraryDocs(
  role: string | null | undefined,
  managersCanEdit: boolean
): boolean {
  if (role === 'owner') return true;
  if (role === 'manager') return managersCanEdit;
  return false;
}

/** Nearest heading at or before a block — the section a passage belongs to. */
export function sectionHeadingForBlock(blocks: DocBlock[], blockIndex: number): string | null {
  for (let i = Math.min(blockIndex, blocks.length - 1); i >= 0; i--) {
    const block = blocks[i];
    if (block.type === 'heading') return block.text;
  }
  return null;
}

const normalize = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Which block a search hit points at. All blocks containing the query are
 * candidates; the hit's chunk content disambiguates when a term appears in
 * several sections (sample fragments of each candidate against the chunk —
 * whitespace-insensitive, since paragraph reassembly rewraps lines).
 * Returns -1 when nothing matches.
 */
export function locateQueryBlock(
  blocks: DocBlock[],
  query: string,
  chunkContent?: string
): number {
  const q = normalize(query);
  if (!q) return -1;
  const candidates = blocks
    .map((b, i) => ({ text: normalize(blockText(b)), i }))
    .filter(({ text }) => text.includes(q));
  if (candidates.length === 0) return -1;
  if (candidates.length === 1 || !chunkContent) return candidates[0].i;

  const chunk = normalize(chunkContent);
  let best = candidates[0].i;
  let bestScore = -1;
  for (const { text, i } of candidates) {
    const samples = [
      text.slice(0, 60),
      text.slice(Math.max(0, Math.floor(text.length / 2) - 30), Math.floor(text.length / 2) + 30),
      text.slice(-60),
    ].filter(s => s.length >= 12);
    const score = samples.reduce((n, s) => n + (chunk.includes(s) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Contextual AI scopes — shared by reader pages and the Assistant.
// (The kimi-agent edge function keeps its own copy of these filters; Deno
// functions cannot import from src/.)
// ---------------------------------------------------------------------------

export type AiScope = 'handbook' | 'insurance';

export const AI_SCOPES: Record<AiScope, { label: string; scope: LibraryScope }> = {
  handbook: {
    label: 'Office Handbook',
    scope: { areas: ['workplace'], collections: ['handbook', 'hr'] },
  },
  insurance: {
    label: 'Insurance Desk',
    scope: { areas: ['playbook'], collections: ['insurance'] },
  },
};

export const parseAiScope = (value: string | null): AiScope | null =>
  value === 'handbook' || value === 'insurance' ? value : null;
