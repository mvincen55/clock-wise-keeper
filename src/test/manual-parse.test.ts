/**
 * The structured manual parser — the fix for the Insurance Desk showing a
 * carrier manual as one giant section of raw PDF text.
 *
 * A synthetic manual shaped like the real failure case (cover page, dotted
 * table of contents, repeated carrier header + address footer on every
 * page, page numbers, font-sized section headings, wrapped paragraphs,
 * bullet lists, a CDT-style table) drives the whole pipeline. The
 * assertions ARE the acceptance criteria: furniture never becomes
 * content, the TOC becomes navigation instead of body text, sections are
 * real, page provenance survives, and a structureless document falls
 * back to page navigation instead of pretending.
 */
import { describe, expect, it } from 'vitest';
import {
  applySectionOverrides,
  parseManual,
  type ManualChunk,
  type PdfPageText,
  type PdfTextItem,
} from '../lib/manual-parse';
import { validateStructured } from '../../supabase/functions/ingest-doc/structured';

// ---------------------------------------------------------------------------
// Fixture builder
// ---------------------------------------------------------------------------

const PAGE_W = 612;
const PAGE_H = 792;
const BODY = 10;

interface LineSpec {
  /** Single-item line text (omit when `items` carries the line). */
  t?: string;
  y: number;
  x?: number;
  size?: number;
  /** Multi-item line: [text, x] pairs (for TOC rows and table rows). */
  items?: [string, number][];
}

const width = (text: string, size: number) => text.length * size * 0.5;

function page(pageNumber: number, lines: LineSpec[]): PdfPageText {
  const items: PdfTextItem[] = [];
  for (const line of lines) {
    const size = line.size ?? BODY;
    if (line.items) {
      for (const [text, x] of line.items) {
        items.push({ str: text, x, y: line.y, width: width(text, size), fontSize: size });
      }
    } else {
      const text = line.t ?? '';
      items.push({
        str: text,
        x: line.x ?? 72,
        y: line.y,
        width: width(text, size),
        fontSize: size,
      });
    }
  }
  return { pageNumber, width: PAGE_W, height: PAGE_H, items };
}

const HEADER = 'Delta Dental of Massachusetts Processing Policy Manual';
const FOOTER_ADDRESS = '465 Medford Street, Boston, MA 02129';

/** A content page: repeated header, address footer, printed page number. */
function contentPage(pageNumber: number, body: LineSpec[]): PdfPageText {
  return page(pageNumber, [
    { t: HEADER, y: 40, size: 8 },
    ...body,
    { t: FOOTER_ADDRESS, y: 740, size: 8 },
    { t: String(pageNumber), y: 762, x: 300, size: 8 },
  ]);
}

const SECTION_TITLES = [
  'Introduction',
  'Summary of Added and Deleted CDT 2026 Codes',
  'Glossary of Terms',
  'General Policies',
  'Subscriber Certificate',
  'Utilization Management and Clinical Review',
  'General Clinical Criteria',
  'Fraud, Waste, and Abuse',
  'CDT 2026 Procedure Codes',
];

function tocRow(title: string, pageNo: number, y: number): LineSpec {
  return {
    y,
    items: [
      [title, 72],
      ['..........', 380],
      [String(pageNo), 520],
    ],
  };
}

