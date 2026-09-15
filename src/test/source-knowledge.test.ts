import { describe, expect, it } from 'vitest';
import { parseDocBlocks } from '@/lib/doc-format';
import { classifySection, groupSectionsByPart, sectionExcerpt, sectionLevel, sourceSections } from '@/lib/source-knowledge';

// A synthetic handbook shaped like real ones: parts, sections, sub-headings.
// No office's content appears here.
const HANDBOOK = [
  '## Mission Statement', 'We take care of people first.', '',
  '## Employee Policies',
  '### Attendance Policy', 'Arrive on time.', '#### 1. Work Schedule', '- Be ready at your shift.',
  '### Cell Phone Policy', 'Phones stay in lockers.',
  '## Workflow Policies',
  '### Seating Patients Protocol', '1. Greet the patient.', '2. Offer a blanket.',
  '### Call Light System', '| Light | Meaning |', '| --- | --- |', '| Red | Doctor needed |',
  '### Illuminate Plan', 'Members pay a yearly fee for cleanings.',
  '## Coaching and Tips',
  '### Commonly Used Abbreviations', '| Abbreviation | Definition |', '| --- | --- |', '| BWX | Bitewings |',
].join('\n');

const doc = { id: 'doc-1', title: 'Handbook', defaultKind: 'policy' as const };

describe('sourceSections', () => {
  const blocks = parseDocBlocks(HANDBOOK);
  const sections = sourceSections(doc, blocks);

  it('finds the heading level the author used for sections, treating shallower headings as parts', () => {
    expect(sectionLevel(blocks)).toBe(3);
    expect(sections.map(s => s.title)).toEqual([
      'Mission Statement', 'Attendance Policy', 'Cell Phone Policy', 'Seating Patients Protocol', 'Call Light System', 'Illuminate Plan', 'Commonly Used Abbreviations',
    ]);
    expect(sections.find(s => s.title === 'Attendance Policy')?.part).toBe('Employee Policies');
    expect(sections.find(s => s.title === 'Mission Statement')?.part).toBeNull();
  });

  it('keeps sub-headings inside their section and anchors each section at its heading block', () => {
    const attendance = sections.find(s => s.title === 'Attendance Policy')!;
    expect(attendance.blocks.map(b => b.type)).toEqual(['para', 'heading', 'bullets']);
    expect(blocks[attendance.blockIndex]).toEqual({ type: 'heading', level: 3, text: 'Attendance Policy' });
    expect(attendance.id).toBe('doc-1:3');
  });

  it('classifies by title, then part, then content, then the document default', () => {
    const kinds = Object.fromEntries(sections.map(s => [s.title, s.kind]));
    expect(kinds).toEqual({
      'Mission Statement': 'policy',
      'Attendance Policy': 'policy',
      'Cell Phone Policy': 'policy',
      'Seating Patients Protocol': 'procedure',
      'Call Light System': 'procedure',
      'Illuminate Plan': 'policy',
      'Commonly Used Abbreviations': 'reference',
    });
    expect(classifySection('Morning Routine', null, parseDocBlocks('1. Unlock\n2. Turn on lights'), 'policy')).toBe('procedure');
    expect(classifySection('Anything', null, [], 'procedure')).toBe('procedure');
  });

  it('groups sections by part in document order and writes short excerpts', () => {
    expect(groupSectionsByPart(sections).map(g => [g.part, g.sections.length])).toEqual([
      [null, 1], ['Employee Policies', 2], ['Workflow Policies', 3], ['Coaching and Tips', 1],
    ]);
    expect(sectionExcerpt(sections[0])).toBe('We take care of people first.');
    expect(sectionExcerpt(sections[3], 20)).toBe('Greet the patient.…');
  });

  it('treats a document with one heading level as a flat list of sections, and none as one section', () => {
    expect(sourceSections(doc, parseDocBlocks('## A\ntext\n## B\nmore')).map(s => s.title)).toEqual(['A', 'B']);
    expect(sourceSections(doc, parseDocBlocks('Just prose.')).map(s => [s.title, s.blockIndex])).toEqual([['Handbook', 0]]);
    expect(sourceSections(doc, [])).toEqual([]);
  });
});
