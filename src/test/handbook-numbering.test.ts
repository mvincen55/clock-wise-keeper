import { describe, expect, it } from 'vitest';
import { parseDocBlocks } from '@/lib/doc-format';
import { headingTitle, isSelfNumbered, outlineFromBlocks, outlineNumbers, ownHeadingNumber } from '@/lib/doc-library';

// Synthetic outline only.
const outline = outlineFromBlocks(parseDocBlocks([
  '## Welcome', '### Mission', '### Team Agreement',
  '## Employee Policies', '### Emergency Plan', '#### Bloodborne Pathogens', '### Attendance Policy', '#### 1. Work Schedule', '#### 2. Huddle',
  '## Reference', '##### Codes',
].join('\n')));

describe('outlineNumbers', () => {
  it('numbers parts, sections, and sub-sections relative to the shallowest heading', () => {
    const numbers = outlineNumbers(outline);
    const byText = Object.fromEntries(outline.map(item => [item.text, numbers.get(item.id) ?? null]));
    expect(byText).toEqual({
      Welcome: '1', Mission: '1.1', 'Team Agreement': '1.2',
      'Employee Policies': '2', 'Emergency Plan': '2.1', 'Bloodborne Pathogens': '2.1.1', 'Attendance Policy': '2.2',
      '1. Work Schedule': '1', '2. Huddle': '2',
      Reference: '3', Codes: '3.1',
    });
  });
  it('gives a heading that carries its own number that number, so it is never numbered twice', () => {
    expect(ownHeadingNumber('2.11.3 Complaints of Sexual Harassment')).toBe('2.11.3');
    expect(ownHeadingNumber('IV. Sexual Harassment Investigation')).toBe('IV');
    expect(ownHeadingNumber('1) Work Schedule')).toBe('1');
    expect(ownHeadingNumber('I agree to be present')).toBeNull();
    expect(headingTitle('2.11.3 Complaints of Sexual Harassment')).toBe('Complaints of Sexual Harassment');
    expect(headingTitle('IV. Sexual Harassment Investigation')).toBe('Sexual Harassment Investigation');
    expect(headingTitle('X-rays and Imaging')).toBe('X-rays and Imaging');
    const numbered = outlineFromBlocks(parseDocBlocks(['# Employee Policies', '## 2.10 Equal Employment Opportunity', '## 2.11 Sexual Harassment Policy', '### 2.11.1 Introduction', '### Acknowledgment'].join('\n')));
    expect([...outlineNumbers(numbered).values()]).toEqual(['1', '2.10', '2.11', '2.11.1', '1.2.2']);
  });
  it('recognizes headings that already carry a number, roman numerals included', () => {
    expect(isSelfNumbered('IV. Sexual Harassment Investigation')).toBe(true);
    expect(isSelfNumbered('2.3 Fees')).toBe(true);
    expect(isSelfNumbered('Sequence A: Prophy')).toBe(false);
    expect(isSelfNumbered('X-rays and Imaging')).toBe(false);
  });
  it('returns an empty map for an empty outline', () => {
    expect(outlineNumbers([]).size).toBe(0);
  });
});

describe('horizontal rules', () => {
  it('drops rule lines instead of rendering them as paragraphs', () => {
    expect(parseDocBlocks(['Intro.', '', '-----', '', '***', '', 'Next.'].join('\n'))).toEqual([
      { type: 'para', text: 'Intro.' }, { type: 'para', text: 'Next.' },
    ]);
    expect(parseDocBlocks('| a | b |\n| --- | --- |\n| 1 | 2 |').some(b => b.type === 'table')).toBe(true);
  });
});