/** The full synthetic manual (14 pages). */
function buildManual(): PdfPageText[] {
  const pages: PdfPageText[] = [];

  // Page 1 — cover. Title in display size; carrier + effective date small.
  pages.push(
    page(1, [
      { t: '2026 Processing Policy Manual', y: 200, size: 24 },
      { t: 'Delta Dental of Massachusetts', y: 260, size: 11 },
      { t: 'Effective January 1, 2026', y: 300, size: 10 },
    ])
  );

  // Page 2 — table of contents with dotted leaders.
  const sectionPages = [3, 4, 5, 6, 8, 9, 10, 11, 12];
  pages.push(
    page(2, [
      { t: 'Table of Contents', y: 100, size: 14 },
      ...SECTION_TITLES.map((title, i) => tocRow(title, sectionPages[i], 140 + i * 22)),
      { t: '2', y: 762, x: 300, size: 8 },
    ])
  );

  // Page 3 — Introduction: heading + wrapped paragraph + notice.
  pages.push(
    contentPage(3, [
      { t: 'Introduction', y: 120, size: 16 },
      { t: 'This manual describes the processing policies used by the plan when', y: 150 },
      { t: 'adjudicating claims for covered dental services.', y: 164 },
      { t: 'Note: This manual replaces all previous versions.', y: 200 },
    ])
  );

  // Page 4 — Summary of codes: numbered list.
  pages.push(
    contentPage(4, [
      { t: SECTION_TITLES[1], y: 120, size: 16 },
      { t: '1. D0396 was added effective January 1, 2026.', y: 150 },
      { t: '2. D2941 was deleted and replaced by D2940.', y: 164 },
    ])
  );

  // Page 5 — Glossary: definitions as paragraphs.
  pages.push(
    contentPage(5, [
      { t: 'Glossary of Terms', y: 120, size: 16 },
      { t: 'Adjudication means the processing of a claim to determine payment.', y: 150 },
      { t: 'Attachment means supporting documentation submitted with a claim.', y: 170 },
    ])
  );

  // Pages 6–7 — General Policies: bullets, a subsection, and a paragraph
  // that wraps across the page break mid-sentence.
  pages.push(
    contentPage(6, [
      { t: 'General Policies', y: 120, size: 16 },
      { t: 'Claims must include all of the following:', y: 150 },
      { t: '• A completed ADA claim form', y: 170, x: 90 },
      { t: '• The treating provider signature', y: 186, x: 90 },
      { t: '• Radiographs when required by policy', y: 202, x: 90 },
      { t: 'Coordination of Benefits', y: 240, size: 13 },
      { t: 'When a member has coverage under more than one plan, benefits are', y: 266 },
    ])
  );
  pages.push(
    contentPage(7, [
      { t: 'coordinated according to the primacy rules described in this section.', y: 120 },
      { t: 'Timely filing requires claims within twelve months of the date of service.', y: 150 },
    ])
  );

  // Page 8 — Subscriber Certificate.
  pages.push(
    contentPage(8, [
      { t: 'Subscriber Certificate', y: 120, size: 16 },
      { t: 'The subscriber certificate governs when this manual is silent.', y: 150 },
    ])
  );

  // Page 9 — Utilization Management.
  pages.push(
    contentPage(9, [
      { t: 'Utilization Management and Clinical Review', y: 120, size: 16 },
      { t: 'Predetermination is recommended for services expected to exceed $300.', y: 150 },
    ])
  );

  // Page 10 — Clinical criteria.
  pages.push(
    contentPage(10, [
      { t: 'General Clinical Criteria', y: 120, size: 16 },
      { t: 'Crowns are covered once per tooth in a sixty month period.', y: 150 },
    ])
  );

  // Page 11 — Fraud, waste, abuse.
  pages.push(
    contentPage(11, [
      { t: 'Fraud, Waste, and Abuse', y: 120, size: 16 },
      { t: 'Suspected fraud may be reported to the plan integrity unit.', y: 150 },
    ])
  );

  // Pages 12–13 — CDT codes: aligned three-column table.
  const tableRows: [string, string, string][] = [
    ['Code', 'Description', 'Limitation'],
    ['D0120', 'Periodic oral evaluation', 'Twice per calendar year'],
    ['D0274', 'Bitewings four films', 'Once per calendar year'],
    ['D2740', 'Crown porcelain ceramic', 'Once per sixty months'],
    ['D2750', 'Crown porcelain fused to metal', 'Once per sixty months'],
  ];
  pages.push(
    contentPage(12, [
      { t: 'CDT 2026 Procedure Codes', y: 120, size: 16 },
      ...tableRows.map(
        ([code, description, limit], i): LineSpec => ({
          y: 150 + i * 18,
          items: [
            [code, 72],
            [description, 160],
            [limit, 400],
          ],
        })
      ),
    ])
  );
  pages.push(
    contentPage(13, [
      { t: 'Codes not listed in this manual are processed by report.', y: 150 },
    ])
  );

  // Page 14 — trailing page.
  pages.push(
    contentPage(14, [{ t: 'Questions may be directed to provider services.', y: 150 }])
  );

  return pages;
}

const parsed = parseManual(buildManual());
const bodyChunks = parsed.chunks.filter(c => c.chunkType !== 'table_of_contents');
const allText = bodyChunks.map(c => c.content).join('\n');

// ---------------------------------------------------------------------------
// The acceptance criteria
// ---------------------------------------------------------------------------

