/**
 * Insurance Desk reader model: stored chunk rows → what staff read.
 *
 * Guards the trust rules of the rebuilt desk: only the current parse
 * version renders, furniture chunk types never render, manager overrides
 * (rename/hide/merge) shape navigation without touching content, legacy
 * flat-text manuals still open through the same reader, and search
 * synonyms expand carrier terminology.
 */
import { describe, expect, it } from 'vitest';
import type { OfficeDoc } from '@/lib/doc-library';
import {
  buildReaderManual,
  chunkFromRow,
  effectiveYear,
  insuranceQueryVariants,
  manualTypeLabel,
  orderManuals,
  sectionsFromChunks,
  type ManualChunkRow,
} from '../lib/insurance-desk';

let seq = 0;
function doc(overrides: Partial<OfficeDoc>): OfficeDoc {
  seq += 1;
  return {
    id: `doc-${seq}`,
    org_id: 'org-1',
    title: `Manual ${seq}`,
    category: 'insurance',
    library_area: 'playbook',
    collection: 'insurance',
    char_count: 1000,
    file_path: 'org-1/manual.pdf',
    mime_type: 'application/pdf',
    uploaded_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    carrier: 'Delta Dental of Massachusetts',
    manual_type: 'processing',
    effective_date: '2026-01-01',
    doc_status: 'current',
    replaces_doc_id: null,
    parse_status: 'parsed',
    parse_confidence: 'high',
    page_count: 14,
    section_count: 3,
    current_parse_version: 2,
    parse_meta: null,
    section_overrides: {},
    ...overrides,
  } as OfficeDoc;
}

let rowSeq = 0;
function row(overrides: Partial<ManualChunkRow>): ManualChunkRow {
  rowSeq += 1;
  return {
    id: `row-${rowSeq}`,
    doc_id: 'doc-x',
    chunk_index: rowSeq,
    chunk_type: 'paragraph',
    content: `content ${rowSeq}`,
    section_id: null,
    section_title: null,
    parent_section_title: null,
    heading_level: null,
    page_number: null,
    page_end: null,
    meta: null,
    parse_version: 2,
    ...overrides,
  };
}

/** A small structured manual: two sections + furniture + an old version. */
function structuredRows(): ManualChunkRow[] {
  return [
    // Stale version — must never render.
    row({ chunk_index: 0, parse_version: 1, content: 'OLD EXTRACTION GARBAGE' }),
    row({
      chunk_index: 0,
      chunk_type: 'heading',
      content: 'Introduction',
      section_id: 'introduction',
      section_title: 'Introduction',
      heading_level: 1,
      page_number: 3,
    }),
    row({
      chunk_index: 1,
      content: 'Welcome to the manual.',
      section_id: 'introduction',
      section_title: 'Introduction',
      page_number: 3,
    }),
    row({
      chunk_index: 2,
      chunk_type: 'heading',
      content: 'Timely Filing',
      section_id: 'timely-filing',
      section_title: 'Timely Filing',
      heading_level: 1,
      page_number: 7,
    }),
    row({
      chunk_index: 3,
      content: 'Claims must be filed within twelve months.',
      section_id: 'timely-filing',
      section_title: 'Timely Filing',
      page_number: 7,
    }),
    row({
      chunk_index: 4,
      chunk_type: 'heading',
      content: 'Appeals',
      section_id: 'appeals',
      section_title: 'Appeals',
      heading_level: 2,
      parent_section_title: 'Timely Filing',
      page_number: 8,
    }),
    row({
      chunk_index: 5,
      content: 'Appeals are accepted within 180 days.',
      section_id: 'appeals',
      section_title: 'Appeals',
      page_number: 8,
    }),
    // Furniture rows: stored for provenance, never rendered.
    row({ chunk_index: 6, chunk_type: 'header', content: 'Carrier Header Line' }),
    row({ chunk_index: 7, chunk_type: 'footer', content: '465 Medford Street, Boston' }),
    row({ chunk_index: 8, chunk_type: 'table_of_contents', content: 'Introduction — 3' }),
  ];
}

