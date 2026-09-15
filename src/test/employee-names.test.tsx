import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  attendanceSubjectKey,
  buildEmployeeNameLookup,
  employeeNameForRow,
  isOwnAttendanceRow,
  useOrgEmployeeNames,
} from '@/hooks/useEmployeeNames';

vi.mock('@/hooks/useOrgContext', () => ({
  useOrgContext: () => ({ data: { org_id: 'office', employee_id: 'emp-megan', user_id: 'login-megan' } }),
}));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from: () => {
  let rows = [
    { org_id: 'office', id: 'emp-megan', user_id: 'login-megan', display_name: 'Megan Vincent', preferred_name: null, employment_status: 'active' },
    { org_id: 'office', id: 'emp-old', user_id: 'login-old', display_name: 'Former Staff', preferred_name: null, employment_status: 'archived' },
    { org_id: 'elsewhere', id: 'emp-x', user_id: 'login-x', display_name: 'Other Office', preferred_name: null, employment_status: 'active' },
  ];
  const query = {
    select: () => query,
    eq: (key: string, value: string) => { rows = rows.filter(row => row[key as keyof typeof row] === value); return query; },
    then: (resolve: (value: { data: typeof rows; error: null }) => void) => resolve({ data: rows, error: null }),
  };
  return query;
} } }));
afterEach(cleanup);

const employees = [
  { id: 'emp-megan', user_id: 'login-megan', display_name: 'Megan Vincent', preferred_name: null },
  { id: 'emp-sam', user_id: 'login-sam', display_name: 'Samantha Ortiz', preferred_name: 'Sam' },
  { id: 'emp-imported', user_id: null, display_name: 'Imported Only', preferred_name: null },
];
const lookup = buildEmployeeNameLookup(employees);
const self = { employee_id: 'emp-megan', user_id: 'login-megan' };

describe('naming the person behind an attendance row', () => {
  it('uses the employee record and prefers the preferred name', () => {
    expect(employeeNameForRow(lookup, { employee_id: 'emp-sam', user_id: 'login-sam' })).toBe('Sam');
    expect(employeeNameForRow(lookup, { employee_id: 'emp-megan', user_id: 'login-megan' })).toBe('Megan Vincent');
  });

  it('falls back to the login only for rows without an employee record', () => {
    expect(employeeNameForRow(lookup, { employee_id: null, user_id: 'login-sam' })).toBe('Sam');
    expect(employeeNameForRow(lookup, { employee_id: null, user_id: 'login-nobody' })).toBeNull();
    // Imported rows carry the importer's login; an unreadable employee must not borrow the importer's name.
    expect(employeeNameForRow(lookup, { employee_id: 'emp-unreadable', user_id: 'login-megan' })).toBeNull();
  });

  it('keeps imported staff apart from the manager who imported them', () => {
    const managerRow = { employee_id: 'emp-megan', user_id: 'login-megan' };
    const importedRow = { employee_id: 'emp-imported', user_id: 'login-megan' };
    expect(attendanceSubjectKey(managerRow)).not.toBe(attendanceSubjectKey(importedRow));
    expect(isOwnAttendanceRow(managerRow, self)).toBe(true);
    expect(isOwnAttendanceRow(importedRow, self)).toBe(false);
    expect(isOwnAttendanceRow({ employee_id: null, user_id: 'login-megan' }, self)).toBe(true);
  });

  it('reads every employee record in the office, archived ones included', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { result } = renderHook(() => useOrgEmployeeNames(), {
      wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.map(e => e.id)).toEqual(['emp-megan', 'emp-old']);
  });
});
