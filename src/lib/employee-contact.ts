export const contactFields = ['phone', 'alternate_phone', 'address_line1', 'address_line2', 'city', 'state_region', 'postal_code', 'country', 'emergency_contact_name', 'emergency_contact_relationship', 'emergency_contact_phone', 'emergency_contact_alternate_phone'] as const;
export type EmployeeContactFields = Record<typeof contactFields[number], string>;
export function employeeContactFields(employee: Partial<Record<typeof contactFields[number], string | null>>): EmployeeContactFields {
  return Object.fromEntries(contactFields.map(key => [key, employee[key] ?? ''])) as EmployeeContactFields;
}