describe('buildReaderManual (structured)', () => {
  it('renders only the current parse version and no furniture', () => {
    const reader = buildReaderManual(doc({}), structuredRows());
    expect(reader.structured).toBe(true);
    const text = reader.chunks.map(c => c.content).join('\n');
    expect(text).not.toContain('OLD EXTRACTION GARBAGE');
    expect(text).not.toContain('Carrier Header Line');
    expect(text).not.toContain('465 Medford Street');
    expect(text).not.toContain('Introduction — 3');
  });

  it('rebuilds the hierarchical section list from chunk provenance', () => {
    const reader = buildReaderManual(doc({}), structuredRows());
    expect(reader.sections.map(s => s.title)).toEqual([
      'Introduction',
      'Timely Filing',
      'Appeals',
    ]);
    const appeals = reader.sections.find(s => s.id === 'appeals');
    expect(appeals?.parentTitle).toBe('Timely Filing');
    expect(appeals?.level).toBe(2);
    expect(reader.sections.find(s => s.id === 'timely-filing')?.page).toBe(7);
  });

  it('applies rename overrides to navigation and headings', () => {
    const reader = buildReaderManual(
      doc({ section_overrides: { 'timely-filing': { title: 'Filing Deadlines' } } }),
      structuredRows()
    );
    expect(reader.sections.map(s => s.title)).toContain('Filing Deadlines');
    const heading = reader.chunks.find(
      c => c.chunkType === 'heading' && c.sectionId === 'timely-filing'
    );
    expect(heading?.content).toBe('Filing Deadlines');
  });

  it('hides overridden sections with their content', () => {
    const reader = buildReaderManual(
      doc({ section_overrides: { appeals: { hidden: true } } }),
      structuredRows()
    );
    expect(reader.sections.map(s => s.id)).not.toContain('appeals');
    expect(reader.chunks.some(c => c.sectionId === 'appeals')).toBe(false);
  });

  it('merges a section into the previous one, keeping its content', () => {
    const reader = buildReaderManual(
      doc({ section_overrides: { appeals: { mergeIntoPrevious: true } } }),
      structuredRows()
    );
    expect(reader.sections.map(s => s.id)).not.toContain('appeals');
    const merged = reader.chunks.find(c => c.content.includes('180 days'));
    expect(merged?.sectionId).toBe('timely-filing');
    // The merged section's heading disappears; its body stays.
    expect(
      reader.chunks.some(c => c.chunkType === 'heading' && c.content === 'Appeals')
    ).toBe(false);
  });
});

describe('buildReaderManual (legacy fallback)', () => {
  it('opens flat-text documents through the same reader, marked unstructured', () => {
    const legacy = doc({
      parse_status: 'legacy',
      current_parse_version: 1,
      parse_confidence: null,
    });
    const rows = [
      row({
        chunk_index: 0,
        parse_version: 1,
        content: '# Eligibility\n\nMembers are eligible on the first of the month.',
      }),
      row({
        chunk_index: 1,
        parse_version: 1,
        content: '# Claims\n\nSubmit claims electronically when possible.',
      }),
    ];
    const reader = buildReaderManual(legacy, rows);
    expect(reader.structured).toBe(false);
    expect(reader.confidence).not.toBe('high');
    expect(reader.sections.map(s => s.title)).toEqual(['Eligibility', 'Claims']);
    expect(reader.chunks.some(c => c.content.includes('first of the month'))).toBe(true);
  });
});

describe('sectionsFromChunks / chunkFromRow', () => {
  it('parses meta JSON safely', () => {
    const chunk = chunkFromRow(
      row({
        chunk_type: 'table',
        meta: { rows: [['A', 'B'], ['1', '2']], headerRow: true, confidence: 'low' },
      })
    );
    expect(chunk.meta?.rows).toEqual([['A', 'B'], ['1', '2']]);
    expect(chunk.meta?.headerRow).toBe(true);
    expect(chunk.meta?.confidence).toBe('low');
  });

  it('ignores malformed meta without throwing', () => {
    const chunk = chunkFromRow(row({ meta: 'nonsense' as never }));
    expect(chunk.meta).toBeUndefined();
    expect(sectionsFromChunks([chunk])).toEqual([]);
  });
});

describe('manual ordering and labels', () => {
  it('orders current manuals before archived, newest effective first', () => {
    const a = doc({ title: 'A', doc_status: 'archived', effective_date: '2027-01-01' });
    const b = doc({ title: 'B', doc_status: 'current', effective_date: '2025-01-01' });
    const c = doc({ title: 'C', doc_status: 'current', effective_date: '2026-01-01' });
    expect(orderManuals([a, b, c]).map(d => d.title)).toEqual(['C', 'B', 'A']);
  });

  it('labels manual types and effective years', () => {
    expect(manualTypeLabel(doc({ manual_type: 'processing' }))).toBe('Processing manual');
    expect(manualTypeLabel(doc({ manual_type: null }))).toBe('Carrier manual');
    expect(effectiveYear(doc({ effective_date: '2026-01-01' }))).toBe('2026');
    expect(effectiveYear(doc({ effective_date: null, title: '2026 DD MA Manual' }))).toBe('2026');
  });
});

describe('insuranceQueryVariants', () => {
  it('expands carrier terminology with synonyms', () => {
    const variants = insuranceQueryVariants('timely filing');
    expect(variants[0]).toBe('timely filing');
    expect(variants).toContain('filing deadline');
    expect(variants.length).toBeLessThanOrEqual(4);
  });

  it('substitutes inside longer queries', () => {
    const variants = insuranceQueryVariants('crown frequency');
    expect(variants).toContain('crown frequency limitation');
  });

  it('passes unknown queries through unchanged', () => {
    expect(insuranceQueryVariants('missing tooth clause')).toContain('missing tooth clause');
    expect(insuranceQueryVariants('zebra')).toEqual(['zebra']);
    expect(insuranceQueryVariants('  ')).toEqual([]);
  });
});
