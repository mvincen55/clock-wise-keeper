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

// Extraction shapes that broke the employee handbook reader: bullet marks
// separated from their text, list numbers on their own line, and numbered
// labels that restarted a fresh list at "1." for every sub-section.
describe('parseDocBlocks — separated list marks and numbered labels', () => {
  it('assigns a run of lone bullet marks to the blank-separated items that follow', () => {
    const blocks = parseDocBlocks(
      ['Guidelines:', '•', '•', '•', 'Arrive on time and be ready to', 'start work.', '', 'Report any absence early.', '', 'Repeated tardiness is a performance issue.', '', 'Managers review each case.'].join('\n')
    );
    expect(blocks).toEqual([
      { type: 'para', text: 'Guidelines:' },
      { type: 'bullets', items: ['Arrive on time and be ready to start work.', 'Report any absence early.', 'Repeated tardiness is a performance issue.'] },
      { type: 'para', text: 'Managers review each case.' },
    ]);
  });

  it('keeps a blank-separated line that opens like the list items in the list', () => {
    const blocks = parseDocBlocks(['•', 'I agree to ask for help.', '', '•', 'I agree to accept responsibility.', '', 'I agree to protect the practice.', '', 'Signed below.'].join('\n'));
    expect(blocks).toEqual([
      { type: 'bullets', items: ['I agree to ask for help.', 'I agree to accept responsibility.', 'I agree to protect the practice.'] },
      { type: 'para', text: 'Signed below.' },
    ]);
  });

  it('joins a standalone number to the label beneath it as a nested sub-heading', () => {
    const blocks = parseDocBlocks(
      ['### Attendance Policy', 'The rules:', '1.', '', 'Work Schedule & Punctuality:', '•', 'Arrive on time.', '', '2.', '', 'Absences & Leave Requests:', '• Report sick leave early.'].join('\n')
    );
    expect(blocks).toEqual([
      { type: 'heading', level: 3, text: 'Attendance Policy' },
      { type: 'para', text: 'The rules:' },
      { type: 'heading', level: 4, text: '1. Work Schedule & Punctuality' },
      { type: 'bullets', items: ['Arrive on time.'] },
      { type: 'heading', level: 4, text: '2. Absences & Leave Requests' },
      { type: 'bullets', items: ['Report sick leave early.'] },
    ]);
  });

  it('keeps standalone numbers above ordinary sentences as numbered steps', () => {
    const blocks = parseDocBlocks(['Steps:', '1.', '', 'Call the lab and confirm the case', '', '2.', '', 'Check the route slip again.'].join('\n'));
    expect(blocks).toEqual([
      { type: 'para', text: 'Steps:' },
      { type: 'numbered', items: ['Call the lab and confirm the case', 'Check the route slip again.'] },
    ]);
  });

  it('promotes numbered labels that introduce bullets instead of restarting a list at 1', () => {
    const blocks = parseDocBlocks(['## Route Slip', '1. Correspondence & Documentation', '- Verify everything was received.', '2. Lab Cases', 'Confirm all lab cases have arrived.', '3. Insurance & Financials:', '- Verify that insurance is active.'].join('\n'));
    expect(blocks.map(b => (b.type === 'heading' ? `${b.level}:${b.text}` : b.type))).toEqual([
      '2:Route Slip', '3:1. Correspondence & Documentation', 'bullets', '3:2. Lab Cases', 'para', '3:3. Insurance & Financials', 'bullets',
    ]);
  });

  it('leaves a numbered list of short items alone, including a trailing one before prose', () => {
    const blocks = parseDocBlocks(['## Photos', '1. Facial Profile', '2. Smile Teeth Closed', '3. Lingual Anterior View', '', 'Tips:', '- Use retractors'].join('\n'));
    expect(blocks[1]).toEqual({ type: 'numbered', items: ['Facial Profile', 'Smile Teeth Closed', 'Lingual Anterior View'] });
    expect(blocks.filter(b => b.type === 'heading')).toHaveLength(1);
  });
});