describe('structured manual parsing (Delta-Dental-shaped fixture)', () => {
  it('detects many real sections — never one giant section', () => {
    expect(parsed.meta.navMode).toBe('sections');
    expect(parsed.meta.sectionCount).toBeGreaterThanOrEqual(9);
    for (const title of SECTION_TITLES) {
      expect(parsed.sections.map(s => s.title)).toContain(title);
    }
  });

  it('parses the table of contents into navigation data, not body text', () => {
    expect(parsed.meta.tocPages).toEqual([2]);
    expect(parsed.toc.length).toBe(SECTION_TITLES.length);
    expect(parsed.toc.map(e => e.title)).toEqual(SECTION_TITLES);
    expect(parsed.toc[0].targetPage).toBe(3);
    // Dotted leader lines never render as content.
    expect(allText).not.toMatch(/\.{4,}/);
    expect(allText).not.toContain('Table of Contents');
  });

  it('matches TOC entries to the pages their sections start on', () => {
    const glossary = parsed.sections.find(s => s.title === 'Glossary of Terms');
    expect(glossary?.page).toBe(5);
    const codes = parsed.sections.find(s => s.title === 'CDT 2026 Procedure Codes');
    expect(codes?.page).toBe(12);
    expect(parsed.meta.tocMatchRate).toBeGreaterThanOrEqual(0.8);
  });

  it('removes repeated headers, footers, and page numbers from content', () => {
    expect(allText).not.toContain(HEADER);
    expect(allText).not.toContain(FOOTER_ADDRESS);
    // Standalone printed page numbers don't survive as content lines.
    expect(bodyChunks.some(c => /^\d{1,3}$/.test(c.content.trim()))).toBe(false);
    expect(parsed.meta.removedHeaders).toContain(HEADER);
    expect(parsed.meta.removedFooters).toContain(FOOTER_ADDRESS);
  });

  it('never turns the carrier address into a section', () => {
    expect(parsed.sections.map(s => s.title)).not.toContain(FOOTER_ADDRESS);
    expect(allText).not.toContain('465 Medford Street');
  });

  it('keeps page provenance on every content chunk', () => {
    const intro = bodyChunks.find(c => c.content.includes('adjudicating claims'));
    expect(intro?.page).toBe(3);
    const crowns = bodyChunks.find(c => c.content.includes('sixty month period'));
    expect(crowns?.page).toBe(10);
  });

  it('merges hard-wrapped lines back into whole paragraphs', () => {
    const intro = bodyChunks.find(c => c.content.includes('adjudicating claims'));
    expect(intro?.content).toContain(
      'This manual describes the processing policies used by the plan when adjudicating claims'
    );
  });

  it('continues a mid-sentence paragraph across a page break', () => {
    const cob = bodyChunks.find(c => c.content.includes('primacy rules'));
    expect(cob?.content).toContain(
      'benefits are coordinated according to the primacy rules'
    );
    expect(cob?.page).toBe(6);
    expect(cob?.pageEnd).toBe(7);
  });

  it('reassembles bullet lists as real lists', () => {
    const bullets = bodyChunks.find(c => c.chunkType === 'bullet_list');
    expect(bullets?.meta?.items).toEqual([
      'A completed ADA claim form',
      'The treating provider signature',
      'Radiographs when required by policy',
    ]);
  });

  it('reassembles numbered lists as real lists', () => {
    const numbered = bodyChunks.find(c => c.chunkType === 'numbered_list');
    expect(numbered?.meta?.items?.[0]).toContain('D0396 was added');
  });

  it('recognizes notices as callouts', () => {
    const notice = bodyChunks.find(c => c.chunkType === 'notice');
    expect(notice?.content).toContain('replaces all previous versions');
  });

  it('preserves aligned tables with rows and a header row', () => {
    const table = bodyChunks.find(c => c.chunkType === 'table');
    expect(table).toBeDefined();
    expect(table?.meta?.headerRow).toBe(true);
    expect(table?.meta?.rows?.[0]).toEqual(['Code', 'Description', 'Limitation']);
    expect(table?.meta?.rows?.some(r => r[0] === 'D2740')).toBe(true);
    expect(table?.page).toBe(12);
  });

  it('nests subsections under their parent section', () => {
    const cob = parsed.sections.find(s => s.title === 'Coordination of Benefits');
    expect(cob).toBeDefined();
    expect(cob!.level).toBeGreaterThan(1);
    expect(cob!.parentTitle).toBe('General Policies');
  });

  it('scores the parse high-confidence', () => {
    expect(parsed.meta.confidence).toBe('high');
  });

  it('detects document metadata from the cover', () => {
    expect(parsed.meta.detectedTitle).toContain('2026 Processing Policy Manual');
    expect(parsed.meta.detectedCarrier).toBe('Delta Dental of Massachusetts');
    expect(parsed.meta.detectedManualType).toBe('processing');
    expect(parsed.meta.detectedEffectiveDate).toBe('2026-01-01');
  });

  it('chunks carry full section provenance', () => {
    const crowns = bodyChunks.find(c => c.content.includes('sixty month period'));
    expect(crowns?.sectionId).toBeTruthy();
    expect(crowns?.sectionTitle).toBe('General Clinical Criteria');
  });
});

