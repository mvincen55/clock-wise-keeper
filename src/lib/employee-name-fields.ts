export type EmployeeNameFields = { first_name: string; middle_initial: string; last_name: string };

type SavedName = { display_name: string; first_name?: string | null; middle_initial?: string | null; last_name?: string | null };

/** Legacy names are prefilled for review. Explicit fields preserve compound names on later edits. */
export function employeeNameFields(employee: SavedName): EmployeeNameFields {
  if (employee.first_name != null && employee.last_name != null) {
    return { first_name: employee.first_name, middle_initial: employee.middle_initial ?? '', last_name: employee.last_name };
  }
  const parts = employee.display_name.trim().split(',').map(part => part.trim());
  let given: string[];
  let last: string;
  if (parts.length === 2 && parts[1]) {
    last = parts[0];
    given = parts[1].split(/\s+/);
  } else {
    given = employee.display_name.trim().split(/\s+/);
    last = given.length > 1 ? given.pop()! : '';
  }
  const middle = given.length > 1 && /^\p{L}\.?$/u.test(given.at(-1)!) ? given.pop()!.replace('.', '') : '';
  return { first_name: given.join(' '), middle_initial: middle, last_name: last };
}

export function employeeNamePayload(fields: EmployeeNameFields) {
  const first_name = fields.first_name.trim();
  const last_name = fields.last_name.trim();
  const middle_initial = fields.middle_initial.trim().replace(/\.$/, '').toLocaleUpperCase();
  if (!first_name || !last_name) throw new Error('First and last name are required.');
  if (middle_initial && !/^\p{L}$/u.test(middle_initial)) throw new Error('Enter one letter for the middle initial.');
  return { first_name, last_name, middle_initial: middle_initial || null, display_name: [first_name, middle_initial, last_name].filter(Boolean).join(' ') };
}
