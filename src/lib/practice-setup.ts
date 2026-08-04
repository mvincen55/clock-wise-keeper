import { parseDocBlocks, type DocBlock } from '@/lib/doc-format';
import { stitchChunks } from '@/lib/doc-library';
import { createKnowledgeBlock, type KnowledgeBlockDraft, type KnowledgeKind } from '@/lib/knowledge';

export const PRACTICE_SETUP_ACTIONS = ['policy', 'procedure', 'source_only', 'exclude'] as const;
export type PracticeSetupAction = (typeof PRACTICE_SETUP_ACTIONS)[number];
export type PracticeSetupSuggestion = PracticeSetupAction | 'review';
export type PracticeSetupSourceStatus =
  | 'pending'
  | 'confirmed'
  | 'source_only'
  | 'excluded'
  | 'converted';

export const PRACTICE_SETUP_ACTION_LABELS: Record<PracticeSetupAction, string> = {
  policy: 'Turn into a Handbook policy',
  procedure: 'Turn into a Playbook procedure',
  source_only: 'Keep as source reference',
  exclude: 'Do not use in setup',
};

export const PRACTICE_SETUP_SUGGESTION_LABELS: Record<PracticeSetupSuggestion, string> = {
  ...PRACTICE_SETUP_ACTION_LABELS,
  review: 'Needs your decision',
};

export function knowledgeKindForSetupAction(action: PracticeSetupAction): KnowledgeKind | null {
  if (action === 'policy') return 'policy';
  if (action === 'procedure') return 'procedure';
  return null;
}

export function confidenceLabel(confidence: number): string {
  if (confidence >= 0.9) return 'High-confidence suggestion';
  if (confidence >= 0.65) return 'Likely suggestion';
  return 'Needs human review';
}

export function confidencePercent(confidence: number): number {
  return Math.max(0, Math.min(100, Math.round(confidence * 100)));
}

export function cleanSourceTitle(title: string): string {
  return title
    .replace(/\.(pdf|docx?|txt|md)$/i, '')
    .replace(/\s*\((copy|final|revised|updated|\d+)\)\s*$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitOversizedParagraph(text: string, maxLength = 3500): string[] {
  const normalized = text.trim();
  if (normalized.length <= maxLength) return [normalized];

  const sentences = normalized.split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let current = '';

  for (const sentence of sentences) {
    if (!sentence) continue;
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (candidate.length <= maxLength) {
      current = candidate;
      continue;
    }
    if (current) chunks.push(current);
    if (sentence.length <= maxLength) {
      current = sentence;
      continue;
    }
    for (let start = 0; start < sentence.length; start += maxLength) {
      chunks.push(sentence.slice(start, start + maxLength));
    }
    current = '';
  }

  if (current) chunks.push(current);
  return chunks.filter(Boolean);
}

function mapDocBlock(block: DocBlock, kind: KnowledgeKind): KnowledgeBlockDraft[] {
  if (block.type === 'heading') {
    return [createKnowledgeBlock('heading', block.text)];
  }
  if (block.type === 'bullets') {
    return [createKnowledgeBlock('bullet_list', block.items.join('\n'))];
  }
  if (block.type === 'numbered') {
    return [createKnowledgeBlock(kind === 'procedure' ? 'steps' : 'numbered_list', block.items.join('\n'))];
  }
  return splitOversizedParagraph(block.text).map(text => createKnowledgeBlock('paragraph', text));
}

export type SourceConversionResult = {
  title: string;
  summary: string;
  blocks: KnowledgeBlockDraft[];
  sourceCharacters: number;
};

/**
 * Deterministic conversion of already-extracted source text into an editable
 * governed draft. This never publishes content and does not claim the source
 * is correct. The human confirms classification before this function is used.
 */
export function sourceChunksToKnowledgeDraft(input: {
  sourceTitle: string;
  chunkContents: string[];
  kind: KnowledgeKind;
  declaredCharCount?: number;
}): SourceConversionResult {
  const text = stitchChunks(input.chunkContents).trim();
  if (!text) throw new Error('This source has no readable text. Re-upload it or paste the text first.');

  const sourceCharacters = input.declaredCharCount ?? text.length;
  const parsed = parseDocBlocks(text);
  const blocks = parsed.flatMap(block => mapDocBlock(block, input.kind));

  if (blocks.length === 0) throw new Error('Purple Envelope could not find usable content in this source.');
  if (sourceCharacters > 120_000 || blocks.length > 180) {
    throw new Error(
      'This source is too large to become one policy or procedure. Break it into focused sections during Practice Setup.',
    );
  }

  const firstParagraph = blocks.find(block => block.block_type === 'paragraph')?.plain_text ?? '';
  const summary = firstParagraph.length > 240
    ? `${firstParagraph.slice(0, 237).trimEnd()}…`
    : firstParagraph;

  return {
    title: cleanSourceTitle(input.sourceTitle) || 'Untitled office knowledge',
    summary,
    blocks,
    sourceCharacters,
  };
}

export function setupProgress(input: {
  pending: number;
  confirmed: number;
  sourceOnly: number;
  excluded: number;
  converted: number;
}): number {
  const total = input.pending + input.confirmed + input.sourceOnly + input.excluded + input.converted;
  if (total === 0) return 0;
  const decided = input.confirmed + input.sourceOnly + input.excluded + input.converted;
  return Math.round((decided / total) * 100);
}
