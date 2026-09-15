/**
 * Policies and procedures an office already has inside its uploaded
 * documents (pure, testable).
 *
 * Until an office publishes governed policies, its handbook is the only copy
 * of its rules — and a handbook is full of procedures too. This splits a
 * parsed document into its sections, works out which heading level the
 * author used for sections (parts above it, sub-headings below it), and
 * classifies each section as a policy, a procedure, or reference material
 * from its own title, then its part, then its content. Nothing here is
 * office-specific: the vocabulary is generic dental-office language.
 */
import type { DocBlock } from '@/lib/doc-format';
import { blockText } from '@/lib/doc-library';
import { stripLiveFields } from '@/lib/handbook-live-fields';

export type SourceSectionKind = 'policy' | 'procedure' | 'reference';

export interface SourceSection {
  /** `${docId}:${blockIndex}` — stable across reloads, usable in a URL. */
  id: string;
  docId: string;
  docTitle: string;
  title: string;
  /** The part of the document the section sits in ("Workflow Policies"), if any. */
  part: string | null;
  kind: SourceSectionKind;
  /** Index of the section's heading block in the document. */
  blockIndex: number;
  /** Content after the heading, up to the next section or part heading. */
  blocks: DocBlock[];
  /** Lowercased title, part, and text for search. */
  searchText: string;
}

export interface SourceDoc {
  id: string;
  title: string;
  /** What an unclassifiable section in this document most likely is. */
  defaultKind: SourceSectionKind;
}

const STRONG_POLICY = /\b(policy|policies|agreement)\b/i;
const REFERENCE = /\b(abbreviations?|codes?|glossary|instruments?|products?|insurance plans?|carriers?|phone numbers?|contacts?|directory|definitions?|terminology|fee schedule|price list)\b/i;
const PROCEDURE = /\b(protocol|checklist|workflow|procedures?|process|steps?|how to|prep|set ?up|instructions?|guide|system|route slip|huddle|seating|appointments?|scheduling|tasks?|photos?|imaging|x-?rays?|sterilization|opening|closing|intake|check-?in|check-?out|verification|claims?|billing|posting|deposit|recall|confirmation|logs?)\b/i;
const POLICY = /\b(plan|mission|values?|culture|courtesy|harassment|attendance|time off|pto|leave|benefits?|compensation|payroll|pay|weather|expectations?|conduct|dress code|uniforms?|cell phones?|phones?|confidentiality|hipaa|osha|safety|discipline|termination|holidays?|breaks?|overtime|privacy|social media|smoking|drugs?|alcohol|welcome|introduction|discount)\b/i;

export const SOURCE_KIND_LABELS: Record<SourceSectionKind, string> = {
  policy: 'Policy',
  procedure: 'Procedure',
  reference: 'Reference',
};

function kindFromTitle(title: string): SourceSectionKind | null {
  if (STRONG_POLICY.test(title)) return 'policy';
  if (REFERENCE.test(title)) return 'reference';
  if (PROCEDURE.test(title)) return 'procedure';
  if (POLICY.test(title)) return 'policy';
  return null;
}

/** Steps and checklists read as procedures; prose reads as policy. */
function kindFromContent(blocks: DocBlock[]): SourceSectionKind | null {
  const content = blocks.filter(block => block.type !== 'heading');
  if (content.length === 0) return null;
  if (content.some(block => block.type === 'numbered')) return 'procedure';
  const listy = content.filter(block => block.type === 'bullets' || block.type === 'table').length;
  return listy * 2 > content.length ? null : 'policy';
}

export function classifySection(title: string, part: string | null, blocks: DocBlock[], fallback: SourceSectionKind): SourceSectionKind {
  return kindFromTitle(title) ?? (part ? kindFromTitle(part) : null) ?? kindFromContent(blocks) ?? fallback;
}

/**
 * The heading level the author used for sections: the shallowest level where
 * at least half the headings carry content of their own. Shallower headings
 * are parts; deeper ones are sub-headings inside a section.
 */
export function sectionLevel(blocks: DocBlock[]): number {
  const withContent = new Map<number, { total: number; content: number }>();
  blocks.forEach((block, index) => {
    if (block.type !== 'heading') return;
    const next = blocks[index + 1];
    const entry = withContent.get(block.level) ?? { total: 0, content: 0 };
    entry.total++;
    if (next && next.type !== 'heading') entry.content++;
    withContent.set(block.level, entry);
  });
  const levels = [...withContent.keys()].sort((a, b) => a - b);
  for (const level of levels) {
    const { total, content } = withContent.get(level)!;
    if (content * 2 >= total) return level;
  }
  return levels[levels.length - 1] ?? 1;
}

export function sourceSections(doc: SourceDoc, blocks: DocBlock[]): SourceSection[] {
  if (blocks.length === 0) return [];
  const level = sectionLevel(blocks);
  const sections: SourceSection[] = [];
  let part: string | null = null;
  let open: { title: string; part: string | null; blockIndex: number; blocks: DocBlock[] } | null = null;

  const close = () => {
    if (!open) return;
    const kind = classifySection(open.title, open.part, open.blocks, doc.defaultKind);
    const text = stripLiveFields(open.blocks.map(blockText).join(' '));
    sections.push({
      id: `${doc.id}:${open.blockIndex}`,
      docId: doc.id,
      docTitle: doc.title,
      title: open.title,
      part: open.part,
      kind,
      blockIndex: open.blockIndex,
      blocks: open.blocks,
      searchText: `${open.title} ${open.part ?? ''} ${text}`.toLowerCase(),
    });
    open = null;
  };

  blocks.forEach((block, index) => {
    if (block.type === 'heading' && block.level < level) {
      // A part with its own text (a mission statement, say) is also a section.
      close();
      part = block.text;
      const next = blocks[index + 1];
      if (next && next.type !== 'heading') open = { title: block.text, part: null, blockIndex: index, blocks: [] };
      return;
    }
    if (block.type === 'heading' && block.level === level) {
      close();
      open = { title: block.text, part, blockIndex: index, blocks: [] };
      return;
    }
    if (!open) {
      // Text before the first heading: the document's own introduction.
      open = { title: doc.title, part: null, blockIndex: index, blocks: [] };
    }
    open.blocks.push(block);
  });
  close();
  return sections;
}

/** The first sentence or so of a section, for catalog cards. */
export function sectionExcerpt(section: SourceSection, length = 160): string {
  const text = section.blocks
    .filter(block => block.type !== 'heading')
    .map(blockText)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > length ? `${text.slice(0, length).replace(/\s+\S*$/, '')}…` : text;
}

/** Group sections by part, keeping document order; sections without a part come first. */
export function groupSectionsByPart(sections: SourceSection[]): { part: string | null; sections: SourceSection[] }[] {
  const groups: { part: string | null; sections: SourceSection[] }[] = [];
  for (const section of sections) {
    const last = groups[groups.length - 1];
    if (last && last.part === section.part) last.sections.push(section);
    else groups.push({ part: section.part, sections: [section] });
  }
  return groups;
}

/** Where a section's document is read in full: the handbook reader, for handbook-scope documents. */
export function sectionReadingLink(section: Pick<SourceSection, 'docId' | 'blockIndex'>, libraryArea: string): string | null {
  return libraryArea === 'workplace' ? `/handbook?doc=${section.docId}&section=${section.blockIndex}` : null;
}
