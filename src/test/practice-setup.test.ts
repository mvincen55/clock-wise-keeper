import { describe, expect, it } from 'vitest';
import {
  cleanSourceTitle,
  confidenceLabel,
  confidencePercent,
  knowledgeKindForSetupAction,
  setupProgress,
  sourceChunksToKnowledgeDraft,
} from '@/lib/practice-setup';

describe('Practice Setup action rules', () => {
  it('maps only policy and procedure decisions into governed knowledge kinds', () => {
    expect(knowledgeKindForSetupAction('policy')).toBe('policy');
    expect(knowledgeKindForSetupAction('procedure')).toBe('procedure');
    expect(knowledgeKindForSetupAction('source_only')).toBeNull();
    expect(knowledgeKindForSetupAction('exclude')).toBeNull();
  });

  it('uses understandable confidence language and clamps percentages', () => {
    expect(confidenceLabel(0.95)).toBe('High-confidence suggestion');
    expect(confidenceLabel(0.7)).toBe('Likely suggestion');
    expect(confidenceLabel(0.3)).toBe('Needs human review');
    expect(confidencePercent(1.4)).toBe(100);
    expect(confidencePercent(-0.2)).toBe(0);
  });

  it('counts every reviewed outcome toward setup progress', () => {
    expect(setupProgress({ pending: 2, confirmed: 1, sourceOnly: 1, excluded: 1, converted: 1 })).toBe(67);
    expect(setupProgress({ pending: 0, confirmed: 0, sourceOnly: 0, excluded: 0, converted: 0 })).toBe(0);
  });
});

describe('source document conversion', () => {
  it('cleans common upload noise from a draft title', () => {
    expect(cleanSourceTitle('Closing_Procedure (copy).pdf')).toBe('Closing Procedure');
    expect(cleanSourceTitle('Employee-Handbook.docx')).toBe('Employee Handbook');
  });

  it('turns structured procedure text into editable governed blocks', () => {
    const result = sourceChunksToKnowledgeDraft({
      sourceTitle: 'Office Closing Procedure.pdf',
      kind: 'procedure',
      chunkContents: [
        '# End of Day\n\nComplete the closeout before the last person leaves.\n\n1. Count cash\n2. Verify checks\n3. Seal the deposit bag',
      ],
    });

    expect(result.title).toBe('Office Closing Procedure');
    expect(result.summary).toBe('Complete the closeout before the last person leaves.');
    expect(result.blocks.map(block => block.block_type)).toEqual(['heading', 'paragraph', 'steps']);
    expect(result.blocks[2].plain_text).toBe('Count cash\nVerify checks\nSeal the deposit bag');
  });

  it('keeps numbered policy language as a numbered list instead of procedure steps', () => {
    const result = sourceChunksToKnowledgeDraft({
      sourceTitle: 'Attendance Policy',
      kind: 'policy',
      chunkContents: ['# Attendance\n\n1. Arrive on time\n2. Notify the office when delayed'],
    });

    expect(result.blocks[1].block_type).toBe('numbered_list');
  });

  it('stitches overlapping source chunks before parsing', () => {
    const result = sourceChunksToKnowledgeDraft({
      sourceTitle: 'Phones',
      kind: 'procedure',
      chunkContents: [
        '# Answering Phones\n\nAnswer within three rings and identify the office.',
        'identify the office.\n\nUse a warm, clear greeting.',
      ],
    });

    const combined = result.blocks.map(block => block.plain_text).join(' ');
    expect(combined.match(/identify the office/g)).toHaveLength(1);
    expect(combined).toContain('Use a warm, clear greeting.');
  });

  it('refuses to turn an oversized mixed manual into one giant governed item', () => {
    expect(() =>
      sourceChunksToKnowledgeDraft({
        sourceTitle: 'Everything Manual',
        kind: 'procedure',
        chunkContents: ['Readable source text.'],
        declaredCharCount: 120_001,
      }),
    ).toThrow('too large to become one policy or procedure');
  });

  it('refuses empty source text', () => {
    expect(() =>
      sourceChunksToKnowledgeDraft({
        sourceTitle: 'Empty',
        kind: 'policy',
        chunkContents: [],
      }),
    ).toThrow('no readable text');
  });
});
