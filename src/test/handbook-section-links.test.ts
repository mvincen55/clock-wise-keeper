import { expect, it } from 'vitest';
import { handbookSectionLink } from '@/lib/handbook-section-links';

it('links recognized sections to existing workflows without guessing unrelated destinations', () => {
  expect(handbookSectionLink('Time Off Request Form')?.to).toBe('/pto');
  expect(handbookSectionLink('2. Huddle Meeting & Daily Preparation:')?.to).toBe('/morning-huddle');
  expect(handbookSectionLink('Clerical Logs/Checklists')?.to).toBe('/checklists');
  expect(handbookSectionLink('Cancellation and Broken Appointment Policy')?.to).toBe('/broken-appointments');
  expect(handbookSectionLink('VIP Scheduling Policy')?.to).toBe('/broken-appointments');
  expect(handbookSectionLink('Patient Time Off') ).toBeNull();
});
