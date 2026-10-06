import { isHonorificName } from '@/lib/employee-name';

/**
 * Titles the roster offers. A titled person is known by title and first name
 * everywhere a person is named ("Dr. Robert"); the full structured name stays
 * on the record for payroll and imports.
 */
export const EMPLOYEE_TITLES = ['Dr.'] as const;
export type EmployeeTitle = (typeof EMPLOYEE_TITLES)[number];

export type EmployeeNameFields = { title: string; first_name: string; middle_initial: string; last_name: string };

type SavedName = { display_name: string; title?: string | null; first_name?: string | null; middle_initial?: string | null; last_name?: string | null };

const TITLE_PREFIX = /^(?:dr|drs|doctor)\.?\s+/i;

/** Legacy names are prefilled for review. Explicit fields preserve compound names on later edits. */
export function employeeNameFields(employee: SavedName): EmployeeNameFields {
  const title = employee.title?.trim() || (isHonorificName(employee.display_name) ? 'Dr.' : '');
  if (employee.first_name != null && employee.last_name != null) {
    return { title, first_name: employee.first_name, middle_initial: employee.middle_initial ?? '', last_name: employee.last_name };
  }
  // A display name stored as "Dr. Robert" is a title and a given name: the
  // title is not a first name, and there is no surname in it to prefill.
  const stored = employee.display_name.trim().replace(TITLE_PREFIX, '');
  const parts = stored.split(',').map(part => part.trim());
  let given: string[];
  let last: string;
  if (parts.length === 2 && parts[1]) {
    last = parts[0];
    given = parts[1].split(/\s+/);
  } else {
    given = stored.split(/\s+/);
    last = !title && given.length > 1 ? given.pop()! : '';
  }
  const middle = given.length > 1 && /^\p{L}\.?$/u.test(given.at(-1)!) ? given.pop()!.replace('.', '') : '';
  return { title, first_name: given.join(' '), middle_initial: middle, last_name: last };
}

/**
 * The stored name from the explicit fields. With a title the display name is
 * "<title> <first name>" ("Dr. Robert"); without one it is "First M Last".
 */
export function employeeNamePayload(fields: EmployeeNameFields) {
  const title = fields.title.trim();
  const first_name = fields.first_name.trim();
  const last_name = fields.last_name.trim();
  const middle_initial = fields.middle_initial.trim().replace(/\.$/, '').toLocaleUpperCase();
  if (!first_name || !last_name) throw new Error('First and last name are required.');
  if (middle_initial && !/^\p{L}$/u.test(middle_initial)) throw new Error('Enter one letter for the middle initial.');
  if (title && !(EMPLOYEE_TITLES as readonly string[]).includes(title)) throw new Error('The only title offered is Dr.');
  const display_name = title ? `${title} ${first_name}` : [first_name, middle_initial, last_name].filter(Boolean).join(' ');
  return { title: title || null, first_name, last_name, middle_initial: middle_initial || null, display_name };
}
