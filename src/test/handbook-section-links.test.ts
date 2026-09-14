import { expect, it } from 'vitest';
import { handbookNumberedHeading, handbookSectionLink } from '@/lib/handbook-section-links';

it('links recognized sections to existing workflows without guessing unrelated destinations', () => {
  expect(handbookSectionLink('Time Off Request Form')?.to).toBe('/pto');
  expect(handbookSectionLink('2. Huddle Meeting & Daily Preparation:')?.to).toBe('/morning-huddle');
  expect(handbookSectionLink('Clerical Logs/Checklists')?.to).toBe('/checklists');
  expect(handbookSectionLink('Patient Time Off') ).toBeNull();
});
it('joins a standalone number and section label without swallowing ordinary paragraphs', () => {
  expect(handbookNumberedHeading([{ type: 'para', text: '2.' }, { type: 'para', text: 'Huddle Meeting & Daily Preparation:' }], 0)).toEqual({ number: '2.', title: 'Huddle Meeting & Daily Preparation:' });
  expect(handbookNumberedHeading([{ type: 'para', text: '2.' }, { type: 'para', text: 'Ordinary policy sentence.' }], 0)).toBeNull();
});