describe('parseDocBlocks — Google Docs markdown exports', () => {
  it('unescapes punctuation, drops bold marks, empty headings, and export comments', () => {
    const blocks = parseDocBlocks(['# **Mission Statement**', '', '# ', '', '## **  ', 'Call Poison Control if necessary **1-800-222-1222**\\!', '', '  - Bring a copy of the \\*\\*form\\*\\* \\[signed\\]', '', '<!-- end list -->', '', '  - Inform a doctor before leaving.'].join('\n'));
    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Mission Statement' },
      { type: 'para', text: 'Call Poison Control if necessary 1-800-222-1222!' },
      { type: 'bullets', items: ['Bring a copy of the form [signed]', 'Inform a doctor before leaving.'] },
    ]);
  });

  it('turns short bold-only lines into nested sub-headings but keeps bold sentences as text', () => {
    const blocks = parseDocBlocks(['## Emergency Plan', '**Bloodborne Pathogen Exposure Control Plan**', '- Wash the area', '**When ALL call lights are lit, this means there is an emergency somewhere in the office and everyone should look for the person who needs help.**', '**SLH**', '- Delta Dental'].join('\n'));
    expect(blocks).toEqual([
      { type: 'heading', level: 2, text: 'Emergency Plan' },
      { type: 'heading', level: 3, text: 'Bloodborne Pathogen Exposure Control Plan' },
      { type: 'bullets', items: ['Wash the area'] },
      { type: 'para', text: 'When ALL call lights are lit, this means there is an emergency somewhere in the office and everyone should look for the person who needs help.' },
      { type: 'heading', level: 3, text: 'SLH' },
      { type: 'bullets', items: ['Delta Dental'] },
    ]);
  });

  it('records nesting depth from indentation as ranks, so 2- and 4-space nesting both work', () => {
    const blocks = parseDocBlocks(['  - Verify all correspondence has been received.', '  - When scheduling from a referral:', '      - Add a note in the appointment details.', '          - Include the date.', '      - Obtain the correspondence.'].join('\n'));
    expect(blocks).toEqual([
      { type: 'bullets', items: ['Verify all correspondence has been received.', 'When scheduling from a referral:', 'Add a note in the appointment details.', 'Include the date.', 'Obtain the correspondence.'], depths: [0, 0, 1, 2, 1] },
    ]);
  });

  it('accepts :-: separators, promotes a bold first row to the header, and unescapes cells', () => {
    const blocks = parseDocBlocks(['|  |  |  |', '| :-: | :-: | :-: |', '| \\*\\*Code\\*\\* | \\*\\*Procedure\\*\\* | \\*\\*Office Fee\\*\\* |', '| D0120 | Periodic Exam | $65 |', '| 1206 | Fluoride Package&#10;  - 2 treatments | $67 |'].join('\n'));
    expect(blocks).toEqual([
      { type: 'table', rows: [['Code', 'Procedure', 'Office Fee'], ['D0120', 'Periodic Exam', '$65'], ['1206', 'Fluoride Package\n- 2 treatments', '$67']], text: '| Code | Procedure | Office Fee |\n| D0120 | Periodic Exam | $65 |\n| 1206 | Fluoride Package<br>- 2 treatments | $67 |' },
    ]);
  });

  it('keeps a table with no header row headerless, and turns one-column tables into lists', () => {
    const blocks = parseDocBlocks(['## Tasks', '|  |  |', '| --- | --- |', '| Monday | Deposit |', '', 'Daily', '', '|  |', '| :-: |', '| Check the deposit slip |', '| Complete all tasks |', '', '| Weekly |', '| --- |', '| Post numbers |'].join('\n'));
    expect(blocks).toEqual([
      { type: 'heading', level: 2, text: 'Tasks' },
      { type: 'table', rows: [['', ''], ['Monday', 'Deposit']], text: '|  |  |\n| Monday | Deposit |', hasHeader: false },
      { type: 'para', text: 'Daily' },
      { type: 'bullets', items: ['Check the deposit slip', 'Complete all tasks'] },
      { type: 'heading', level: 3, text: 'Weekly' },
      { type: 'bullets', items: ['Post numbers'] },
    ]);
  });

  it('treats check-mark and en-dash bullets as bullets', () => {
    expect(parseDocBlocks(['✅ Ensure X-rays have been received.', '– Call the patient.'].join('\n'))).toEqual([
      { type: 'bullets', items: ['Ensure X-rays have been received.', 'Call the patient.'] },
    ]);
  });
});
