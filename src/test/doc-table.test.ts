import { expect, it } from 'vitest';
import { parseDocBlocks } from '@/lib/doc-format';
import { blockText, outlineFromBlocks } from '@/lib/doc-library';
import { structureFromLegacyText } from '@/lib/manual-parse/legacy';
import { sourceChunksToKnowledgeDraft } from '@/lib/practice-setup';

const source = '## Reference\n\n| Code | Description | Fee |\n| --- | --- | --- |\n| A100 | First line<br>Second line | $12 |\n\n| A200 | Includes A \\| B | |\n\n## Next section\n\nOrdinary prose.';
it('retains table columns, multiline cells, escaped pipes, empty cells, and following headings', () => {
  const blocks = parseDocBlocks(source);
  expect(blocks[1]).toMatchObject({type:'table',rows:[['Code','Description','Fee'],['A100','First line\nSecond line','$12'],['A200','Includes A | B','']]});
  expect(blockText(blocks[1])).toContain('A200');
  expect(outlineFromBlocks(blocks).map(h=>h.text)).toEqual(['Reference','Next section']);
});
it('requires a matching separator instead of guessing table relationships', () => {
  expect(parseDocBlocks('| This | is prose |\n| not a table | really |').some(b=>b.type==='table')).toBe(false);
});
it('carries tables into draft and legacy structured readers', () => {
  expect(structureFromLegacyText(source).chunks.find(c=>c.chunkType==='table')?.meta?.rows).toHaveLength(3);
  const result=sourceChunksToKnowledgeDraft({sourceTitle:'Reference',chunkContents:[source],kind:'procedure'});
  expect(result.blocks.some(b=>b.block_type==='table')).toBe(true);
});