// ---------------------------------------------------------------------------
// Honest failure: page-based fallback
// ---------------------------------------------------------------------------

describe('page-based fallback when structure cannot be detected', () => {
  const flat = Array.from({ length: 10 }, (_, i) =>
    page(i + 1, [
      { t: 'plain text with no headings at all, only running body copy that', y: 120 },
      { t: 'continues for a while and then stops.', y: 140 },
    ])
  );
  const fallback = parseManual(flat);

  it('falls back to page navigation instead of pretending one section', () => {
    expect(fallback.meta.navMode).toBe('pages');
    expect(fallback.meta.confidence).toBe('low');
    expect(fallback.sections.length).toBeGreaterThan(1);
    expect(fallback.sections[0].title).toBe('Page 1');
  });

  it('keeps content reachable through the page sections', () => {
    expect(fallback.chunks.every(c => c.sectionId !== null)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section overrides
// ---------------------------------------------------------------------------

describe('applySectionOverrides', () => {
  const sections = parsed.sections.slice(0, 4);

  it('renames without touching the others', () => {
    const { sections: out } = applySectionOverrides(sections, {
      [sections[1].id]: { title: 'Renamed' },
    });
    expect(out[1].title).toBe('Renamed');
    expect(out[0].title).toBe(sections[0].title);
    expect(out).toHaveLength(sections.length);
  });

  it('hides sections entirely', () => {
    const { sections: out, hidden } = applySectionOverrides(sections, {
      [sections[2].id]: { hidden: true },
    });
    expect(out.map(s => s.id)).not.toContain(sections[2].id);
    expect(hidden.has(sections[2].id)).toBe(true);
  });

  it('merges a section into the previous one, chasing chains', () => {
    const { sections: out, remap } = applySectionOverrides(sections, {
      [sections[1].id]: { mergeIntoPrevious: true },
      [sections[2].id]: { mergeIntoPrevious: true },
    });
    expect(out.map(s => s.id)).not.toContain(sections[1].id);
    expect(remap.get(sections[1].id)).toBe(sections[0].id);
    // The chain resolves all the way down to the surviving section.
    expect(remap.get(sections[2].id)).toBe(sections[0].id);
  });
});

// ---------------------------------------------------------------------------
// Server-side validation (shared shape with the edge function)
// ---------------------------------------------------------------------------

describe('validateStructured (ingest-doc)', () => {
  const wire = (chunks: Partial<ManualChunk>[], meta: Record<string, unknown>) => ({
    chunks,
    meta,
  });

  it('accepts the fixture parse', () => {
    const result = validateStructured(wire(parsed.chunks, parsed.meta as never));
    expect(result.chunks.length).toBe(parsed.chunks.length);
    expect(result.confidence).toBe('high');
    expect(result.sectionCount).toBe(parsed.meta.sectionCount);
  });

  it('rejects a long document that claims to be a single section', () => {
    expect(() =>
      validateStructured(
        wire(
          [{ chunkType: 'paragraph', content: 'x'.repeat(500) }],
          { navMode: 'sections', sectionCount: 1, pageCount: 40, confidence: 'high' }
        )
      )
    ).toThrow(/single section/);
  });

  it('accepts the page-navigation fallback for the same document', () => {
    const result = validateStructured(
      wire(
        [{ chunkType: 'paragraph', content: 'x'.repeat(500), page: 1 }],
        { navMode: 'pages', sectionCount: 40, pageCount: 40, confidence: 'low' }
      )
    );
    expect(result.navMode).toBe('pages');
  });

  it('rejects unknown chunk types and empty content', () => {
    expect(() =>
      validateStructured(wire([{ chunkType: 'mystery' as never, content: 'hello there' }], {}))
    ).toThrow(/unknown type/);
    expect(() =>
      validateStructured(wire([{ chunkType: 'paragraph', content: '   ' }], {}))
    ).toThrow(/no content/);
  });
});
