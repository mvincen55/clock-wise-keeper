/**
 * Document library placement + reader logic.
 *
 * Guards the information-architecture rules behind the Office Handbook and
 * Insurance Desk: insurance manuals never surface in Workplace surfaces,
 * Important Numbers never appears as a handbook document, unassigned
 * documents stay out of every reader, and search hits resolve to the right
 * section of the right document.
 */
import { describe, expect, it } from 'vitest';
import {
  AI_SCOPES,
  docInScope,
  isImportantNumbersTitle,
  legacyCategoryFor,
  locateQueryBlock,
  outlineFromBlocks,
  parseAiScope,
  placementForLegacyCategory,
  readerDocsFor,
  resolveDocPlacement,
  sectionHeadingForBlock,
  snippetAround,
  stitchChunks,
  type LibraryScope,
  type OfficeDoc,
} from '../lib/doc-library';
import { parseDocBlocks } from '../lib/doc-format';
import { chunkText } from '../../supabase/functions/ingest-doc/lib';

const HANDBOOK_SCOPE: LibraryScope = AI_SCOPES.handbook.scope;
const INSURANCE_SCOPE: LibraryScope = AI_SCOPES.insurance.scope;

let seq = 0;
function doc(overrides: Partial<OfficeDoc>): OfficeDoc {
  seq += 1;
  return {
    id: `doc-${seq}`,
    org_id: 'org-1',
    title: `Document ${seq}`,
    category: 'other',
    library_area: 'unassigned',
    collection: 'other',
    char_count: 1000,
    file_path: null,
    mime_type: null,
    uploaded_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as OfficeDoc;
}

describe('legacy category mapping', () => {
  it('backfills each legacy category to the agreed placement', () => {
    expect(placementForLegacyCategory('policy')).toEqual({
      libraryArea: 'workplace',
      collection: 'handbook',
    });
    expect(placementForLegacyCategory('hr')).toEqual({
      libraryArea: 'workplace',
      collection: 'hr',
    });
    expect(placementForLegacyCategory('insurance')).toEqual({
      libraryArea: 'playbook',
      collection: 'insurance',
    });
    expect(placementForLegacyCategory('other')).toEqual({
      libraryArea: 'unassigned',
      collection: 'other',
    });
  });

  it('keeps the legacy category in sync with the collection', () => {
    expect(legacyCategoryFor('handbook')).toBe('policy');
    expect(legacyCategoryFor('hr')).toBe('hr');
    expect(legacyCategoryFor('insurance')).toBe('insurance');
    expect(legacyCategoryFor('operations')).toBe('other');
    expect(legacyCategoryFor('training')).toBe('other');
    expect(legacyCategoryFor('reference')).toBe('other');
  });
});

describe('resolveDocPlacement', () => {
  it('prefers valid stored placement over the category fallback', () => {
    const d = doc({ category: 'policy', library_area: 'playbook', collection: 'insurance' });
    expect(resolveDocPlacement(d)).toEqual({ libraryArea: 'playbook', collection: 'insurance' });
  });

  it('falls back to the category mapping for pre-migration rows', () => {
    const d = doc({ category: 'insurance' });
    delete (d as Record<string, unknown>).library_area;
    delete (d as Record<string, unknown>).collection;
    expect(resolveDocPlacement(d)).toEqual({ libraryArea: 'playbook', collection: 'insurance' });
  });

  it('respects a deliberate unassigned placement', () => {
    const d = doc({ category: 'policy', library_area: 'unassigned', collection: 'reference' });
    expect(resolveDocPlacement(d).libraryArea).toBe('unassigned');
  });
});

describe('reader scoping (the IA acceptance rules)', () => {
  const handbook = doc({
    title: 'Office Policy Handbook',
    category: 'policy',
    library_area: 'workplace',
    collection: 'handbook',
    char_count: 120_000,
  });
  const benefits = doc({
    title: 'Benefits Guide',
    category: 'hr',
    library_area: 'workplace',
    collection: 'hr',
    char_count: 30_000,
  });
  const processing = doc({
    title: '2026 DD MA Processing Manual',
    category: 'insurance',
    library_area: 'playbook',
    collection: 'insurance',
    char_count: 200_000,
  });
  const provider = doc({
    title: '2026 DD MA Provider Manual',
    category: 'insurance',
    library_area: 'playbook',
    collection: 'insurance',
    char_count: 150_000,
  });
  const importantNumbers = doc({
    title: 'Important Numbers',
    category: 'other',
    library_area: 'unassigned',
    collection: 'reference',
  });
  const unplaced = doc({
    title: 'Random Reference',
    category: 'other',
    library_area: 'unassigned',
    collection: 'other',
  });
  const all = [unplaced, provider, benefits, importantNumbers, processing, handbook];

  it('keeps insurance manuals out of the Office Handbook', () => {
    const docs = readerDocsFor(all, HANDBOOK_SCOPE);
    expect(docs.map(d => d.title)).toEqual(['Office Policy Handbook', 'Benefits Guide']);
  });

  it('shows only insurance manuals at the Insurance Desk', () => {
    const docs = readerDocsFor(all, INSURANCE_SCOPE);
    expect(docs.map(d => d.title)).toEqual([
      '2026 DD MA Processing Manual',
      '2026 DD MA Provider Manual',
    ]);
  });

  it('never shows Important Numbers as a handbook document — even if placed there', () => {
    const misplaced = doc({
      title: 'Important Numbers',
      category: 'policy',
      library_area: 'workplace',
      collection: 'handbook',
    });
    expect(readerDocsFor([misplaced, handbook], HANDBOOK_SCOPE).map(d => d.title)).toEqual([
      'Office Policy Handbook',
    ]);
    expect(isImportantNumbersTitle('Important Numbers (imported)')).toBe(true);
    expect(isImportantNumbersTitle('Numbers That Matter')).toBe(false);
  });

  it('keeps unassigned documents out of every reader until a manager places them', () => {
    expect(docInScope(unplaced, HANDBOOK_SCOPE)).toBe(false);
    expect(docInScope(unplaced, INSURANCE_SCOPE)).toBe(false);
  });

  it('opens the actual handbook first: primary collection, most substantial document', () => {
    const docs = readerDocsFor(all, HANDBOOK_SCOPE);
    expect(docs[0].title).toBe('Office Policy Handbook');
  });
});

describe('contextual AI scopes', () => {
  it('handbook scope covers Workplace handbook + HR only', () => {
    expect(AI_SCOPES.handbook.scope).toEqual({
      areas: ['workplace'],
      collections: ['handbook', 'hr'],
    });
  });

  it('insurance scope covers Playbook insurance only', () => {
    expect(AI_SCOPES.insurance.scope).toEqual({
      areas: ['playbook'],
      collections: ['insurance'],
    });
  });

  it('parses only known scopes from the URL', () => {
    expect(parseAiScope('handbook')).toBe('handbook');
    expect(parseAiScope('insurance')).toBe('insurance');
    expect(parseAiScope('everything')).toBeNull();
    expect(parseAiScope(null)).toBeNull();
  });
});

describe('section resolution for search hits', () => {
  const markdown = [
    '## Attendance',
    'Arrive on time for every shift.',
    '- Three tardies trigger a review.',
    '## Time Off',
    'Submit PTO requests two weeks ahead.',
    'Unapproved absences count as no-shows.',
    '### Holiday Requests',
    'Holiday PTO is granted by seniority.',
  ].join('\n');
  const blocks = parseDocBlocks(markdown);

  it('builds an outline with levels and anchors', () => {
    const outline = outlineFromBlocks(blocks);
    expect(outline.map(o => o.text)).toEqual(['Attendance', 'Time Off', 'Holiday Requests']);
    expect(outline.map(o => o.level)).toEqual([2, 2, 3]);
    expect(outline[0].id).toMatch(/^doc-sec-\d+$/);
  });

  it('finds the block containing a query and its section heading', () => {
    const idx = locateQueryBlock(blocks, 'PTO requests');
    expect(idx).toBeGreaterThan(-1);
    expect(sectionHeadingForBlock(blocks, idx)).toBe('Time Off');
  });

  it('uses the hit chunk to pick the right occurrence of a repeated term', () => {
    const holidayChunk = 'Holiday PTO is granted by seniority.';
    const idx = locateQueryBlock(blocks, 'PTO', holidayChunk);
    expect(sectionHeadingForBlock(blocks, idx)).toBe('Holiday Requests');
  });

  it('returns -1 when nothing matches', () => {
    expect(locateQueryBlock(blocks, 'crown remake')).toBe(-1);
  });
});

describe('stitchChunks', () => {
  it('drops the retrieval overlap instead of repeating it in the reader', () => {
    const first =
      'Fire extinguishers are located by the pano machine by the back door and shelf across from the server.';
    const second = `${first.slice(-60)}\nWhen ALL call lights are lit, this means there is an emergency of some kind in the office.`;
    const stitched = stitchChunks([first, second]);
    expect(stitched.split('shelf across from the server.').length - 1).toBe(1);
    expect(stitched).toContain('When ALL call lights are lit');
    // The seam keeps a paragraph break so blocks stay separate.
    expect(stitched).toContain('server.\n\nWhen ALL call lights');
  });

  it('falls back to a paragraph join when chunks do not overlap', () => {
    expect(stitchChunks(['Para one is here.', 'Para two is here.'])).toBe(
      'Para one is here.\n\nPara two is here.'
    );
  });

  it('swallows a trailing chunk that is pure overlap', () => {
    const text = 'A long enough sentence used as the base chunk for the stitcher to work with here.';
    expect(stitchChunks([text, text.slice(-40)])).toBe(text);
  });

  it('round-trips real chunker output without duplicating any passage', () => {
    const sections = Array.from(
      { length: 30 },
      (_, i) => `Policy clause ${i} states that unique-marker-${i} applies to every member of the team.`
    );
    const chunks = chunkText(sections.join('\n\n'), { maxChars: 300, overlapChars: 60 });
    expect(chunks.length).toBeGreaterThan(2);
    const stitched = stitchChunks(chunks);
    for (let i = 0; i < 30; i++) {
      expect(stitched.split(`unique-marker-${i} applies`).length - 1).toBe(1);
    }
  });
});

describe('snippetAround', () => {
  it('centers the snippet on the match with ellipses', () => {
    const text = `${'a'.repeat(300)} needle ${'b'.repeat(300)}`;
    const snippet = snippetAround(text, 'needle');
    expect(snippet).toContain('needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet.length).toBeLessThan(300);
  });

  it('falls back to the head of the content when there is no direct match', () => {
    const text = 'x'.repeat(400);
    const snippet = snippetAround(text, 'absent');
    expect(snippet.endsWith('…')).toBe(true);
  });
});
