import { describe, it, expect } from 'vitest';
import { parseDocBlocks } from '@/lib/doc-format';

// The messy shape real PDF extractions produced: hard-wrapped lines,
// lone bullet marks on their own lines, floating page numbers, short
// standalone headings, letterhead blocks.
const MESSY = `Harelick Dental
Associates, LLC
Fairhaven, MA
Mission Statement
To fulfill the needs of patients by providing the highest quality of dental health services through a patient
oriented professional staff with the emphasis on individual attention.

1
Team Agreement
•
I agree to open and honest communications with all team members, while ensuring a supportive safe
environment for all.

•
I agree to avoid gossiping with other team members or patients.
`;

describe('parseDocBlocks — messy plain-text extractions', () => {
  const blocks = parseDocBlocks(MESSY);

  it('merges hard-wrapped lines into whole paragraphs', () => {
    const paras = blocks.filter(b => b.type === 'para');
    expect(paras[1]).toMatchObject({
      text: 'To fulfill the needs of patients by providing the highest quality of dental health services through a patient oriented professional staff with the emphasis on individual attention.',
    });
  });

  it('keeps the letterhead as a paragraph, not headings', () => {
    expect(blocks[0]).toMatchObject({
      type: 'para',
      text: 'Harelick Dental Associates, LLC Fairhaven, MA',
    });
  });

  it('detects short standalone lines before long content as headings', () => {
    const headings = blocks.filter(b => b.type === 'heading').map(b => b.text);
    expect(headings).toEqual(['Mission Statement', 'Team Agreement']);
  });

  it('drops floating page numbers', () => {
    expect(JSON.stringify(blocks)).not.toContain('"1"');
  });

  it('reassembles lone-bullet items into one list, wrapped lines joined', () => {
    const lists = blocks.filter(b => b.type === 'bullets');
    expect(lists).toHaveLength(1);
    expect(lists[0].items).toEqual([
      'I agree to open and honest communications with all team members, while ensuring a supportive safe environment for all.',
      'I agree to avoid gossiping with other team members or patients.',
    ]);
  });
});

describe('parseDocBlocks — markdown from the improved extractor', () => {
  it('renders headings, paragraphs, and both list kinds', () => {
    const blocks = parseDocBlocks(
      '# Policy Handbook\n\n## Attendance\n\nBe on time every day.\n\n- Call by 7am if sick\n- Find coverage\n\n1. First offense: warning\n2. Second offense: write-up\n'
    );
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Policy Handbook' },
      { type: 'heading', level: 2, text: 'Attendance' },
      { type: 'para', text: 'Be on time every day.' },
      { type: 'bullets', items: ['Call by 7am if sick', 'Find coverage'] },
      { type: 'numbered', items: ['First offense: warning', 'Second offense: write-up'] },
    ]);
  });
});
