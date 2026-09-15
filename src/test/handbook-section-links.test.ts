import { expect, it } from 'vitest';
import { handbookSectionLink } from '@/lib/handbook-section-links';

it('links recognized sections to existing workflows without guessing unrelated destinations', () => {
  expect(handbookSectionLink('Time Off Request Form')?.to).toBe('/pto');
  expect(handbookSectionLink('2. Huddle Meeting & Daily Preparation:')?.to).toBe('/morning-huddle');
  expect(handbookSectionLink('Checklists')?.to).toBe('/checklists');
  expect(handbookSectionLink('Cancellation and Broken Appointment Policy')?.to).toBe('/broken-appointments');
  expect(handbookSectionLink('VIP Scheduling Policy')?.to).toBe('/broken-appointments');
  expect(handbookSectionLink('Patient Time Off')).toBeNull();
});

it('opens the matching checklist tab for a role tasks heading instead of the handbook listing the tasks', () => {
  expect(handbookSectionLink('Clerical Tasks')).toEqual({ to: '/checklists?list=clerical', label: 'Open the Clerical checklist' });
  expect(handbookSectionLink('Clerical Logs/Checklists')?.to).toBe('/checklists?list=clerical');
  expect(handbookSectionLink('Clinical Tasks')).toEqual({ to: '/checklists?list=clinical', label: 'Open the Clinical checklists' });
  expect(handbookSectionLink('Office Manager and Management Tasks')).toEqual({ to: '/checklists?list=manager', label: 'Open the Manager checklist' });
  expect(handbookSectionLink('Manager Checklist')?.to).toBe('/checklists?list=manager');
  expect(handbookSectionLink('Employee Tasks')).toBeNull();
  expect(handbookSectionLink('Clinical Photos')).toBeNull();
});
