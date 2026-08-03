/**
 * Legacy adapter — view a flat-text document (pre-rebuild extraction, or a
 * pasted-text upload) through the structured reader.
 *
 * Old office_doc_chunks rows carry plain text with no metadata. Rather
 * than keep two readers alive, the old text runs through the existing
 * parseDocBlocks heuristics and comes out as the same section/chunk shape
 * the structured parser produces — with no page numbers, and confidence
 * capped at medium so the reader is honest that this is a best-effort
 * view until the manual is re-parsed from its PDF.
 */
import { parseDocBlocks } from '@/lib/doc-format';
import { slugify } from './parse';
import type { ManualChunk, ManualSection } from './types';

export interface LegacyStructured {
  sections: ManualSection[];
  chunks: ManualChunk[];
}

export function structureFromLegacyText(content: string): LegacyStructured {
  const blocks = parseDocBlocks(content);
  const sections: ManualSection[] = [];
  const chunks: ManualChunk[] = [];
  const usedIds = new Set<string>();
  const stack: ManualSection[] = [];
  let current: ManualSection | null = null;

  for (const block of blocks) {
    if (block.type === 'heading') {
      const level = Math.min(3, Math.max(1, block.level));
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      const parent = stack[stack.length - 1] ?? null;
      let id = slugify(block.text);
      if (usedIds.has(id)) id = `${id}-${sections.length}`;
      usedIds.add(id);
      current = {
        id,
        title: block.text,
        level,
        page: 0,
        parentId: parent?.id ?? null,
        parentTitle: parent?.title ?? null,
        order: sections.length,
        confidence: 'medium',
      };
      sections.push(current);
      stack.push(current);
      chunks.push({
        chunkIndex: chunks.length,
        chunkType: 'heading',
        content: block.text,
        sectionId: current.id,
        sectionTitle: current.title,
        parentSectionTitle: current.parentTitle,
        headingLevel: level,
        page: null,
        pageEnd: null,
      });
      continue;
    }
    const base = {
      chunkIndex: chunks.length,
      sectionId: current?.id ?? null,
      sectionTitle: current?.title ?? null,
      parentSectionTitle: current?.parentTitle ?? null,
      headingLevel: null,
      page: null,
      pageEnd: null,
    };
    if (block.type === 'bullets' || block.type === 'numbered') {
      chunks.push({
        ...base,
        chunkType: block.type === 'bullets' ? 'bullet_list' : 'numbered_list',
        content: block.items.join('\n'),
        meta: { items: block.items },
      });
    } else {
      chunks.push({ ...base, chunkType: 'paragraph', content: block.text });
    }
  }
  return { sections, chunks };
}
