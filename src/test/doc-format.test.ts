import { describe, it, expect } from 'vitest';
import { parseDocBlocks } from '@/lib/doc-format';

// The messy shape real PDF extractions produced: hard-wrapped lines,
// lone bullet marks on their own lines, floating page numbers, short
// standalone headings, letterhead blocks.
const MESSY = `Northfield Dental
Group, LLC
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
      text: 'Northfield Dental Group, LLC Fairhaven, MA',
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

// Fragments that leaked into the handbook's table of contents as fake
// headings (wrapped sentences, lone letters). Pinned so they stay fixed.
describe('parseDocBlocks — wrapped sentence fragments are not headings', () => {
  const headingsOf = (text: string) =>
    parseDocBlocks(text)
      .filter(b => b.type === 'heading')
      .map(b => (b as { text: string }).text);

  it('merges a short line whose continuation starts lowercase back into its sentence', () => {
    const blocks = parseDocBlocks(
      [
        'Front desk will be responsible for clearing the',
        'waiting room, checking the bathrooms and taking the daily schedule for attendance.',
      ].join('\n')
    );
    expect(blocks).toEqual([
      {
        type: 'para',
        text: 'Front desk will be responsible for clearing the waiting room, checking the bathrooms and taking the daily schedule for attendance.',
      },
    ]);
  });

  it('rejects fragments ending in a connective or auxiliary even before uppercase text', () => {
    const cases = [
      ['The back door near Pano machine is', 'Not a legal fire exit but obviously can still be used as one if needed.'],
      ['Such action can range from counseling to', 'Termination, depending on the severity of the conduct at issue overall.'],
      ['If the patient would like to keep the', 'Appointment, collect the estimated copay before seating them for care.'],
    ];
    for (const [fragment, next] of cases) {
      expect(headingsOf(`${fragment}\n${next}`)).toEqual([]);
    }
  });

  it('rejects a lowercase continuation even across a blank line', () => {
    expect(
      headingsOf(
        ['Illumitrac', '', 'is the outside service the office uses to verify insurance eligibility.'].join('\n')
      )
    ).toEqual([]);
  });

  it('never treats one- or two-character lines as headings', () => {
    expect(
      headingsOf(
        ['I', '', 'Understand and agree to the policies described in this employee handbook.'].join('\n')
      )
    ).toEqual([]);
  });

  it('never guesses headings inside a structured (markdown) document', () => {
    const blocks = parseDocBlocks(
      [
        '## Workflow Policies',
        '### Call Light System',
        '2nd buzz, go and get the person if needed w/in 5 minutes',
        'IF INSURANCE NOT RUNNING',
        'Flag the route slip and speak to the OM or AOM before seating the patient today.',
        'V1) NP Prophy (D1110), EL (D0140) Plus Appropriate Xrays',
        'No Same Day SRP',
        'Another long sentence follows here so the short lines above look heading-like.',
      ].join('\n')
    );
    const headings = blocks.filter(b => b.type === 'heading').map(b => (b as { text: string }).text);
    expect(headings).toEqual(['Workflow Policies', 'Call Light System']);
  });

  it('still detects real topic headings around the tightened rules', () => {
    expect(
      headingsOf(
        [
          'Attendance Policy',
          'Employees are expected to arrive on time for every scheduled shift and stay through closing duties.',
        ].join('\n')
      )
    ).toEqual(['Attendance Policy']);
    expect(
      headingsOf(
        ['Benefits', '', 'The office offers a retirement plan after one full year of employment.'].join('\n')
      )
    ).toEqual(['Benefits']);
    expect(
      headingsOf(['Emergency Procedures', '- Call 911 first', '- Notify the office manager'].join('\n'))
    ).toEqual(['Emergency Procedures']);
  });
});
